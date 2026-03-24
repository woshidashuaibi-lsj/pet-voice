// cloudfunctions/askTrainer/index.js
// 宠物训练师云函数 — Phase 3
//   - 记忆衰减过滤：时间 × 引用次数 × 来源权重 综合评分，低分记忆不注入
//   - 分层注入：第一层核心档案（必注入）+ 第二层近30天事件 + 第三层历史（按需）
//   - 主动追问：随机概率追问档案中缺失的重要字段
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ============================================================
// Phase 3：记忆衰减参数
// ============================================================
const MEMORY_SCORE_THRESHOLD = 40
const DECAY_HALF_LIFE        = 180
const MAX_MENTION_COUNT      = 20

// ============================================================
// Phase 3：主动追问 — 档案重要字段权重表
// ============================================================
const FIELD_WEIGHTS = {
  vaccine_date:    { label: '疫苗接种时间', weight: 9 },
  spayed:          { label: '是否已绝育',   weight: 8 },
  chronic_disease: { label: '慢性病史',     weight: 8 },
  allergy:         { label: '过敏史',       weight: 7 },
  diet_brand:      { label: '常用粮食品牌', weight: 5 },
  age:             { label: '具体年龄',     weight: 6 },
}

// ============================================================
// 主函数入口
// event 参数：
//   messages  Array   对话历史 [{role, content}]（多轮对话）
//   question  String  用户提问（兼容旧版单轮模式）
//   petName   String  宠物名称（可选）
//   petType   String  'cat' | 'dog'（可选）
//   petId     String  宠物文档 _id（可选，用于读取 memory）
// ============================================================
exports.main = async (event) => {
  const {
    messages = [],
    question = '',
    petName  = '',
    petType  = 'dog',
    petId    = '',
  } = event

  // 兼容旧版单轮调用（只传 question）
  const finalMessages = messages.length > 0
    ? messages
    : (question.trim() ? [{ role: 'user', content: question.trim() }] : [])

  if (finalMessages.length === 0) {
    return { success: false, error: '问题不能为空' }
  }

  try {
    // 取最后一条用户消息，用于分层注入的关键词检测
    const lastUserMsg = [...finalMessages].reverse().find(m => m.role === 'user')?.content || ''

    // 读取宠物记忆档案（Phase 3：分层读取 + 衰减过滤）
    const { memory, mentionUpdates, askField } = await loadPetMemoryLayered(petId, lastUserMsg)

    // 调用大模型（传入 askField 用于追问）
    const reply = await callMinimaxTrainer(finalMessages, petName, petType, memory, askField)

    // 异步更新被引用记忆的 mentionCount（不阻塞返回）
    if (mentionUpdates.length > 0) {
      updateMentionCounts(mentionUpdates).catch(e =>
        console.log('[askTrainer] mentionCount 更新失败（静默）:', e.message)
      )
    }

    return { success: true, reply }
  } catch (err) {
    console.error('[askTrainer] 调用失败:', err.message)
    return {
      success: false,
      error: err.message,
      reply: '抱歉，服务暂时无法响应，请稍后再试。',
    }
  }
}

// ============================================================
// Phase 3：分层读取宠物记忆
// 返回：{ memory, mentionUpdates, askField }
// ============================================================
async function loadPetMemoryLayered(petId, userQuestion) {
  const empty = { memory: null, mentionUpdates: [], askField: null }

  try {
    const db = cloud.database()

    // Step 1：解析 petId
    let resolvedPetId = petId
    if (!resolvedPetId) {
      const res = await db.collection('pets').limit(1).get()
      resolvedPetId = res.data[0]?._id || null
    }
    if (!resolvedPetId) return empty

    // Step 2：读取 snapshot（第一层：核心档案）
    let snapshot = null
    try {
      const snapRes = await db.collection('pet_memory_snapshot')
        .where({ petId: resolvedPetId })
        .limit(1)
        .get()
      snapshot = snapRes.data[0] || null
    } catch (e) { /* 集合不存在 */ }

    // 降级：snapshot 不存在则读旧版 pets.memory
    if (!snapshot) {
      try {
        const petRes = await db.collection('pets').doc(resolvedPetId).get()
        const legacyMemory = petRes.data?.memory || null
        if (legacyMemory) {
          console.log('[askTrainer] 降级使用 pets.memory（旧版）')
          return { memory: legacyMemory, mentionUpdates: [], askField: null }
        }
      } catch (e) { /* 忽略 */ }
      return empty
    }

    // Step 3：第一层记忆经过衰减过滤
    const filteredSnapshot = applyDecayFilter(snapshot)

    // Step 4：第二层 — 近30天事件（每次都注入）
    let recentEvents = []
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    try {
      const recentRes = await db.collection('pet_memory_events')
        .where({
          petId: resolvedPetId,
          createdAt: db.command.gte(new Date(thirtyDaysAgo)),
        })
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
      recentEvents = recentRes.data || []
    } catch (e) { /* events 集合不存在 */ }

    // Step 5：第三层 — 历史事件（仅当用户问历史时加载）
    let historyEvents = []
    const isAskingHistory = /以前|历史|之前|过去|曾经|以往|什么时候|多久/.test(userQuestion || '')
    if (isAskingHistory) {
      try {
        const histRes = await db.collection('pet_memory_events')
          .where({ petId: resolvedPetId })
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get()
        const recentIds = new Set(recentEvents.map(e => e._id))
        historyEvents = histRes.data.filter(e => !recentIds.has(e._id))
        console.log('[askTrainer] 加载历史事件:', historyEvents.length, '条')
      } catch (e) { /* 忽略 */ }
    }

    const mentionUpdates = [
      ...recentEvents.map(e => e._id),
      ...historyEvents.map(e => e._id),
    ].filter(Boolean)

    const memory = buildLayeredMemory(filteredSnapshot, recentEvents, historyEvents)
    const askField = shouldAskForInfo(snapshot)

    return { memory, mentionUpdates, askField }

  } catch (e) {
    console.log('[askTrainer] loadPetMemoryLayered 失败:', e.message)
    return empty
  }
}

