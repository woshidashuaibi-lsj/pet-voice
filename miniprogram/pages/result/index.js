// pages/result/index.js

const EMOTION_MAP = {
  happy:         { label: '开心',   emoji: '😄', color: '#FF8C00' },
  anxious:       { label: '焦虑',   emoji: '😰', color: '#9B59B6' },
  angry:         { label: '愤怒',   emoji: '😠', color: '#E74C3C' },
  fearful:       { label: '恐惧',   emoji: '😱', color: '#3498DB' },
  hungry:        { label: '饥饿',   emoji: '🍖', color: '#E67E22' },
  playful:       { label: '想玩',   emoji: '🎾', color: '#2ECC71' },
  bored:         { label: '无聊',   emoji: '😑', color: '#95A5A6' },
  uncomfortable: { label: '不舒服', emoji: '🤒', color: '#E74C3C' },
}

const app = getApp()

Page({
  data: {
    result: null,
    loading: true,
    statusBarHeight: 0,
    navBarHeight: 44,
  },

  onLoad(options) {
    // 读取状态栏高度（适配刘海屏）
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })

    const petName = decodeURIComponent(options.petName || '宠物')
    const petType = options.petType || 'cat'
    const taskId  = options.taskId ? decodeURIComponent(options.taskId) : ''

    if (taskId) {
      // Step 4：全部走真实 AI 分析
      this._analyze(taskId, petName, petType)
    } else {
      // 没有 taskId（直接预览页面时）展示兜底 Mock，不报错
      this._applyMock(petName || '豆豆', petType || 'dog')
    }
  },

  // 兜底展示（无 taskId 时使用，如开发者直接打开页面预览）
  _applyMock(petName, petType) {
    this.setData({
      loading: false,
      result: {
        petName,
        petType,
        emotion:      'happy',
        emotionLabel: '开心',
        emotionEmoji: '😄',
        emotionColor: '#FF8C00',
        confidence:   92,
        description:  '主人回来啦！我好开心！想跟你玩球球～ 🎾',
        suggestion:   '可以陪它玩 5-10 分钟',
        healthAlert:  false,
      },
    })
  },

  // 真实 AI 分析：调用云函数 analyzeAudio
  async _analyze(taskId, petName, petType) {
    this.setData({ loading: true })
    wx.showLoading({ title: '🐾 翻译中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'analyzeAudio',
        data: { taskId, petName, petType },
      })
      wx.hideLoading()

      const raw  = res.result || {}
      const info = EMOTION_MAP[raw.emotion] || EMOTION_MAP.happy

      this.setData({
        loading: false,
        result: {
          petName,
          petType,
          emotion:      raw.emotion    || 'happy',
          emotionLabel: info.label,
          emotionEmoji: info.emoji,
          emotionColor: info.color,
          confidence:   raw.confidence || 70,
          description:  raw.description || `${petName}在跟你说话呢～`,
          suggestion:   raw.suggestion  || '',
          healthAlert:  !!raw.healthAlert,
        },
      })
    } catch (e) {
      wx.hideLoading()
      console.error('AI 分析失败:', e)

      // 兜底：展示友好默认结果，不让用户看到白屏
      const info = EMOTION_MAP.happy
      this.setData({
        loading: false,
        result: {
          petName,
          petType,
          emotion:      'happy',
          emotionLabel: info.label,
          emotionEmoji: info.emoji,
          emotionColor: info.color,
          confidence:   60,
          description:  `主人～${petName}想让你多陪陪我！快来摸摸我吧～ 🐾`,
          suggestion:   '陪伴是最好的礼物',
          healthAlert:  false,
        },
      })
      wx.showToast({ title: 'AI 繁忙，已用默认解读', icon: 'none', duration: 2500 })
    }
  },

  // 分享给好友（消息卡片）
  onShareAppMessage() {
    const r = this.data.result
    if (!r) return { title: '毛孩子翻译官 — 听懂你家宠物的话', path: '/pages/index/index' }
    return {
      title: `我家${r.petName}说：${r.description.slice(0, 20)}...`,
      path:  '/pages/index/index',
    }
  },

  // 分享到朋友圈（需在 index.json 开启 enableShareTimeline）
  onShareTimeline() {
    const r = this.data.result
    if (!r) return { title: '毛孩子翻译官 — 听懂你家宠物的话' }
    return {
      title: `我家${r.petName}${r.emotionEmoji}：${r.description.slice(0, 18)}...`,
    }
  },
})
