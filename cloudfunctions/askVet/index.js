// cloudfunctions/askVet/index.js
// 宠物健康问诊云函数
// 使用 MiniMax Chat Completion V2 文本接口回答宠物健康咨询问题
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

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
    // 取最后一条用户消息，用于检测是否在询问历史
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || ''

    // 读取宠物记忆档案（Phase 2：优先读 snapshot，按需查 events）
    const memory = await loadPetMemory(petId, lastUserMsg)

    const reply = await callMinimaxText(messages, petName, petType, memory)
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
// 从数据库读取宠物记忆档案（Phase 2 双轨读取）
// 优先读 pet_memory_snapshot（快照），
// 用户提问中含历史关键词时额外查 pet_memory_events（事件流）
// 兼容旧版 pets.memory 字段
// ============================================================
async function loadPetMemory(petId, userQuestion) {
  try {
    const db = cloud.database()

    // Step 1：解析 petId（有则用，无则查第一只）
    let resolvedPetId = petId
    if (!resolvedPetId) {
      const res = await db.collection('pets').limit(1).get()
      resolvedPetId = res.data[0]?._id || null
    }
    if (!resolvedPetId) return null

    // Step 2：读取 snapshot（日常对话只用这个）
    let snapshot = null
    try {
      const snapRes = await db.collection('pet_memory_snapshot')
        .where({ petId: resolvedPetId })
        .limit(1)
        .get()
      snapshot = snapRes.data[0] || null
    } catch (e) {
      // snapshot 集合不存在，降级读旧版 pets.memory
    }

    // snapshot 集合不存在时，降级读旧版 pets.memory
    if (!snapshot) {
      try {
        const petRes = await db.collection('pets').doc(resolvedPetId).get()
        const legacyMemory = petRes.data?.memory || null
        if (legacyMemory) {
          console.log('[askVet] 降级使用 pets.memory（旧版）')
          return legacyMemory
        }
      } catch (e) {
        // 忽略
      }
      return null
    }

    // Step 3：检测用户是否在询问历史，按需加载 events
    const isAskingHistory = /以前|历史|之前|过去|曾经|以往|什么时候|多久/.test(userQuestion || '')
    let historyEvents = []

    if (isAskingHistory) {
      try {
        const eventsRes = await db.collection('pet_memory_events')
          .where({ petId: resolvedPetId })
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get()
        historyEvents = eventsRes.data || []
        console.log('[askVet] 按需加载历史事件:', historyEvents.length, '条')
      } catch (e) {
        // events 查询失败，不影响正常对话
      }
    }

    // 将 snapshot + events 合并成统一结构返回
    return buildMemoryFromDualTrack(snapshot, historyEvents)

  } catch (e) {
    console.log('[askVet] loadPetMemory 失败，跳过记忆注入:', e.message)
    return null
  }
}

// 将双轨数据合并成统一的 memory 对象（与 buildMemoryContext 兼容）
function buildMemoryFromDualTrack(snapshot, historyEvents) {
  const memory = {
    health:      snapshot.health      || [],
    behavior:    snapshot.behavior    || [],
    diet:        snapshot.diet        || [],
    personality: snapshot.personality || [],
    events:      snapshot.events      || [],
  }

  // 如果有历史事件（按需加载），按类别合并追加
  if (historyEvents.length > 0) {
    const eventsByCategory = {}
    for (const ev of historyEvents) {
      if (!eventsByCategory[ev.category]) eventsByCategory[ev.category] = []
      eventsByCategory[ev.category].push({ content: ev.content, date: ev.date })
    }
    // 追加到对应维度（events 类别单独放 events 字段）
    if (eventsByCategory.health)   memory.health   = [...memory.health,   ...eventsByCategory.health]
    if (eventsByCategory.behavior) memory.behavior = [...memory.behavior, ...eventsByCategory.behavior]
    if (eventsByCategory.diet)     memory.diet     = [...memory.diet,     ...eventsByCategory.diet]
    if (eventsByCategory.events)   memory.events   = [...memory.events,   ...eventsByCategory.events]
  }

  return memory
}

// ============================================================
// 将 memory 构建成背景描述字符串，注入 system prompt
// ============================================================
function buildMemoryContext(petName, memory) {
  if (!memory) return ''

  const parts = []

  if (memory.health && memory.health.length > 0) {
    const items = memory.health.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`健康历史：${items.join('；')}`)
  }

  if (memory.behavior && memory.behavior.length > 0) {
    const items = memory.behavior.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`行为特征：${items.join('；')}`)
  }

  if (memory.diet && memory.diet.length > 0) {
    const items = memory.diet.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`饮食偏好：${items.join('；')}`)
  }

  if (memory.events && memory.events.length > 0) {
    const items = memory.events.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`重要事件：${items.join('；')}`)
  }

  if (memory.personality && memory.personality.length > 0) {
    parts.push(`性格特点：${memory.personality.join('、')}`)
  }

  if (parts.length === 0) return ''

  return `\n\n【关于${petName}的已知信息】\n${parts.join('\n')}\n请结合以上背景提供个性化建议，如有关联请主动说明。`
}

// ============================================================
// 调用 MiniMax Chat Completion V2（纯文本）
// ============================================================
function callMinimaxText(userMessages, petName, petType, memory) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      reject(new Error('未配置 MINIMAX_API_KEY 环境变量'))
      return
    }

    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'
    const petDesc = petName ? `主人的${petTypeText}叫 ${petName}` : `主人养了一只${petTypeText}`

    // 注入宠物记忆背景
    const memoryContext = buildMemoryContext(petName || '这只宠物', memory)

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