// ============================================================
// Phase 3：记忆衰减分数计算
// ============================================================
function calcMemoryScore(item) {
  if (typeof item === 'string') return 80

  const confidence   = item.confidence   || 80
  const mentionCount = item.mentionCount || 0
  const createdAt    = item.createdAt    || item.date

  let decay = 1
  if (createdAt) {
    const daysSince = (Date.now() - new Date(createdAt)) / 86400000
    decay = Math.exp(-daysSince / DECAY_HALF_LIFE)
  }

  const reinforcement = Math.min(1 + Math.min(mentionCount, MAX_MENTION_COUNT) * 0.1, 2.0)

  const sourceWeightMap = {
    vet_confirmed: 1.5,
    user_stated:   1.0,
    inferred:      0.6,
  }
  const sourceWeight = sourceWeightMap[item.source] || 1.0

  return confidence * decay * reinforcement * sourceWeight
}

function applyDecayFilter(snapshot) {
  const filterArr = (arr) => {
    if (!Array.isArray(arr)) return []
    return arr.filter(item => calcMemoryScore(item) > MEMORY_SCORE_THRESHOLD)
  }

  return {
    health:      filterArr(snapshot.health),
    behavior:    filterArr(snapshot.behavior),
    diet:        filterArr(snapshot.diet),
    personality: snapshot.personality || [],
    updatedAt:   snapshot.updatedAt,
  }
}

// ============================================================
// Phase 3：将三层数据合并为注入用的 memory 对象
// ============================================================
function buildLayeredMemory(snapshot, recentEvents, historyEvents) {
  const memory = {
    health:        [...(snapshot.health      || [])],
    behavior:      [...(snapshot.behavior    || [])],
    diet:          [...(snapshot.diet        || [])],
    personality:   [...(snapshot.personality || [])],
    events:        [],
    recentEvents:  [],
    historyEvents: [],
  }

  for (const ev of recentEvents) {
    memory.recentEvents.push({ content: ev.content, category: ev.category, date: ev.date })
  }

  for (const ev of historyEvents) {
    memory.historyEvents.push({ content: ev.content, category: ev.category, date: ev.date })
  }

  return memory
}

// ============================================================
// Phase 3：主动追问 — 检测缺失字段
// ============================================================
function shouldAskForInfo(snapshot) {
  if (!snapshot) return null

  const missing = Object.keys(FIELD_WEIGHTS).filter(k => {
    const val = snapshot[k]
    return val === undefined || val === null || val === ''
  })

  if (missing.length === 0) return null
  if (Math.random() > 0.3) return null

  missing.sort((a, b) => FIELD_WEIGHTS[b].weight - FIELD_WEIGHTS[a].weight)
  return FIELD_WEIGHTS[missing[0]].label
}

// ============================================================
// Phase 3：异步更新被引用事件的 mentionCount（+1）
// ============================================================
async function updateMentionCounts(eventIds) {
  if (!eventIds || eventIds.length === 0) return
  const db = cloud.database()
  const tasks = eventIds.map(id =>
    db.collection('pet_memory_events').doc(id).update({
      data: { mentionCount: db.command.inc(1) },
    }).catch(() => {})
  )
  await Promise.allSettled(tasks)
}

