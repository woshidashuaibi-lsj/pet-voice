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
    // 读取宠物记忆档案（有则注入背景，无则正常回复）
    const memory = await loadPetMemory(petId)

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
    // 读取失败不影响对话，返回 null
    return null
  }
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
