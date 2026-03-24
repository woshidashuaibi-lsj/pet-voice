// cloudfunctions/askVet/index.js
// 宠物健康问诊云函数 — Phase 3
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
// 衰减分数低于此值的记忆不注入 prompt
const MEMORY_SCORE_THRESHOLD = 40
// 时间衰减半衰期（天）：180天后分数衰减到37%
const DECAY_HALF_LIFE = 180
// 注入 prompt 时，记录被引用，下次衰减更慢（每次 +1，上限 20）
const MAX_MENTION_COUNT = 20

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
//   messages  Array   对话历史（{role, content} 数组）
//   petName   String  宠物名称（可选）
//   petType   String  'cat' | 'dog'（可选）
//   petId     String  宠物文档 _id（可选，用于读取 memory）
// ============================================================
exports.main = async (event) => {
  const {
    messages = [],
    petName  = '',
    petType  = 'cat',
    petId    = '',
  } = event

  if (!messages || messages.length === 0) {
    return { success: false, error: '消息不能为空' }
  }

  try {
    // 取最后一条用户消息，用于分层注入的关键词检测
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''

    // 读取宠物记忆档案（Phase 3：分层读取 + 衰减过滤）
    const { memory, mentionUpdates, askField } = await loadPetMemoryLayered(petId, lastUserMsg)

    // 调用大模型（传入 askField 用于追问）
    const reply = await callMinimaxText(messages, petName, petType, memory, askField)

    // 异步更新被引用记忆的 mentionCount（不阻塞返回）
    if (mentionUpdates.length > 0) {
      updateMentionCounts(mentionUpdates).catch(e =>
        console.log('[askVet] mentionCount 更新失败（静默）:', e.message)
      )
    }

    return { success: true, reply }
  } catch (err) {
    console.error('[askVet] 调用失败:', err.message)
    return {
      success: false,
      error: err.message,
      reply: '抱歉，服务暂时无法响应，请稍后再试。如遇紧急情况请直接前往宠物医院。',
    }
  }
}

// ============================================================
// Phase 3：分层读取宠物记忆
// 返回：{ memory, mentionUpdates, askField }
//   memory         - 经过衰减过滤的分层记忆对象
//   mentionUpdates - 本次被注入的事件 _id 列表（用于 +1 引用次数）
//   askField       - 本次建议追问的缺失字段（可能为 null）
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
          console.log('[askVet] 降级使用 pets.memory（旧版）')
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
        // 去掉已在 recentEvents 中的条目
        const recentIds = new Set(recentEvents.map(e => e._id))
        historyEvents = histRes.data.filter(e => !recentIds.has(e._id))
        console.log('[askVet] 加载历史事件:', historyEvents.length, '条')
      } catch (e) { /* 忽略 */ }
    }

    // 合并过滤后的记忆，收集被引用的事件 id
    const mentionUpdates = [
      ...recentEvents.map(e => e._id),
      ...historyEvents.map(e => e._id),
    ].filter(Boolean)

    const memory = buildLayeredMemory(filteredSnapshot, recentEvents, historyEvents)

    // Step 6：检测缺失字段，决定是否追问
    const askField = shouldAskForInfo(snapshot)

    return { memory, mentionUpdates, askField }

  } catch (e) {
    console.log('[askVet] loadPetMemoryLayered 失败:', e.message)
    return empty
  }
}

// ============================================================
// Phase 3：记忆衰减分数计算
// score = confidence × 时间衰减 × 引用强化 × 来源权重
// ============================================================
function calcMemoryScore(item) {
  if (typeof item === 'string') return 80  // 旧格式字符串默认中等分

  const confidence    = item.confidence    || 80
  const mentionCount  = item.mentionCount  || 0
  const createdAt     = item.createdAt     || item.date

  // 时间衰减：e^(-days/180)
  let decay = 1
  if (createdAt) {
    const daysSince = (Date.now() - new Date(createdAt)) / 86400000
    decay = Math.exp(-daysSince / DECAY_HALF_LIFE)
  }

  // 引用次数强化：每被引用一次 +10%，上限 +200%
  const reinforcement = Math.min(1 + Math.min(mentionCount, MAX_MENTION_COUNT) * 0.1, 2.0)

  // 来源权重
  const sourceWeightMap = {
    vet_confirmed: 1.5,   // 医生确诊
    user_stated:   1.0,   // 用户陈述（默认）
    inferred:      0.6,   // 系统推断
  }
  const sourceWeight = sourceWeightMap[item.source] || 1.0

  return confidence * decay * reinforcement * sourceWeight
}

