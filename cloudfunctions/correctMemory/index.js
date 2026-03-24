// cloudfunctions/correctMemory/index.js
// Phase 4：隐式反馈识别
//   功能：检测用户最新一条消息是否包含对已有档案信息的矫正
//         如果是矫正 → 自动更新 pet_memory_snapshot
//         同时追加一条矫正事件到 pet_memory_events（source: 'user_correction'，置信度100）
//   触发时机：healthchat / trainingchat 每次收到助手回复后，静默异步调用
// 环境变量：MINIMAX_API_KEY

const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ============================================================
// 主函数入口
// event 参数：
//   userMessage  String  用户本次说的话
//   petId        String  宠物文档 _id
//   petName      String  宠物名称
//   petType      String  'cat' | 'dog'
// ============================================================
exports.main = async (event) => {
  const {
    userMessage = '',
    petId       = '',
    petName     = '',
    petType     = 'cat',
  } = event

  if (!userMessage.trim()) {
    return { success: true, skipped: true, reason: '消息为空' }
  }

  const apiKey = process.env.MINIMAX_API_KEY
  if (!apiKey) {
    return { success: false, error: '未配置 MINIMAX_API_KEY' }
  }

  try {
    const db = cloud.database()

    // Step 1：获取 petId
    let resolvedPetId = petId
    if (!resolvedPetId) {
      const res = await db.collection('pets').limit(1).get()
      resolvedPetId = res.data[0]?._id || null
    }
    if (!resolvedPetId) {
      return { success: false, error: '找不到宠物档案' }
    }

    // Step 2：读取当前 snapshot（用于给大模型做对照）
    let snapshot = null
    try {
      const snapRes = await db.collection('pet_memory_snapshot')
        .where({ petId: resolvedPetId })
        .limit(1)
        .get()
      snapshot = snapRes.data[0] || null
    } catch (e) { /* 无 snapshot 则无需矫正 */ }

    if (!snapshot) {
      return { success: true, skipped: true, reason: '尚无档案，无需矫正' }
    }

    // Step 3：构建当前档案摘要给大模型
    const archiveSummary = buildArchiveSummary(snapshot)

    // Step 4：调用大模型，判断用户消息是否包含矫正信号
    const correction = await detectCorrection(userMessage, archiveSummary, petName, petType, apiKey)

    if (!correction || !correction.isCorrection) {
      return { success: true, skipped: true, reason: '未检测到矫正信号' }
    }

    // Step 5：执行矫正 - 更新 snapshot + 追加 events
    await Promise.all([
      applyCorrection(resolvedPetId, snapshot, correction),
      appendCorrectionEvent(resolvedPetId, correction),
    ])

    console.log('[correctMemory] 矫正成功:', correction.field, '→', correction.newContent)
    return { success: true, corrected: true, correction }

  } catch (err) {
    console.error('[correctMemory] 失败:', err.message)
    return { success: false, error: err.message }
  }
}

// ============================================================
// 构建档案摘要字符串，用于给大模型做对照
// ============================================================
function buildArchiveSummary(snapshot) {
  const lines = []

  const toStr = (arr) => {
    if (!Array.isArray(arr)) return ''
    return arr.map(i => (typeof i === 'string' ? i : i.content)).filter(Boolean).join('；')
  }

  if (snapshot.health?.length)      lines.push(`健康：${toStr(snapshot.health)}`)
  if (snapshot.diet?.length)        lines.push(`饮食：${toStr(snapshot.diet)}`)
  if (snapshot.behavior?.length)    lines.push(`行为：${toStr(snapshot.behavior)}`)
  if (snapshot.personality?.length) lines.push(`性格：${snapshot.personality.join('、')}`)

  return lines.join('\n') || '（暂无档案信息）'
}

