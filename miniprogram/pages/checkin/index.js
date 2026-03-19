// pages/checkin/index.js
Page({
  data: {
    petName: '',
    petType: 'cat',
    selectedMood: 'happy',
    note: '',
    streakDays: 0,
    todayChecked: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    moods: [
      { key: 'happy',         emoji: '😄', label: '开心' },
      { key: 'normal',        emoji: '😐', label: '一般' },
      { key: 'sad',           emoji: '😔', label: '难过' },
      { key: 'anxious',       emoji: '😰', label: '焦虑' },
      { key: 'angry',         emoji: '😠', label: '生气' },
      { key: 'uncomfortable', emoji: '🤒', label: '不舒服' },
    ],
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
    })
    this.loadPetInfo()
    this.loadStreak()
    this.checkTodayCheckin()
  },

  async loadPetInfo() {
    const db = wx.cloud.database()
    const res = await db.collection('pets').limit(1).get().catch(() => ({ data: [] }))
    if (res.data[0]) {
      this.setData({ petName: res.data[0].name, petType: res.data[0].type })
    }
  },

  async checkTodayCheckin() {
    const db = wx.cloud.database()
    const today = new Date().toISOString().slice(0, 10)
    const res = await db.collection('checkins').where({ date: today }).count().catch(() => ({ total: 0 }))
    this.setData({ todayChecked: res.total > 0 })
  },

  async loadStreak() {
    const db = wx.cloud.database()
    const res = await db.collection('checkins')
      .orderBy('date', 'desc')
      .limit(30)
      .get()
      .catch(() => ({ data: [] }))

    let streak = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < res.data.length; i++) {
      const d = new Date(res.data[i].date)
      d.setHours(0, 0, 0, 0)
      const diff = Math.round((today - d) / 86400000)
      if (diff === i) streak++
      else break
    }
    this.setData({ streakDays: streak })
  },

  selectMood(e) {
    this.setData({ selectedMood: e.currentTarget.dataset.key })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  async doCheckin() {
    if (this.data.todayChecked) {
      wx.showToast({ title: '今天已经打卡啦 🎉', icon: 'none' })
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const moodInfo = this.data.moods.find(m => m.key === this.data.selectedMood)
    const db = wx.cloud.database()

    wx.showLoading({ title: '打卡中...', mask: true })
    try {
      await db.collection('checkins').add({
        data: {
          date:      today,
          mood:      this.data.selectedMood,
          moodLabel: moodInfo ? moodInfo.label : '',
          note:      this.data.note,
        }
      })
      wx.hideLoading()
      this.setData({ todayChecked: true, streakDays: this.data.streakDays + 1 })
      wx.showToast({ title: '打卡成功 🎉', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (e) {
      wx.hideLoading()
      console.error('打卡失败:', e)
      wx.showToast({ title: '打卡失败，请重试', icon: 'none' })
    }
  },
})
