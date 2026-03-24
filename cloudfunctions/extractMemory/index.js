// cloudfunctions/extractMemory/index.js
// 从对话记录中提取宠物关键信息，存入 pets 集合的 memory 字段
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

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

  // 对话少于 2 条（一问一答），不值得提取
  const userMessages = messages.filter(m => m.role === 'user')
  if (userMessages.length < 1) {
    return { success: true, skipped: true, reason: '对话内容不足' }
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return { success: false, error: '未配置 MINIMAX_API_KEY' }
  }

  try {
    // 1. 调用大模型提取关键信息
    const extracted = await extractFromConversation(messages, petName, petType, apiKey)

    // 2. 判断是否有新信息
    if (!extracted.hasNewInfo) {
      return { success: true, skipped: true, reason: '未提取到新信息' }
    }

    // 3. 写入数据库
    await saveMemory(petId, extracted, source)

    console.log('[extractMemory] 提取成功:', JSON.stringify(extracted).slice(0, 200))
    return { success: true, extracted }

  } catch (err) {
    console.error('[extractMemory] 失败:', err.message)
    // 提取失败不影响用户体验，静默处理
    return { success: false, error: err.message }
  }
}

// ============================================================
// 调用大模型提取宠物关键信息
// ============================================================
function extractFromConversation(messages, petName, petType, apiKey) {
  return new Promise((resolve, reject) => {
    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'

    // 将对话历史格式化为文本
    const conversationText = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? '主人' : '顾问'}：${m.content}`)
      .join('\n')

    const extractPrompt = `你是一个宠物信息提取助手。请从以下对话中提取关于宠物的关键信息。

宠物基本信息：名字="${petName}"，种类="${petTypeText}"

对话记录：
---
${conversationText}
---

提取规则（严格遵守）：
1. 只提取主人明确陈述的具体事实，不推断、不臆测
2. 模糊表述（"好像"、"可能"、"感觉"）不提取
3. 通用知识不提取，只提取该宠物的个性化信息
4. 每条信息简洁，不超过30字

请输出 JSON 格式（没有新信息的维度输出空数组）：
{
  "health": ["具体健康问题或历史，如：2026年3月有食欲不振情况"],
  "behavior": ["具体行为特征，如：喜欢抓沙发左侧角落"],
  "diet": ["饮食偏好或禁忌，如：不吃鸡肉罐头，喜欢金枪鱼冻干"],
  "events": ["重要事件（尽量带时间），如：2026年2月做了绝育手术"],
  "personality": ["性格标签（1-3个字），如：胆小、粘人"],
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
      max_tokens: 400,
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

          // 提取 JSON 内容（防止模型多输出了文字）
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
// 将提取结果存入数据库 pets.memory
// ============================================================
async function saveMemory(petId, extracted, source) {
  const db = cloud.database()
  const now = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  // 查找宠物文档
  let petDoc = null
  if (petId) {
    // 有 petId 直接精准查找
    try {
      const res = await db.collection('pets').doc(petId).get()
      petDoc = res.data
    } catch (e) {
      // petId 无效，降级为查第一条
    }
  }

  if (!petDoc) {
    // 没有 petId 时查当前用户的第一只宠物
    const res = await db.collection('pets').limit(1).get()
    if (res.data.length === 0) return // 无宠物档案，跳过
    petDoc = res.data[0]
  }

  const existingMemory = petDoc.memory || {
    health: [], behavior: [], diet: [], events: [], personality: [], lastUpdated: ''
  }

  // 合并新提取的信息（去除空值，追加新内容）
  const mergedMemory = mergeMemory(existingMemory, extracted, source, now)

  // 更新数据库
  await db.collection('pets').doc(petDoc._id).update({
    data: {
      memory: mergedMemory
    }
  })
}

// ============================================================
// 合并记忆：新内容追加，同时做简单的文字去重
// ============================================================
function mergeMemory(existing, extracted, source, date) {
  const result = {
    health:      [...(existing.health || [])],
    behavior:    [...(existing.behavior || [])],
    diet:        [...(existing.diet || [])],
    events:      [...(existing.events || [])],
    personality: [...(existing.personality || [])],
    lastUpdated: date,
  }

  // 追加各维度新信息（文字相似则跳过，避免重复）
  const appendItems = (existingArr, newItems, src) => {
    if (!newItems || newItems.length === 0) return existingArr
    const updated = [...existingArr]
    for (const item of newItems) {
      if (!item || item.trim() === '') continue
      // 简单去重：已有条目中有超过一半字符相同则认为重复
      const isDuplicate = updated.some(existing => {
        const existStr = typeof existing === 'string' ? existing : existing.content
        return isSimilar(existStr, item)
      })
      if (!isDuplicate) {
        updated.push({ content: item, date, source: src })
      }
    }
    return updated
  }

  result.health   = appendItems(result.health,   extracted.health,   source)
  result.behavior = appendItems(result.behavior, extracted.behavior, source)
  result.diet     = appendItems(result.diet,     extracted.diet,     source)
  result.events   = appendItems(result.events,   extracted.events,   source)

  // 性格标签：字符串数组，直接合并去重
  if (extracted.personality && extracted.personality.length > 0) {
    const existingTags = new Set(result.personality)
    for (const tag of extracted.personality) {
      if (tag && !existingTags.has(tag)) {
        result.personality.push(tag)
        existingTags.add(tag)
      }
    }
  }

  return result
}

// 简单相似度判断：两个字符串共同字符超过较短字符串长度的60%则认为相似
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
