// cloudfunctions/recordInteraction/index.js
// 记录用户与宠物的点击交互，并更新对应维度值
// 此云函数可异步调用，不阻塞前端交互

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 各交互类型对应的维度增量
const INTERACTION_BOOSTS = {
  tap_head:   { affection: 3,  contentment: 2 },
  tap_back:   { affection: 5,  contentment: 3 },
  tap_body:   { affection: 2,  contentment: 2 },
  tap_tail:   { affection: 2,  contentment: 4 },
  double_tap: { affection: 10, contentment: 8 },
  long_press: { affection: 15, contentment: 10, health: 5 },
}

// 单日增长上限（防止无限刷维度）
const DAILY_CAP = {
  affection:   30,
  contentment: 25,
  health:      15,
  energy:      10,
}

exports.main = async (event) => {
  const db  = cloud.database()
  const _   = db.command
  const { petId, userId, interactionType, timestamp } = event

  if (!petId || !userId || !interactionType) {
    return { success: false, error: '缺少必要参数' }
  }

  try {
    // 1. 读取当前 avatar_state
    const stateRes = await db.collection('pet_avatar_states')
      .where({ petId, _openid: userId })
      .limit(1)
      .get()

    if (!stateRes.data || stateRes.data.length === 0) {
      return { success: false, error: '未找到宠物分身数据，请先打开宠物分身页' }
    }

    const state = stateRes.data[0]
    const boost = INTERACTION_BOOSTS[interactionType] || { affection: 1, contentment: 1 }

    // 2. 检查今日交互次数（防止超出上限 100 次）
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const lastDate = state.stats?.lastInteractionAt
      ? new Date(state.stats.lastInteractionAt).toISOString().slice(0, 10)
      : ''
    const todayCount = lastDate === today ? (state.stats?.todayInteractions || 0) : 0

    if (todayCount >= 100) {
      return { success: true, capped: true, message: '今日互动已达上限' }
    }

    // 3. 计算新的维度值（带上限保护）
    const dims = state.dimensions || { contentment: 50, energy: 50, affection: 50, health: 50 }

    // 今日各维度已增长量
    const todayBoostMap = lastDate === today ? (state.stats?.todayBoosts || {}) : {}

    const newDims = { ...dims }
    for (const [key, delta] of Object.entries(boost)) {
      const alreadyBoosted = todayBoostMap[key] || 0
      const cap = DAILY_CAP[key] || 20
      const actualDelta = Math.min(delta, cap - alreadyBoosted)
      if (actualDelta > 0) {
        newDims[key] = Math.min(100, (newDims[key] || 50) + actualDelta)
        todayBoostMap[key] = alreadyBoosted + actualDelta
      }
    }

    // 4. 更新连续活跃天数
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const streakDays = state.stats?.streakDays || 0
    const newStreakDays = lastDate === yesterday ? streakDays + 1
      : lastDate === today ? streakDays
      : 1 // 断链了，重新从1开始

    const now = timestamp || new Date().toISOString()

    // 5. 构建更新数据
    const updateData = {
      dimensions: newDims,
      'stats.totalInteractions': _.inc(1),
      'stats.lastInteractionAt': now,
      'stats.streakDays':        newStreakDays,
      'stats.todayInteractions': lastDate === today ? _.inc(1) : 1,
      'stats.todayBoosts':       todayBoostMap,
      updatedAt: now,
    }

    await db.collection('pet_avatar_states').doc(state._id).update({ data: updateData })

    return {
      success:      true,
      newDimensions: newDims,
      boost:        boost,
      streakDays:   newStreakDays,
    }
  } catch (e) {
    console.error('[recordInteraction] 错误:', e)
    return { success: false, error: e.message }
  }
}