// ============================================================
// Phase 3：分层构建 memory context 注入 system prompt
// ============================================================
function buildMemoryContext(petName, memory, askField) {
  if (!memory) return buildAskFieldSuffix(petName, askField)

  const parts = []

  // ── 第一层：核心档案 ──────────────────────────────────
  const coreLines = []

  if (memory.behavior && memory.behavior.length > 0) {
    const items = memory.behavior.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) coreLines.push(`已知行为问题：${items.slice(0, 3).join('；')}`)
  }
  if (memory.personality && memory.personality.length > 0) {
    coreLines.push(`性格特点：${memory.personality.join('、')}`)
  }
  if (memory.diet && memory.diet.length > 0) {
    const items = memory.diet.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) coreLines.push(`饮食偏好：${items.slice(0, 3).join('；')}`)
  }
  if (memory.health && memory.health.length > 0) {
    const items = memory.health.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) coreLines.push(`健康状况：${items.slice(0, 3).join('；')}`)
  }

  if (coreLines.length > 0) {
    parts.push(`【核心档案】\n${coreLines.join('\n')}`)
  }

  // ── 第二层：近30天动态 ────────────────────────────────
  if (memory.recentEvents && memory.recentEvents.length > 0) {
    const recentLines = memory.recentEvents
      .slice(0, 5)
      .map(e => `· ${e.date || ''} ${e.content}`.trim())
    parts.push(`【近期动态（最近30天）】\n${recentLines.join('\n')}`)
  }

  // ── 第三层：历史归档（按需） ──────────────────────────
  if (memory.historyEvents && memory.historyEvents.length > 0) {
    const histLines = memory.historyEvents
      .slice(0, 8)
      .map(e => `· ${e.date || ''} ${e.content}`.trim())
    parts.push(`【历史记录】\n${histLines.join('\n')}`)
  }

  if (parts.length === 0) return buildAskFieldSuffix(petName, askField)

  let context = `\n\n【关于${petName}的已知信息】\n${parts.join('\n\n')}`
  context += `\n\n请结合以上背景提供针对性的训练方案。`
  context += buildAskFieldSuffix(petName, askField)

  return context
}

function buildAskFieldSuffix(petName, askField) {
  if (!askField) return ''
  return `\n\n【追问指令】在本次回复末尾，以自然口吻顺带问一下主人：「顺便想了解一下，${petName}的${askField}是多少呢？记录下来方便给出更准确的建议～」请一定要加上，语气轻松自然。`
}

// ============================================================
// 调用 MiniMax Chat Completion V2（支持多轮对话）
// ============================================================
function callMinimaxTrainer(userMessages, petName, petType, memory, askField) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      reject(new Error('未配置 MINIMAX_API_KEY 环境变量'))
      return
    }

    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'
    const petDesc = petName ? `主人的${petTypeText}叫 ${petName}` : `主人养了一只${petTypeText}`

    // Phase 3：分层注入记忆背景 + 追问指令
    const memoryContext = buildMemoryContext(petName || '这只宠物', memory, askField)

    const systemPrompt = `你是一位专业、耐心的宠物行为训练师，熟悉犬猫行为学和正向强化训练方法。
${petDesc}。${memoryContext}

你的职责：
1. 基于正向强化原则（奖励好行为，忽略不好行为，绝不体罚）给出训练建议
2. 回答要实操性强，给出具体步骤，而不是泛泛的理论
3. 如有需要，说明训练所需的工具（零食大小、响片、牵引绳等）
4. 说明需要多长时间能看到效果，设定合理预期
5. 对于行为问题，先分析可能的原因，再给出解决方案
6. 回复亲切自然，适当使用 emoji，让内容易于理解
7. 训练进度因宠物个体差异而异，要告知用户保持耐心

回复格式：
- 先简短说明这个行为/问题的本质原因（1-2句）
- 给出 3-5 个具体训练步骤（分点列出）
- 最后给 1-2 条额外小贴士
- 总字数控制在 250 字以内，言简意赅`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...userMessages,
    ]

    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages,
      temperature: 0.5,
      max_tokens: 600,
    })

    const options = {
      hostname: 'api.minimax.chat',
      path: '/v1/text/chatcompletion_v2',
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        console.log('[askTrainer] HTTP 状态码:', res.statusCode)
        try {
          const resp = JSON.parse(data)

          if (resp.base_resp && resp.base_resp.status_code !== 0) {
            reject(new Error(`MiniMax API 错误: ${resp.base_resp.status_code} - ${resp.base_resp.status_msg}`))
            return
          }

          const text = resp.choices?.[0]?.message?.content || ''
          if (!text) {
            reject(new Error('返回内容为空'))
            return
          }

          console.log('[askTrainer] 回复:', text.slice(0, 100))
          resolve(text)
        } catch (e) {
          reject(new Error('解析响应失败: ' + e.message))
        }
      })
    })

    req.on('error', e => reject(new Error('网络请求失败: ' + e.message)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时（>30s）'))
    })

    req.write(body)
    req.end()
  })
}
