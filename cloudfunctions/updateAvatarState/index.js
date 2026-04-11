// cloudfunctions/updateAvatarState/index.js
// 计算宠物四维数据（contentment / energy / affection / health）
// 并写入 pet_avatar_states 集合

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ============================================================
// 进化等级阈值
// ============================================================
const LEVEL_THRESHOLDS = [
  { level: 1, minConversations: 0,   label: '刚认识',   unlockedActions: ['idle', 'happy'] },
  { level: 2, minConversations: 10,  label: '初步了解', unlockedActions: ['idle', 'happy', 'curious', 'sleepy'] },
  { level: 3, minConversations: 50,  label: '很熟悉',   unlockedActions: ['idle', 'happy', 'curious', 'sleepy', 'playful', 'affectionate'] },
  { level: 4, minConversations: 100, label: '非常懂',   unlockedActions: ['idle', 'happy', 'curious', 'sleepy', 'playful', 'affectionate', 'excited', 'grooming', 'victory'] },
  { level: 5, minConversations: 200, label: '灵魂伙伴', unlockedActions: ['idle', 'happy', 'curious', 'sleepy', 'playful', 'affectionate', 'excited', 'grooming', 'victory', 'sad', 'tired', 'pet', 'startle', 'confused', 'eating'] },
]

function calcLevel(totalConversations) {
  let result = LEVEL_THRESHOLDS[0]
  for (const t of LEVEL_THRESHOLDS) {
    if (totalConversations >= t.minConversations) result = t
  }
  return result
}

// ============================================================
// 四维数据计算
// ============================================================

// contentment = 打卡频率 * 0.4 + 对话热度 * 0.3 + 游戏参与 * 0.3
function calcContentment(recentCheckins, recentConversations) {
  const checkinScore = Math.min(recentCheckins / 7, 1) * 100 // 最近7天
  const chatScore    = Math.min(recentConversations / 10, 1) * 100 // 最近7天对话数/10
  return Math.round(checkinScore * 0.4 + chatScore * 0.3 + 50 * 0.3) // 游戏参与暂用 50 基础分
}

// energy = 活跃特征权重 * 0.5 + 近期行为积极性 * 0.5 - 衰减因子
function calcEnergy(personality, daysSinceLastInteraction) {
  const hasActive = personality && (
    personality.includes('活泼') || personality.includes('好动') || personality.includes('贪玩')
  )
  const baseScore  = hasActive ? 65 : 45
  const decay      = Math.max(0, (daysSinceLastInteraction - 3) * 5) // 超过3天每天-5
  return Math.max(10, Math.min(100, Math.round(baseScore - decay)))
}

// affection = 互动频率 * 0.3 + 对话深度 * 0.4 + 一致性 * 0.3
function calcAffection(totalInteractions, deepConversationRatio, streakDays) {
  const freqScore  = Math.min(totalInteractions / 30, 1) * 100
  const depthScore = Math.min(deepConversationRatio, 1) * 100
  const streakScore = Math.min(streakDays / 30, 1) * 100
  return Math.min(100, Math.round(freqScore * 0.3 + depthScore * 0.4 + streakScore * 0.3))
}

// health = 打卡健康评分 * 0.6 + 无不适占比 * 0.4
function calcHealth(avgHealthScore, healthyRatio, hasDiscomfort) {
  let score = avgHealthScore * 0.6 + healthyRatio * 100 * 0.4
  if (hasDiscomfort) score = Math.max(0, score - 20)
  return Math.min(100, Math.max(0, Math.round(score)))
}

