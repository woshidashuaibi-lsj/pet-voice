// cloudfunctions/extractMemory/index.js
// Phase 2：从对话记录中提取宠物关键信息
//   - 提取时同步输出置信度（confidence），低于阈值的信息不存档
//   - 双轨写入：
//       pet_memory_snapshot  当前状态快照（可覆盖，每只宠物一条）
//       pet_memory_events    历史事件流（只追加，永久保留）
//   - 日常对话只读 snapshot（快、省 Token），按需才查 events
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 置信度存档阈值：低于此值的信息直接丢弃
const CONFIDENCE_THRESHOLD = 60

// ============================================================
// 主函数入口
// event 参数：
//   messages  Array   完整对话历史 [{role, content}]
//   petId     String  宠物文档 _id（可选，有则精准更新）
//   petName   String  宠物名称
//   petType   String  'cat' | 'dog'
//   source    String  来源页面 'healthchat' | 'trainingchat'
// ============================================================
exports.main = async (event) => {
  const {
    messages = [],
    petId    = '',
    petName  = '',
    petType  = 'cat',
    source   = 'healthchat',
  } = event

  // 至少有 1 条用户消息才值得提取
  const userMessages = messages.filter(m => m.role === 'user')
  if (userMessages.length < 1) {
    return { success: true, skipped: true, reason: '对话内容不足' }
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return { success: false, error: '未配置 MINIMAX_API_KEY' }
  }

  try {
    // 1. 调用大模型提取关键信息（含置信度）
    const extracted = await extractFromConversation(messages, petName, petType, apiKey)

    // 2. 判断是否有高可信度的新信息
    if (!extracted.hasNewInfo) {
      return { success: true, skipped: true, reason: '未提取到新信息' }
    }

    // 3. 按置信度阈值过滤
    const filtered = filterByConfidence(extracted, source)

    const hasValidInfo = ['health', 'behavior', 'diet', 'events', 'personality']
      .some(k => filtered[k] && filtered[k].length > 0)

    if (!hasValidInfo) {
      return { success: true, skipped: true, reason: '所有信息置信度均低于阈值' }
    }

    // 4. 双轨写入：snapshot + events
    const resolvedPetId = await resolvePetId(petId)
    if (!resolvedPetId) {
      return { success: false, error: '找不到宠物档案' }
    }

    await Promise.all([
      updateSnapshot(resolvedPetId, filtered),
      appendEvents(resolvedPetId, filtered, source),
    ])

    console.log('[extractMemory] Phase2 写入成功，petId:', resolvedPetId)
    return { success: true, extracted: filtered }

  } catch (err) {
    console.error('[extractMemory] 失败:', err.message)
    return { success: false, error: err.message }
  }
}

// ============================================================
// 按置信度阈值过滤提取结果
// 输入：LLM 返回的带 confidence 字段的结果
// 输出：只保留 confidence >= CONFIDENCE_THRESHOLD 的条目
// ============================================================
function filterByConfidence(extracted, source) {
  const now = new Date().toISOString().slice(0, 10)

  const filterItems = (items) => {
    if (!Array.isArray(items)) return []
    return items
      .filter(item => {
        if (typeof item === 'string') return true  // 兼容旧格式（无 confidence）
        return (item.confidence || 0) >= CONFIDENCE_THRESHOLD
      })
      .map(item => {
        if (typeof item === 'string') {
          return { content: item, confidence: 80, date: now, source }
        }
        return { content: item.content, confidence: item.confidence, date: now, source }
      })
      .filter(item => item.content && item.content.trim() !== '')
  }

  // personality 是字符串数组，单独处理
  const filterPersonality = (items) => {
    if (!Array.isArray(items)) return []
    return items.map(item => {
      if (typeof item === 'string') return item
      if (item.confidence >= CONFIDENCE_THRESHOLD) return item.content
      return null
    }).filter(Boolean)
  }

  return {
    health:      filterItems(extracted.health),
    behavior:    filterItems(extracted.behavior),
    diet:        filterItems(extracted.diet),
    events:      filterItems(extracted.events),
    personality: filterPersonality(extracted.personality || []),
    hasNewInfo:  extracted.hasNewInfo,
  }
}

// ============================================================
// 解析宠物 ID：有则直接用，无则查第一只
// ============================================================
async function resolvePetId(petId) {
  const db = cloud.database()
  if (petId) {
    try {
      await db.collection('pets').doc(petId).get()
      return petId
    } catch (e) {
      // petId 无效，降级查第一条
    }
  }
  try {
    const res = await db.collection('pets').limit(1).get()
    return res.data[0]?._id || null
  } catch (e) {
    return null
  }
}

// ============================================================
// 写入 1：更新 pet_memory_snapshot（状态快照，可覆盖）
// 每只宠物只有一条 snapshot，每次提取后合并覆盖
// ============================================================
async function updateSnapshot(petId, filtered) {
  const db = cloud.database()
  const now = new Date().toISOString().slice(0, 10)

  // 查找已有 snapshot
  let existing = null
  try {
    const res = await db.collection('pet_memory_snapshot')
      .where({ petId })
      .limit(1)
      .get()
    existing = res.data[0] || null
  } catch (e) {
    // 集合不存在或查询失败，当作没有
  }

  // 合并新旧 snapshot
  const merged = mergeSnapshot(existing, filtered, now)

  if (existing) {
    // 已有 snapshot → 更新
    await db.collection('pet_memory_snapshot').doc(existing._id).update({
      data: merged,
    })
  } else {
    // 没有 snapshot → 新建
    await db.collection('pet_memory_snapshot').add({
      data: { petId, ...merged },
    })
  }
}