// ============================================================
// 调用大模型检测矫正信号
// 返回：{ isCorrection, field, oldContent, newContent, action }
//   action: 'update'（更新）| 'delete'（删除旧信息）| 'append'（追加新信息）
// ============================================================
function detectCorrection(userMessage, archiveSummary, petName, petType, apiKey) {
  return new Promise((resolve, reject) => {
    const petTypeText = petType === 'cat' ? '猫咪' : '狗狗'

    const prompt = `你是一个宠物档案矫正检测助手。请判断用户的最新消息是否包含对已有档案信息的矫正或更新。

宠物信息：${petName}（${petTypeText}）

当前档案记录：
${archiveSummary}

用户最新消息："${userMessage}"

判断规则：
1. 只有用户的消息明确与档案中某条记录不一致，才算矫正
2. 用户补充新信息（档案中没有的）也算矫正（action=append）
3. 用户说"其实不是这样"、"它现在...了"、"之前说错了"等表达 → 明确矫正
4. 用户只是普通提问或闲聊 → 不是矫正

field 取值：health / diet / behavior / personality / events

如果是矫正，输出：
{
  "isCorrection": true,
  "field": "diet",
  "oldContent": "档案中被矫正的原始内容（没有则留空）",
  "newContent": "矫正后的正确内容（简洁，不超过30字）",
  "action": "update"
}

如果不是矫正，输出：
{
  "isCorrection": false
}

只输出 JSON，不要有其他文字。`

    const body = JSON.stringify({
      model: 'MiniMax-M2.7',
      messages: [
        { role: 'system', content: '你是一个档案矫正检测助手，只输出 JSON，不输出其他内容。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    })

    const options = {
      hostname: 'api.minimax.chat',
      path: '/v1/text/chatcompletion_v2',
      method: 'POST',
      timeout: 15000,
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
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            resolve({ isCorrection: false })
            return
          }
          resolve(JSON.parse(jsonMatch[0]))
        } catch (e) {
          resolve({ isCorrection: false })
        }
      })
    })

    req.on('error', () => resolve({ isCorrection: false }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ isCorrection: false })
    })

    req.write(body)
    req.end()
  })
}

// ============================================================
// 将矫正结果应用到 snapshot
// - update：找到 oldContent 对应条目，替换为 newContent
// - append：直接追加新条目
// - delete：找到 oldContent 对应条目，移除
// ============================================================
async function applyCorrection(petId, snapshot, correction) {
  const db = cloud.database()
  const now = new Date().toISOString().slice(0, 10)

  const { field, oldContent, newContent, action } = correction

  // 只处理 health / diet / behavior 数组字段
  const arrayFields = ['health', 'diet', 'behavior']
  if (!arrayFields.includes(field)) return

  const existing = snapshot[field] || []

  let updated
  if (action === 'delete') {
    // 删除匹配的旧条目
    updated = existing.filter(item => {
      const str = typeof item === 'string' ? item : item.content
      return !isSimilar(str, oldContent)
    })
  } else if (action === 'update') {
    // 替换匹配的旧条目
    let replaced = false
    updated = existing.map(item => {
      const str = typeof item === 'string' ? item : item.content
      if (!replaced && isSimilar(str, oldContent)) {
        replaced = true
        return { content: newContent, confidence: 100, date: now, source: 'user_correction', createdAt: now }
      }
      return item
    })
    // 如果没找到对应旧条目，直接追加
    if (!replaced) {
      updated = [...existing, { content: newContent, confidence: 100, date: now, source: 'user_correction', createdAt: now }]
    }
  } else {
    // append：直接追加
    updated = [...existing, { content: newContent, confidence: 100, date: now, source: 'user_correction', createdAt: now }]
    // 最多保留10条
    updated = updated.slice(-10)
  }

  await db.collection('pet_memory_snapshot').doc(snapshot._id).update({
    data: {
      [field]: updated,
      updatedAt: now,
    },
  })
}

// ============================================================
// 追加矫正事件到 pet_memory_events（永久保留，来源标记为 user_correction）
// ============================================================
async function appendCorrectionEvent(petId, correction) {
  const db = cloud.database()
  const now = new Date().toISOString().slice(0, 10)

  const content = correction.oldContent
    ? `[矫正] ${correction.oldContent} → ${correction.newContent}`
    : `[新增] ${correction.newContent}`

  await db.collection('pet_memory_events').add({
    data: {
      petId,
      content,
      category:     correction.field,
      confidence:   100,
      date:         now,
      source:       'user_correction',
      mentionCount: 0,
      createdAt:    db.serverDate(),
    },
  })
}

// ============================================================
// 简单相似度判断（与 extractMemory 保持一致）
// ============================================================
function isSimilar(a, b) {
  if (!a || !b) return false
  const shorter = a.length < b.length ? a : b
  const longer  = a.length < b.length ? b : a
  let matchCount = 0
  for (const char of shorter) {
    if (longer.includes(char)) matchCount++
  }
  return matchCount / shorter.length > 0.55
}