// ============================================================
// 主函数
// ============================================================
exports.main = async (event) => {
  const db  = cloud.database()
  const _   = db.command
  const { petId, userId } = event

  if (!petId || !userId) {
    return { success: false, error: '缺少 petId 或 userId' }
  }

  try {
    // 1. 读取宠物档案
    const petRes = await db.collection('pets').doc(petId).get().catch(() => null)
    const petInfo = petRes ? petRes.data : {}

    // 2. 读取最近 30 天打卡数据
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sevenDaysAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const checkinRes = await db.collection('checkins')
      .where({ petId, _openid: userId, createdAt: _.gt(thirtyDaysAgo) })
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get()
      .catch(() => ({ data: [] }))

    const allCheckins = checkinRes.data || []
    const recentCheckins = allCheckins.filter(c =>
      c.createdAt && new Date(c.createdAt) > sevenDaysAgo
    ).length

    // 3. 统计打卡健康相关指标
    const healthyCheckins = allCheckins.filter(c =>
      c.mood && !['uncomfortable', 'anxious', 'sad'].includes(c.mood)
    ).length
    const healthyRatio    = allCheckins.length > 0 ? healthyCheckins / allCheckins.length : 0.5
    const hasDiscomfort   = allCheckins.some(c => c.mood === 'uncomfortable')
    const avgHealthScore  = allCheckins.length > 0
      ? allCheckins.reduce((acc, c) => {
          const moodScores = { happy: 90, normal: 60, sad: 40, anxious: 35, angry: 30, uncomfortable: 20 }
          return acc + (moodScores[c.mood] || 50)
        }, 0) / allCheckins.length
      : 60

    // 4. 读取现有 avatar_state（含总互动次数、对话次数）
    const stateRes = await db.collection('pet_avatar_states')
      .where({ petId, _openid: userId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }))
    const existingState = stateRes.data && stateRes.data[0] ? stateRes.data[0] : null

    const totalInteractions  = existingState?.stats?.totalInteractions || 0
    const totalConversations = existingState?.stats?.totalConversations || 0
    const streakDays         = existingState?.stats?.streakDays || 0

    // 5. 估算最近7天对话数（从 pet_memory_events 可推算，此处简化用 totalConversations 比例）
    const recentConversations = Math.min(totalConversations, 10)

    // 6. 计算上次互动距今天数
    const lastInteractAt = existingState?.stats?.lastInteractionAt
      ? new Date(existingState.stats.lastInteractionAt)
      : new Date(0)
    const daysSinceLastInteraction = Math.floor(
      (Date.now() - lastInteractAt.getTime()) / (24 * 60 * 60 * 1000)
    )

    // 7. 读取性格标签（从 pet_memory_snapshot）
    const memRes = await db.collection('pet_memory_snapshot')
      .where({ petId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }))
    const snapshot = memRes.data && memRes.data[0] ? memRes.data[0] : {}
    const primaryTraits = snapshot.traits || petInfo.traits || []
    const recentMood    = snapshot.recentMood || 'neutral'

    // 8. 深度对话比例（超过5轮的对话占比，简化为对话数/总数比例）
    const deepConversationRatio = totalConversations > 0
      ? Math.min(totalConversations / 20, 1)
      : 0

    // 9. 计算四维数据
    const contentment = calcContentment(recentCheckins, recentConversations)
    const energy      = calcEnergy(primaryTraits, daysSinceLastInteraction)
    const affection   = calcAffection(totalInteractions, deepConversationRatio, streakDays)
    const health      = calcHealth(avgHealthScore, healthyRatio, hasDiscomfort)

    // 10. 计算进化等级
    const levelInfo   = calcLevel(totalConversations)
    const oldLevel    = existingState?.appearance?.level || 1
    const levelChanged = levelInfo.level > oldLevel

    // 11. 构建新状态
    const now = new Date().toISOString()
    const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const dimensions = { contentment, energy, affection, health }

    const personality = {
      primaryTraits:  primaryTraits.slice(0, 3),
      temperament:    primaryTraits.includes('活泼') || primaryTraits.includes('好动')
        ? 'extroverted' : 'calm',
      recentMood,
    }

    const appearance = {
      level:           levelInfo.level,
      levelLabel:      levelInfo.label,
      unlockedActions: levelInfo.unlockedActions,
      lastLevelUpAt:   levelChanged ? now : (existingState?.appearance?.lastLevelUpAt || now),
    }

    const stats = {
      totalInteractions,
      lastInteractionAt: existingState?.stats?.lastInteractionAt || now,
      streakDays,
      totalConversations,
    }

    // 12. 写入或更新
    if (existingState) {
      await db.collection('pet_avatar_states').doc(existingState._id).update({
        data: { dimensions, personality, appearance, stats, updatedAt: now, nextAutoUpdateAt: nextDay }
      })
    } else {
      await db.collection('pet_avatar_states').add({
        data: {
          petId, _openid: userId,
          dimensions, personality, appearance,
          stats: { totalInteractions: 0, lastInteractionAt: now, streakDays: 0, totalConversations: 0 },
          createdAt: now, updatedAt: now, nextAutoUpdateAt: nextDay,
        }
      })
    }

    return {
      success:      true,
      dimensions,
      personality,
      appearance,
      stats,
      levelChanged,
      newLevel:     levelInfo.level,
      levelLabel:   levelInfo.label,
    }
  } catch (e) {
    console.error('[updateAvatarState] 错误:', e)
    return { success: false, error: e.message }
  }
}
