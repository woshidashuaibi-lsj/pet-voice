// cloudfunctions/askTrainer/index.js
// 宠物训练师云函数
// 使用 MiniMax Chat Completion V2 回答宠物训练相关问题
// 环境变量：MINIMAX_API_KEY（与 askVet 共用同一个 key）

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

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
    // 读取宠物记忆档案
    const memory = await loadPetMemory(petId)

    const reply = await callMinimaxTrainer(finalMessages, petName, petType, memory)
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
// 从数据库读取宠物记忆档案
// ============================================================
async function loadPetMemory(petId) {
  try {
    const db = cloud.database()
    let petDoc = null

    if (petId) {
      const res = await db.collection('pets').doc(petId).get()
      petDoc = res.data
    } else {
      const res = await db.collection('pets').limit(1).get()
      petDoc = res.data[0] || null
    }

    return petDoc?.memory || null
  } catch (e) {
    return null
  }
}

// ============================================================
// 将 memory 构建成背景描述字符串，注入 system prompt
// ============================================================
function buildMemoryContext(petName, memory) {
  if (!memory) return ''

  const parts = []

  if (memory.behavior && memory.behavior.length > 0) {
    const items = memory.behavior.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`已知行为问题：${items.join('；')}`)
  }

  if (memory.personality && memory.personality.length > 0) {
    parts.push(`性格特点：${memory.personality.join('、')}`)
  }

  if (memory.diet && memory.diet.length > 0) {
    const items = memory.diet.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`饮食偏好：${items.join('；')}`)
  }

  if (memory.health && memory.health.length > 0) {
    const items = memory.health.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean)
    if (items.length) parts.push(`健康状况：${items.join('；')}`)
  }

  if (parts.length === 0) return ''

  return `\n\n【关于${petName}的已知信息】\n${parts.join('\n')}\n请结合以上背景提供针对性的训练方案。`
}

// ============================================================
// 调用 MiniMax Chat Completion V2（支持多轮对话）
// ============================================================
function callMinimaxTrainer(userMessages, petName, petType, memory) {
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
