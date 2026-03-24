// cloudfunctions/summarizeHistory/index.js
// 方案二：摘要压缩
//   将本轮对话中"旧的一段"压缩成一段简洁摘要
//   前端超出阈值时调用，把旧消息替换成摘要 + 保留最近几条完整对话
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ============================================================
// 主函数入口
// event 参数：
//   messages  Array  需要被压缩的旧消息 [{role, content}]
//   petName   String 宠物名称（让摘要更有针对性）
//   petType   String 'cat' | 'dog'
// 返回：
//   { success: true, summary: "摘要文本" }
//   { success: false, error: "xxx" }
// ============================================================
exports.main = async (event) => {
  const {
    messages = [],
    petName  = '',
    petType  = 'cat',
  } = event

  if (!messages || messages.length === 0) {
    return { success: false, error: '消息列表为空' }
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return { success: false, error: '未配置 MINIMAX_API_KEY' }
  }

  try {
    const summary = await summarize(messages, petName, petType, apiKey)
    return { success: true, summary }
  } catch (err) {
    console.error('[summarizeHistory] 压缩失败:', err.message)
    // 失败时返回一个简单的文本摘要作为降级
    const fallback = buildFallbackSummary(messages)
    return { success: true, summary: fallback, fallback: true }
  }
}

// ============================================================
// 调用大模型生成摘要
// ============================================================
function summarize(messages, petName, petType, apiKey) {
  return new Promise((resolve, reject) => {
    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'
    const petDesc = petName ? `${petName}（${petTypeText}）` : petTypeText

    // 把消息列表转成易读的对话文本
    const dialogText = messages.map(m => {
      const role = m.role === 'user' ? '用户' : '助手'
      return `${role}：${m.content}`
    }).join('\n')

    const prompt = `以下是用户和宠物助手关于${petDesc}的一段对话记录：

${dialogText}

请将上述对话压缩成一段简洁的摘要，要求：
1. 保留对话中提到的关键事实（症状、行为、用户担忧等）
2. 保留助手给出的主要建议
3. 不超过150字
4. 使用第三人称描述（如"用户提到..."、"助手建议..."）
5. 只输出摘要内容，不要有标题或其他格式

摘要：`

    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: '你是一个对话摘要助手，负责将宠物咨询对话压缩成简洁摘要。只输出摘要正文，不输出任何其他内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    })

    const options = {
      hostname: 'api.minimax.chat',
      path: '/v1/text/chatcompletion_v2',
      method: 'POST',
      timeout: 20000,
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
            reject(new Error('大模型返回空摘要'))
            return
          }
          resolve(text.trim())
        } catch (e) {
          reject(new Error('解析响应失败: ' + e.message))
        }
      })
    })

    req.on('error', (e) => reject(new Error('请求失败: ' + e.message)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })

    req.write(body)
    req.end()
  })
}

// ============================================================
// 降级摘要：大模型调用失败时，简单拼接用户消息作为摘要
// ============================================================
function buildFallbackSummary(messages) {
  const userMessages = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .slice(0, 5)  // 最多取5条用户消息

  if (userMessages.length === 0) return '（之前的对话内容）'

  const joined = userMessages.join('；')
  return `之前对话摘要：用户提到了以下问题：${joined.slice(0, 100)}${joined.length > 100 ? '…' : ''}`
}
