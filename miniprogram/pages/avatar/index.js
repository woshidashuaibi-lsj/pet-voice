// pages/avatar/index.js
const app = getApp()

// ============================================================
// 动作库（15 个核心动作）
// ============================================================
const ANIMATION_LIBRARY = {
  idle:        { name: '待机',   duration: 3000, loop: true  },
  sleep:       { name: '睡眠',   duration: 5000, loop: true  },
  happy:       { name: '开心',   duration: 1800, loop: false },
  sad:         { name: '难受',   duration: 2000, loop: false },
  curious:     { name: '好奇',   duration: 1500, loop: false },
  playful:     { name: '调皮',   duration: 1600, loop: false },
  pet:         { name: '被摸',   duration: 1200, loop: false },
  startle:     { name: '惊吓',   duration: 1000, loop: false },
  excited:     { name: '兴奋',   duration: 1500, loop: false },
  tired:       { name: '疲倦',   duration: 2000, loop: false },
  confused:    { name: '困惑',   duration: 1200, loop: false },
  eating:      { name: '进食',   duration: 2500, loop: false },
  grooming:    { name: '整理',   duration: 3000, loop: false },
  affectionate:{ name: '亲昵',   duration: 1800, loop: false },
  victory:     { name: '胜利',   duration: 2000, loop: false },
  sleepy:      { name: '困倦',   duration: 2000, loop: false },
}

// ============================================================
// 点击交互配置
// ============================================================
const CLICK_INTERACTION = {
  head: {
    probability: 0.7,
    animations: ['curious', 'pet'],
    boost:  { affection: 3, contentment: 2 },
    dialogs: ['你摸我头干嘛呢？', '这样挠舒服~', '嗯嗯~'],
    cooldown: 500,
    effect: null,
  },
  back: {
    probability: 0.85,
    animations: ['pet', 'happy'],
    boost:  { affection: 5, contentment: 3 },
    dialogs: ['嗯~舒服', '继续摸~', '好舒服啊！'],
    cooldown: 300,
    effect: null,
  },
  body: {
    probability: 0.6,
    animations: ['playful', 'excited'],
    boost:  { affection: 2, contentment: 2 },
    dialogs: ['来玩吗？', '你干嘛呢', '！'],
    cooldown: 400,
    effect: null,
  },
  tail: {
    probability: 0.5,
    animations: ['playful', 'startle'],
    boost:  { affection: 2, contentment: 4 },
    dialogs: ['别拉尾巴！', '坏蛋~', 'Σ(っ °Д °;)っ'],
    cooldown: 600,
    effect: null,
  },
  double_tap: {
    probability: 0.9,
    animations: ['excited', 'victory'],
    boost:  { affection: 10, contentment: 8 },
    dialogs: ['主人最好了！', '太开心了！💕'],
    cooldown: 2000,
    effect: 'hearts',
  },
  long_press: {
    probability: 1.0,
    animations: ['affectionate'],
    boost:  { affection: 15, contentment: 10, health: 5 },
    dialogs: ['和你在一起真幸福~', '不要走...💕'],
    cooldown: 5000,
    effect: 'glow',
  },
}

// ============================================================
// 进化等级阈值
// ============================================================
const LEVEL_THRESHOLDS = [
  { level: 1, minConversations: 0,   label: '刚认识',   nextMin: 10  },
  { level: 2, minConversations: 10,  label: '初步了解', nextMin: 50  },
  { level: 3, minConversations: 50,  label: '很熟悉',   nextMin: 100 },
  { level: 4, minConversations: 100, label: '非常懂',   nextMin: 200 },
  { level: 5, minConversations: 200, label: '灵魂伙伴', nextMin: 200 },
]

