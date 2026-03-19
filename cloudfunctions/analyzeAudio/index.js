// cloudfunctions/analyzeAudio/index.js
// AI 提供商：MiniMax（https://platform.minimaxi.com）
// 使用模型：MiniMax-M2.7（支持音频理解的多模态模型）
// 接口：POST https://api.minimax.chat/v1/text/chatcompletion_v2

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ---- 兜底情绪库（AI 调用失败时随机返回，保证用户体验）----
const FALLBACK_EMOTIONS = [
  {
    emotion: 'happy',
    confidence: 72,
    description: '主人主人！你回来啦？我等你好久了！快来陪我玩嘛～ 😄',
    suggestion: '陪它玩 5-10 分钟',
  },
  {
    emotion: 'hungry',
    confidence: 68,
    description: '主人～我的肚子咕咕叫了好久啦！是不是忘了喂我？快给我加饭饭！🍖',
    suggestion: '检查是否到了喂食时间',
  },
  {
    emotion: 'playful',
    confidence: 75,
    description: '我发现了一个超级有趣的东西！快来快来！我们一起玩！🎾',
    suggestion: '拿玩具陪它互动一下',
  },
]

// ============================================================
// 主函数入口
// ============================================================
exports.main = async (event) => {
  const { taskId, petName = '宠物', petType = 'cat' } = event
  const petTypeText = petType === 'cat' ? '猫' : '狗'

  try {
    // 1. 从云存储下载音频，转 base64
    const fileRes = await cloud.downloadFile({ fileID: taskId })
    const audioBase64 = fileRes.fileContent.toString('base64')

    // 2. 调用 MiniMax 多模态 API 分析音频
    const aiResult = await callMinimaxAPI(audioBase64, petName, petTypeText)

    // 3. 分析完成后删除云存储中的音频（节省空间 & 保护隐私）
    await cloud.deleteFile({ fileList: [taskId] }).catch(err => {
      console.warn('删除音频文件失败（不影响主流程）:', err.message)
    })

    // 4. 保存解读记录到云数据库
    const db = cloud.database()
    await db.collection('records').add({
      data: {
        petName,
        petType,
        emotion:     aiResult.emotion,
        confidence:  aiResult.confidence,
        description: aiResult.description,
        suggestion:  aiResult.suggestion,
        healthAlert: aiResult.healthAlert,
        createdAt:   db.serverDate(),
      },
    }).catch(err => console.warn('保存记录失败（不影响主流程）:', err.message))

    return { success: true, ...aiResult }

  } catch (err) {
    console.error('分析流程出错:', err.message || err)

    // 兜底：随机返回友好结果，不让用户白屏
    const fallback = FALLBACK_EMOTIONS[Math.floor(Math.random() * FALLBACK_EMOTIONS.length)]
    return {
      success: false,
      healthAlert: false,
      ...fallback,
      description: fallback.description.replace('宠物', petName),
    }
  }
}

// ============================================================
// 调用 MiniMax Chat Completion V2（多模态，支持音频输入）
//
// 文档：https://platform.minimaxi.com/document/ChatCompletion%20v2
// 环境变量：MINIMAX_API_KEY  —— 在云开发控制台 → 云函数 → 环境变量中配置
//
// 音频传入方式：
//   content 数组中加入 { type: "audio_url", audio_url: { url: "data:audio/mp3;base64,..." } }
//   当前支持音频的模型：MiniMax-Speech-01
// ============================================================
function callMinimaxAPI(audioBase64, petName, petTypeText) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      reject(new Error('未配置 MINIMAX_API_KEY 环境变量'))
      return
    }

    const prompt = `你是一位专业的宠物行为分析师和宠物情感翻译官。
请仔细聆听这段${petTypeText}（名字叫 ${petName}）的叫声音频，分析它当前的情绪状态。

严格按照以下 JSON 格式回复，不要有任何其他文字：
{
  "emotion": "从 happy/anxious/angry/fearful/hungry/playful/bored/uncomfortable 中选一个最符合的",
  "confidence": 置信度（0到100的整数）,
  "description": "50-60字，以${petName}第一人称视角，活泼可爱地描述当前心情，结尾带一个符合情绪的emoji",
  "suggestion": "给主人的简短互动建议，不超过15个字",
  "healthAlert": 布尔值，仅当 emotion 为 uncomfortable 时为 true，其余情况为 false
}`

    // MiniMax Chat Completion V2 请求体
    const body = JSON.stringify({
      model: 'MiniMax-M2.7',            // 支持音频输入的多模态模型
      messages: [
        {
          role: 'system',
          content: '你是专业的宠物行为分析师，擅长通过宠物叫声分析其情绪状态。回复必须是纯 JSON 格式。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'audio_url',
              audio_url: {
                url: `data:audio/mp3;base64,${audioBase64}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      temperature: 0.3,   // 降低随机性，让情绪判断更稳定
      max_tokens: 300,
    })

    const options = {
      hostname: 'api.minimax.chat',
      path: '/v1/text/chatcompletion_v2',
      method: 'POST',
      timeout: 45000,   // 45s 超时（音频分析比文本慢，留足时间）
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
        // ---- 调试日志 START ----
        console.log('[DEBUG] HTTP 状态码:', res.statusCode)
        console.log('[DEBUG] 完整响应体:', data)
        // ---- 调试日志 END ----
        try {
          const resp = JSON.parse(data)

          // 检查 API 层面的错误
          if (resp.base_resp && resp.base_resp.status_code !== 0) {
            reject(new Error(`MiniMax API 错误: ${resp.base_resp.status_code} - ${resp.base_resp.status_msg}`))
            return
          }

          // 提取模型回复文本
          const text = resp.choices?.[0]?.message?.content || ''
          console.log('[DEBUG] MiniMax 模型回复 text:', text)

          // 从回复中提取 JSON（模型有时会在 JSON 前后带文字）
          const match = text.match(/\{[\s\S]*\}/)
          if (!match) {
            reject(new Error('AI 返回内容无法解析为 JSON: ' + text.slice(0, 150)))
            return
          }

          const result = JSON.parse(match[0])

          // 校验必要字段
          const validEmotions = ['happy', 'anxious', 'angry', 'fearful', 'hungry', 'playful', 'bored', 'uncomfortable']
          if (!result.emotion || !validEmotions.includes(result.emotion)) {
            result.emotion = 'happy'  // 异常情绪值时兜底为 happy
          }
          if (!result.description || result.description.length < 5) {
            reject(new Error('AI 返回 description 字段不完整'))
            return
          }
          // 确保 confidence 是数字
          result.confidence = parseInt(result.confidence) || 70
          // 确保 healthAlert 是布尔
          result.healthAlert = result.emotion === 'uncomfortable'

          console.log('[DEBUG] 最终解析结果:', JSON.stringify(result))
          resolve(result)
        } catch (e) {
          reject(new Error('解析 MiniMax 响应失败: ' + e.message + ' | 原始: ' + data.slice(0, 200)))
        }
      })
    })

    req.on('error', (e) => reject(new Error('网络请求失败: ' + e.message)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('MiniMax API 请求超时（>45s）'))
    })

    req.write(body)
    req.end()
  })
}