// 合并 snapshot：新信息追加/覆盖旧信息，去重
function mergeSnapshot(existing, filtered, now) {
  const existingHealth      = existing?.health      || []
  const existingBehavior    = existing?.behavior    || []
  const existingDiet        = existing?.diet        || []
  const existingPersonality = existing?.personality || []

  const appendUnique = (arr, newItems) => {
    const result = [...arr]
    for (const item of newItems) {
      const isDup = result.some(e => {
        const eStr = typeof e === 'string' ? e : e.content
        return isSimilar(eStr, item.content)
      })
      if (!isDup) {
        // 记录写入时间，供 Phase 3 记忆衰减计算使用
        result.push({ ...item, createdAt: now })
      }
    }
    // snapshot 每个维度最多保留最新的 10 条，防止无限增长
    return result.slice(-10)
  }

  const mergePersonality = (existing, newTags) => {
    const set = new Set(existing)
    newTags.forEach(t => set.add(t))
    return [...set]
  }

  return {
    health:      appendUnique(existingHealth,   filtered.health),
    behavior:    appendUnique(existingBehavior, filtered.behavior),
    diet:        appendUnique(existingDiet,     filtered.diet),
    personality: mergePersonality(existingPersonality, filtered.personality),
    updatedAt:   now,
  }
}

// ============================================================
// 写入 2：追加 pet_memory_events（历史事件流，只追加）
// 每条事件独立存储，永久保留，带时间戳和置信度
// ============================================================
async function appendEvents(petId, filtered, source) {
  const db = cloud.database()

  const allItems = [
    ...filtered.health.map(i => ({ ...i, category: 'health' })),
    ...filtered.behavior.map(i => ({ ...i, category: 'behavior' })),
    ...filtered.diet.map(i => ({ ...i, category: 'diet' })),
    ...filtered.events.map(i => ({ ...i, category: 'events' })),
  ]

  if (allItems.length === 0) return

  // 批量写入（微信云数据库单次 add 只能写一条，需循环）
  const tasks = allItems.map(item =>
    db.collection('pet_memory_events').add({
      data: {
        petId,
        content:      item.content,
        category:     item.category,
        confidence:   item.confidence,
        date:         item.date,
        source:       item.source || source,
        mentionCount: 0,           // Phase 3：被引用次数，每次注入 prompt 时 +1
        createdAt:    db.serverDate(),
      },
    })
  )

  // 并发写入，单条失败不影响其他
  await Promise.allSettled(tasks)
}

// ============================================================
// 调用大模型提取宠物关键信息（Phase 2：输出含 confidence）
// ============================================================
function extractFromConversation(messages, petName, petType, apiKey) {
  return new Promise((resolve, reject) => {
    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'

    const conversationText = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? '主人' : '顾问'}：${m.content}`)
      .join('\n')

    const extractPrompt = `你是一个宠物信息提取助手。请从以下对话中提取关于宠物的关键信息，并为每条信息标注置信度。

宠物基本信息：名字="${petName}"，种类="${petTypeText}"

对话记录：
---
${conversationText}
---

提取规则（严格遵守）：
1. 只提取主人明确陈述的具体事实，不推断、不臆测
2. 每条信息简洁，不超过30字
3. 通用知识不提取，只提取该宠物的个性化信息

置信度评分规则：
- 主人明确陈述的具体事实 → 80-95
- 医生/专业机构确诊的信息 → 95-100
- 主人模糊描述/猜测（"好像"、"可能"、"感觉"）→ 20-50
- 主人主动否定的旧信息 → 0

请输出 JSON 格式（没有新信息的维度输出空数组）：
{
  "health": [
    { "content": "具体健康信息", "confidence": 85 }
  ],
  "behavior": [
    { "content": "具体行为特征", "confidence": 90 }
  ],
  "diet": [
    { "content": "饮食偏好或禁忌", "confidence": 92 }
  ],
  "events": [
    { "content": "重要事件（尽量带时间）", "confidence": 95 }
  ],
  "personality": [
    { "content": "性格标签（1-3个字）", "confidence": 80 }
  ],
  "hasNewInfo": true或false
}

只输出 JSON，不要有其他文字。`

    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: '你是一个信息提取助手，只输出 JSON 格式，不输出其他内容。' },
        { role: 'user', content: extractPrompt },
      ],
      temperature: 0.1,
      max_tokens: 600,
    })

    const options = {
      hostname: 'api.minimax.chat',
      path: '/v1/text/chatcompletion_v2',
      method: 'POST',
      timeout: 25000,
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
        try {
          const resp = JSON.parse(data)
          const text = resp.choices?.[0]?.message?.content || ''
          if (!text) {
            reject(new Error('提取返回内容为空'))
            return
          }
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            reject(new Error('返回格式不是 JSON'))
            return
          }
          const result = JSON.parse(jsonMatch[0])
          resolve(result)
        } catch (e) {
          reject(new Error('解析提取结果失败: ' + e.message))
        }
      })
    })

    req.on('error', e => reject(new Error('网络请求失败: ' + e.message)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('提取请求超时'))
    })

    req.write(body)
    req.end()
  })
}

// ============================================================
// 简单相似度判断：共同字符超过较短串长度的60%则认为相似
// ============================================================
function isSimilar(a, b) {
  if (!a || !b) return false
  const shorter = a.length < b.length ? a : b
  const longer  = a.length < b.length ? b : a
  let matchCount = 0
  for (const char of shorter) {
    if (longer.includes(char)) matchCount++
  }
  return matchCount / shorter.length > 0.6
}