// 对 snapshot 中每个维度的条目进行衰减过滤
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
  // 第一层：snapshot 核心档案
  const memory = {
    health:      [...(snapshot.health      || [])],
    behavior:    [...(snapshot.behavior    || [])],
    diet:        [...(snapshot.diet        || [])],
    personality: [...(snapshot.personality || [])],
    events:      [],
    recentEvents:  [],  // 第二层：近30天
    historyEvents: [],  // 第三层：历史
  }

  // 第二层：近30天事件按类别分组追加
  for (const ev of recentEvents) {
    memory.recentEvents.push({ content: ev.content, category: ev.category, date: ev.date })
  }

  // 第三层：历史事件（按需）
  for (const ev of historyEvents) {
    memory.historyEvents.push({ content: ev.content, category: ev.category, date: ev.date })
  }

  return memory
}

// ============================================================
// Phase 3：主动追问 — 检测缺失字段，随机概率返回追问字段
// ============================================================
function shouldAskForInfo(snapshot) {
  if (!snapshot) return null

  // 检查 snapshot 中哪些重要字段缺失
  const missing = Object.keys(FIELD_WEIGHTS).filter(k => {
    const val = snapshot[k]
    return val === undefined || val === null || val === ''
  })

  if (missing.length === 0) return null

  // 70% 概率不追问，避免每次都问（用户体验）
  if (Math.random() > 0.3) return null

  // 按权重排序，取最重要的缺失字段
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
    }).catch(() => {/* 单条失败不影响 */})
  )
  await Promise.allSettled(tasks)
}

// ============================================================
// Phase 3：分层构建 memory context 字符串注入 system prompt
// 第一层：核心档案（~200 Token，必注入）
// 第二层：近期动态（近30天，~150 Token，必注入）
// 第三层：历史归档（~200 Token，按需注入）
// ============================================================
function buildMemoryContext(petName, memory, askField) {
  if (!memory) return buildAskFieldSuffix(askField)

  const parts = []

  // ── 第一层：核心档案 ──────────────────────────────────
  const coreLines = []

  if (memory.diet && memory.diet.length > 0) {
    const items = memory.diet.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) coreLines.push(`饮食偏好：${items.slice(0, 3).join('；')}`)
  }
  if (memory.behavior && memory.behavior.length > 0) {
    const items = memory.behavior.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) coreLines.push(`行为特征：${items.slice(0, 3).join('；')}`)
  }
  if (memory.personality && memory.personality.length > 0) {
    coreLines.push(`性格：${memory.personality.join('、')}`)
  }
  if (memory.health && memory.health.length > 0) {
    const items = memory.health.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) coreLines.push(`健康背景：${items.slice(0, 3).join('；')}`)
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

  if (parts.length === 0) return buildAskFieldSuffix(askField)

  let context = `\n\n【关于${petName}的已知信息】\n${parts.join('\n\n')}`
  context += `\n\n请结合以上背景提供个性化建议，如有关联请主动说明。`
  context += buildAskFieldSuffix(askField)

  return context
}

// 构建追问指令字符串（拼在 system prompt 末尾）
function buildAskFieldSuffix(askField) {
  if (!askField) return ''
  return `\n\n【追问指令】在本次回复末尾，以自然口吻顺带问一下主人：「顺便问一下，${askField}是多少呢？记录一下方便以后更好地帮助${askField.includes('绝育') ? '它' : '它'}～」请一定要加上，语气要轻松自然。`
}

// ============================================================
// 调用 MiniMax Chat Completion V2（纯文本）
// ============================================================
function callMinimaxText(userMessages, petName, petType, memory, askField) {
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

    const systemPrompt = `你是一位专业、温柔的宠物健康顾问，拥有丰富的猫咪和狗狗护理经验。
${petDesc}。${memoryContext}

你的职责：
1. 用通俗易懂的语言解答主人关于宠物健康、护理、饮食、行为的问题
2. 提供专业但不过度医疗化的建议
3. 遇到严重症状时，明确提醒主人需要就医，并告知应该看哪类科室
4. 回复要简洁实用，重点突出，适当使用 emoji 让内容更亲切
5. 如不确定，诚实告知并建议就医
6. 不要过度恐吓，也不要轻描淡写严重问题

回复格式：
- 先简短直接回答核心问题
- 再给出 2-3 条实用建议（如适用）
- 最后视情况提示是否需要就医
- 总字数控制在 200 字以内`

    const messages = [
      { role: 'system', content: systemPrompt },
      ...userMessages,
    ]

    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages,
      temperature: 0.4,
      max_tokens: 500,
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
        console.log('[askVet] HTTP 状态码:', res.statusCode)
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

          console.log('[askVet] 回复:', text.slice(0, 100))
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
