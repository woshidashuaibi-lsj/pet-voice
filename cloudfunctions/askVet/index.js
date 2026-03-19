// cloudfunctions/askVet/index.js
// AI 宠物健康问诊云函数
// 使用 MiniMax Chat Completion V2 文本接口回答宠物健康咨询问题
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ============================================================
// 主函数入口
// event 参数：
//   messages  Array  对话历史（{role, content} 数组）
//   petName   String 宠物名称（可选）
//   petType   String 'cat' | 'dog'（可选）
// ============================================================
exports.main = async (event) => {
  const {
    messages = [],
    petName = '',
    petType = 'cat',
  } = event

  if (!messages || messages.length === 0) {
    return { success: false, error: '消息不能为空' }
  }

  try {
    const reply = await callMinimaxText(messages, petName, petType)
    return { success: true, reply }
  } catch (err) {
    console.error('[askVet] 调用失败:', err.message)
    return {
      success: false,
      error: err.message,
      reply: '抱歉，AI 医生暂时无法响应，请稍后再试。如遇紧急情况请直接前往宠物医院。',
    }
  }
}

// ============================================================
// 调用 MiniMax Chat Completion V2（纯文本）
// ============================================================
function callMinimaxText(userMessages, petName, petType) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      reject(new Error('未配置 MINIMAX_API_KEY 环境变量'))
      return
    }

    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'
    const petDesc = petName ? `主人的${petTypeText}叫 ${petName}` : `主人养了一只${petTypeText}`

    // 系统提示：设定 AI 角色
    const systemPrompt = `你是一位专业、温柔的宠物健康顾问，拥有丰富的猫咪和狗狗护理经验。
${petDesc}。

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

    // 构建消息列表（系统提示 + 对话历史）
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
            reject(new Error('AI 返回内容为空'))
            return
          }

          console.log('[askVet] AI 回复:', text.slice(0, 100))
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