// ============================================================
// Page
// ============================================================
Page({
  data: {
    loading: true,
    petId:   '',
    petName: '',
    petType: 'cat',
    petEmoji: '🐱',

    // 宠物分身状态
    dimensions:  { contentment: 50, energy: 50, affection: 50, health: 50 },
    personality: { primaryTraits: [], temperament: 'calm', recentMood: 'neutral' },
    appearance:  { level: 1, levelLabel: '刚认识', unlockedActions: ['idle', 'happy'] },
    stats:       { totalInteractions: 0, totalConversations: 0, streakDays: 0 },

    // UI 状态
    currentAnim:   'anim-idle',
    moodSegment:   'neutral',
    isNight:       false,
    showDialog:    false,
    dialogText:    '',
    showEffect:    false,
    effectType:    '',
    showFloatNum:  false,
    floatNumText:  '',
    levelProgress: 0,
    nextLevelConvs: 10,
    showLevelUp:   false,
    dimColors:     { contentment: 'dim-yellow', energy: 'dim-yellow', affection: 'dim-yellow', health: 'dim-yellow' },

    statusBarHeight: 0,
    navBarHeight:    44,
  },

  // 内部状态（不放 data 避免频繁 setData）
  _cooldowns:    {},
  _lastTapTime:  0,
  _touchStartTime: 0,
  _longPressTimer: null,
  _idleTimer:    null,
  _animTimer:    null,
  _stateDocId:   null,

  onLoad() {
    const app = getApp()
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight:    app.globalData.navBarHeight || 44,
      isNight: this._checkNight(),
    })
    this._loadAvatarState()
  },

  onUnload() {
    // 清理定时器
    if (this._idleTimer)   clearTimeout(this._idleTimer)
    if (this._animTimer)   clearTimeout(this._animTimer)
    if (this._longPressTimer) clearTimeout(this._longPressTimer)
  },

  // ============================================================
  // 数据加载
  // ============================================================
  async _loadAvatarState() {
    const db = wx.cloud.database()

    // 1. 获取宠物档案
    try {
      const petRes = await db.collection('pets').limit(1).get()
      const petInfo = petRes.data && petRes.data[0] ? petRes.data[0] : {}
      const petId   = petInfo._id || ''
      const petName = petInfo.name || '我的宠物'
      const petType = petInfo.type || 'cat'
      const petEmoji = petType === 'cat' ? '🐱' : '🐶'

      this.setData({ petId, petName, petType, petEmoji })

      if (!petId) {
        // 没有宠物档案，用默认数据
        this._applyDefaultState()
        return
      }

      // 2. 查询 avatar_state
      const openid = app.globalData.openid || ''
      const stateRes = await db.collection('pet_avatar_states')
        .where({ petId })
        .limit(1)
        .get()
        .catch(() => ({ data: [] }))

      if (stateRes.data && stateRes.data[0]) {
        // 已有数据 → 检查是否需要更新
        const state = stateRes.data[0]
        this._stateDocId = state._id

        // 判断是否需要重新计算（超过24小时）
        const nextUpdate = state.nextAutoUpdateAt ? new Date(state.nextAutoUpdateAt) : new Date(0)
        if (Date.now() > nextUpdate.getTime()) {
          // 后台静默更新，先用现有数据展示
          this._applyState(state, false)
          wx.cloud.callFunction({
            name: 'updateAvatarState',
            data: { petId, userId: openid },
          }).then(res => {
            if (res.result?.success) {
              this._applyStateFromCloudResult(res.result)
            }
          }).catch(() => {})
        } else {
          this._applyState(state, true)
        }
      } else {
        // 首次创建
        const res = await wx.cloud.callFunction({
          name: 'updateAvatarState',
          data: { petId, userId: openid },
        })
        if (res.result?.success) {
          this._applyStateFromCloudResult(res.result)
        } else {
          this._applyDefaultState()
        }
      }
    } catch (e) {
      console.error('[avatar] 加载失败:', e)
      this._applyDefaultState()
    }
  },

  _applyDefaultState() {
    const dims = { contentment: 60, energy: 55, affection: 40, health: 70 }
    this.setData({
      loading: false,
      dimensions:    dims,
      personality:   { primaryTraits: [], temperament: 'calm', recentMood: 'neutral' },
      appearance:    { level: 1, levelLabel: '刚认识', unlockedActions: ['idle', 'happy'] },
      stats:         { totalInteractions: 0, totalConversations: 0, streakDays: 0 },
      moodSegment:   'neutral',
      levelProgress: 0,
      nextLevelConvs: 10,
      dimColors:     this._calcDimColors(dims),
    })
    this._startIdleBehavior()
  },

  _applyState(state, finishLoading) {
    const dims     = state.dimensions  || { contentment: 50, energy: 50, affection: 50, health: 50 }
    const pers     = state.personality || { primaryTraits: [], temperament: 'calm', recentMood: 'neutral' }
    const appear   = state.appearance  || { level: 1, levelLabel: '刚认识', unlockedActions: ['idle', 'happy'] }
    const stats    = state.stats       || { totalInteractions: 0, totalConversations: 0, streakDays: 0 }
    const mood     = this._calcMoodSegment(dims)
    const { progress, nextMin } = this._calcLevelProgress(appear.level, stats.totalConversations)

    this.setData({
      loading: finishLoading ? false : this.data.loading,
      dimensions:    dims,
      personality:   pers,
      appearance:    appear,
      stats,
      moodSegment:   mood,
      levelProgress: progress,
      nextLevelConvs: Math.max(0, nextMin - stats.totalConversations),
      dimColors:     this._calcDimColors(dims),
    })

    if (finishLoading) {
      this.setData({ loading: false })
      this._startIdleBehavior()
    }
  },

  _applyStateFromCloudResult(result) {
    const dims   = result.dimensions  || { contentment: 50, energy: 50, affection: 50, health: 50 }
    const pers   = result.personality || { primaryTraits: [], temperament: 'calm', recentMood: 'neutral' }
    const appear = result.appearance  || { level: 1, levelLabel: '刚认识', unlockedActions: ['idle', 'happy'] }
    const stats  = result.stats       || { totalInteractions: 0, totalConversations: 0, streakDays: 0 }
    const mood   = this._calcMoodSegment(dims)
    const { progress, nextMin } = this._calcLevelProgress(appear.level, stats.totalConversations)

    const oldLevel = this.data.appearance?.level || 1
    const levelChanged = result.levelChanged && result.newLevel > oldLevel

    this.setData({
      loading:       false,
      dimensions:    dims,
      personality:   pers,
      appearance:    appear,
      stats,
      moodSegment:   mood,
      levelProgress: progress,
      nextLevelConvs: Math.max(0, nextMin - stats.totalConversations),
      showLevelUp:   levelChanged,
      dimColors:     this._calcDimColors(dims),
    })

    this._startIdleBehavior()
  },

  // ============================================================
  // 颜色辅助
  // ============================================================
  _getDimColor(val) {
    if (val > 60) return 'dim-green'
    if (val > 30) return 'dim-yellow'
    return 'dim-red'
  },

  _calcDimColors(dims) {
    return {
      contentment: this._getDimColor(dims.contentment),
      energy:      this._getDimColor(dims.energy),
      affection:   this._getDimColor(dims.affection),
      health:      this._getDimColor(dims.health),
    }
  },

  // ============================================================
  // 情绪计算
  // ============================================================
  _calcMoodSegment(dims) {
    const score = dims.contentment * 0.3 + dims.energy * 0.2
      + dims.affection * 0.3 + dims.health * 0.2
    if (score > 80) return 'very_happy'
    if (score > 60) return 'happy'
    if (score > 40) return 'neutral'
    if (score > 20) return 'sad'
    return 'very_sad'
  },

  _calcLevelProgress(level, totalConversations) {
    const current = LEVEL_THRESHOLDS.find(t => t.level === level) || LEVEL_THRESHOLDS[0]
    const next    = LEVEL_THRESHOLDS.find(t => t.level === level + 1) || current
    if (level >= 5) return { progress: 100, nextMin: 200 }
    const range   = next.minConversations - current.minConversations
    const done    = Math.max(0, totalConversations - current.minConversations)
    return {
      progress: Math.min(100, Math.round((done / range) * 100)),
      nextMin:  next.minConversations,
    }
  },

  _checkNight() {
    const h = new Date().getHours()
    return h >= 22 || h < 8
  },

  // ============================================================
  // 动画系统
  // ============================================================
  _playAnim(animName) {
    const anim = ANIMATION_LIBRARY[animName]
    if (!anim) return

    // 检查该动作是否已解锁
    const unlocked = this.data.appearance?.unlockedActions || ['idle', 'happy']
    if (!unlocked.includes(animName) && !['idle', 'sleep'].includes(animName)) {
      animName = 'happy' // 未解锁时降级到 happy
    }

    // 清除上一个非循环动画的复位定时器
    if (this._animTimer) {
      clearTimeout(this._animTimer)
      this._animTimer = null
    }

    this.setData({ currentAnim: `anim-${animName}` })

    if (!anim.loop) {
      // 非循环动画：播放完毕后回到 idle
      this._animTimer = setTimeout(() => {
        this._startIdleBehavior()
      }, anim.duration + 200)
    }
  },

  _startIdleBehavior() {
    if (this._idleTimer) clearTimeout(this._idleTimer)

    const isNight = this._checkNight()
    const energy  = this.data.dimensions.energy

    if (isNight || energy < 20) {
      // 夜晚 or 低能量 → 睡眠
      this.setData({ currentAnim: 'anim-sleep', isNight })
    } else {
      // 白天 → 随机待机行为
      this.setData({ currentAnim: 'anim-idle', isNight })
      // 5~10 秒后随机播放一个小动作
      const delay = 5000 + Math.random() * 5000
      this._idleTimer = setTimeout(() => {
        const idleAnims = ['grooming', 'curious', 'sleepy']
        const pick = idleAnims[Math.floor(Math.random() * idleAnims.length)]
        this._playAnim(pick)
      }, delay)
    }
  },

  // ============================================================
  // 点击交互系统
  // ============================================================
  onTap(e) {
    const now = Date.now()

    // 双击检测（两次间隔 < 300ms）
    if (now - this._lastTapTime < 300) {
      this._lastTapTime = 0
      this._handleInteraction('double_tap', e)
      return
    }

    this._lastTapTime = now

    // 单击：延迟 300ms 确认不是双击
    setTimeout(() => {
      if (Date.now() - this._lastTapTime >= 300 && this._lastTapTime !== 0) {
        // 判断点击区域
        const zone = this._detectZone(e)
        this._handleInteraction(zone, e)
      }
    }, 300)
  },

  onTouchStart(e) {
    this._touchStartTime = Date.now()
    // 长按检测：按住 3 秒
    this._longPressTimer = setTimeout(() => {
      this._longPressTimer = null
      this._handleInteraction('long_press', e)
    }, 3000)
  },

  onTouchEnd() {
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer)
      this._longPressTimer = null
    }
  },

  onLongPress(e) {
    // 微信自带 longpress 事件（500ms），作为备用
    // 我们的 3 秒长按已在 onTouchStart 中处理，这里不重复
  },

  // 判断点击区域（根据点击坐标在宠物模型中的相对位置）
  _detectZone(e) {
    const touch = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0])
    if (!touch) return 'body'

    const relY = touch.clientY // 相对整个屏幕的 Y 坐标

    // 获取宠物模型在页面中的位置（通过 SelectorQuery）
    // 简化方案：根据触摸时的相对位置粗略判断
    // 上 25%: head, 上 25-65%: back, 65-85%: body, 85-100%: tail
    const query = wx.createSelectorQuery()
    query.select('#pet-model').boundingClientRect(rect => {
      if (!rect) return
      const ratio = (touch.clientY - rect.top) / rect.height
      // 此回调是异步的，用于下次点击时精准判断
      this._lastRatioY = ratio
    }).exec()

    const ratio = this._lastRatioY || 0.5
    if (ratio < 0.25) return 'head'
    if (ratio < 0.65) return 'back'
    if (ratio < 0.85) return 'body'
    return 'tail'
  },

  // 核心交互处理
  _handleInteraction(area, e) {
    const config = CLICK_INTERACTION[area]
    if (!config) return

    // 冷却检测
    const now = Date.now()
    const lastTime = this._cooldowns[area] || 0
    if (now - lastTime < config.cooldown) return
    this._cooldowns[area] = now

    // 根据性格和状态调整响应
    const adjusted = this._getAdjustedResponse(config, area)

    // 概率检查
    if (Math.random() > adjusted.probability) {
      // 失败时显示困惑
      this._playAnim('confused')
      return
    }

    // 选择动作
    const unlocked  = this.data.appearance?.unlockedActions || ['idle', 'happy']
    const available = adjusted.animations.filter(a => unlocked.includes(a))
    const animName  = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : 'happy'

    this._playAnim(animName)

    // 显示对话气泡
    const dialog = adjusted.dialogs[Math.floor(Math.random() * adjusted.dialogs.length)]
    this._showDialog(dialog)

    // 显示特效
    if (adjusted.effect) {
      this._showEffect(adjusted.effect)
    }

    // 更新前端维度（乐观更新，不等云函数）
    const boost = adjusted.boost
    const newDims = { ...this.data.dimensions }
    const floatParts = []
    for (const [key, delta] of Object.entries(boost)) {
      newDims[key] = Math.min(100, (newDims[key] || 50) + delta)
      const label = { affection: '亲密', contentment: '满足', health: '健康', energy: '精力' }[key] || key
      floatParts.push(`+${delta} ${label}`)
    }
    const newMood = this._calcMoodSegment(newDims)
    this.setData({
      dimensions: newDims,
      moodSegment: newMood,
      dimColors: this._calcDimColors(newDims),
    })
    this._showFloatNum(floatParts[0] || '')

    // 异步记录到云端（不阻塞 UI）
    if (this.data.petId) {
      wx.cloud.callFunction({
        name: 'recordInteraction',
        data: {
          petId:           this.data.petId,
          userId:          app.globalData?.openid || '',
          interactionType: area,
          timestamp:       new Date().toISOString(),
        },
      }).catch(() => {})
    }
  },

  // 根据性格和状态调整响应
  _getAdjustedResponse(config, area) {
    const adjusted = {
      probability: config.probability,
      animations:  [...config.animations],
      boost:       { ...config.boost },
      dialogs:     [...config.dialogs],
      effect:      config.effect,
    }

    const dims       = this.data.dimensions
    const traits     = this.data.personality?.primaryTraits || []

    // 性格调整：粘人的宠物更喜欢被摸
    if (traits.includes('粘人') && area === 'back') {
      adjusted.probability = Math.min(1, adjusted.probability + 0.15)
    }

    // 低能量/低健康 → 不太想互动
    if (dims.energy < 30 || dims.health < 40) {
      adjusted.probability  *= 0.5
      adjusted.animations    = ['tired', 'sad']
      adjusted.dialogs       = ['我有点累...', '让我休息会']
      adjusted.boost         = { affection: 1, contentment: 0 }
    }

    // 高亲密度 → 更积极
    if (dims.affection > 80 && !['double_tap', 'long_press'].includes(area)) {
      adjusted.animations.push('affectionate')
      adjusted.boost.affection = (adjusted.boost.affection || 0) + 3
    }

    // 夜晚 → 睡眠状态
    if (this._checkNight() && !['double_tap', 'long_press'].includes(area)) {
      adjusted.animations = ['sleep']
      adjusted.dialogs    = ['Zzzz...', '让我睡一会...', '好困~']
      adjusted.probability *= 0.3
    }

    return adjusted
  },

  // ============================================================
  // UI 反馈
  // ============================================================
  _showDialog(text) {
    if (this._dialogTimer) clearTimeout(this._dialogTimer)
    this.setData({ showDialog: true, dialogText: text })
    this._dialogTimer = setTimeout(() => {
      this.setData({ showDialog: false })
    }, 2000)
  },

  _showEffect(type) {
    this.setData({ showEffect: true, effectType: type })
    setTimeout(() => {
      this.setData({ showEffect: false })
    }, 1200)
  },

  _showFloatNum(text) {
    if (!text) return
    this.setData({ showFloatNum: true, floatNumText: text })
    setTimeout(() => {
      this.setData({ showFloatNum: false })
    }, 1500)
  },

  // ============================================================
  // 升级弹窗
  // ============================================================
  closeLevelUp() {
    this.setData({ showLevelUp: false })
    // 播放胜利动画
    this._playAnim('victory')
  },

  noop() {},
})
