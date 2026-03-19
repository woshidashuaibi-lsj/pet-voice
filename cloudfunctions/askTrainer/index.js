// cloudfunctions/askTrainer/index.js
// AI 宠物训练师云函数
// 使用 MiniMax Chat Completion V2 回答宠物训练相关问题
// 环境变量：MINIMAX_API_KEY（与 askVet 共用同一个 key）

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ============================================================
// 主函数入口
// event 参数：
//   question  String  用户提问
//   petName   String  宠物名称（可选）
//   petType   String  'cat' | 'dog'（可选）
// ============================================================
exports.main = async (event) => {
  const {
    question = '',
    petName  = '',
    petType  = 'dog',
  } = event

  if (!question || !question.trim()) {
    return { success: false, error: '问题不能为空' }
  }

  try {
    const reply = await callMinimaxTrainer(question.trim(), petName, petType)
    return { success: true, reply }
  } catch (err) {
    console.error('[askTrainer] 调用失败:', err.message)
    return {
      success: false,
      error: err.message,
      reply: '抱歉，AI 训练师暂时无法响应，请稍后再试。',
    }
  }
}

// ============================================================
// 调用 MiniMax Chat Completion V2（纯文本）
// ============================================================
function callMinimaxTrainer(question, petName, petType) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      reject(new Error('未配置 MINIMAX_API_KEY 环境变量'))
      return
    }

    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'
    const petDesc = petName ? `主人的${petTypeText}叫 ${petName}` : `主人养了一只${petTypeText}`

    // 系统提示：专业宠物训练师角色
    const systemPrompt = `你是一位专业、耐心的宠物行为训练师，熟悉犬猫行为学和正向强化训练方法。
${petDesc}。

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
      { role: 'user',   content: question },
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
            reject(new Error('AI 返回内容为空'))
            return
          }

          console.log('[askTrainer] AI 回复:', text.slice(0, 100))
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
