// pages/index/index.js
const app = getApp()
const recorderManager = wx.getRecorderManager()

Page({
  data: {
    isRecording: false,
    duration:    0,
    petName:     '',
    petType:     'cat',
    todayMood:   '',
    statusBarHeight: 0,
    navBarHeight:    44,
  },

  onLoad() {
    // 读取 app.js 计算好的状态栏/导航栏高度（适配刘海屏/灵动岛）
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })

    // 录音结束回调 → 自动上传分析
    recorderManager.onStop((res) => {
      if (res.tempFilePath) {
        this.uploadAndAnalyze(res.tempFilePath)
      }
    })

    // 录音出错回调
    recorderManager.onError((err) => {
      console.error('录音错误:', err)
      wx.showToast({ title: '录音失败，请重试', icon: 'none' })
      this.setData({ isRecording: false })
      clearInterval(this._timer)
    })
  },

  onShow() {
    // 每次回到首页时刷新宠物信息和今日心情
    this.loadPetInfo()
    this.loadTodayMood()
  },

  // 从云数据库加载宠物档案
  async loadPetInfo() {
    const db = wx.cloud.database()
    const res = await db.collection('pets').limit(1).get().catch(() => ({ data: [] }))
    if (res.data[0]) {
      this.setData({ petName: res.data[0].name, petType: res.data[0].type || 'cat' })
    } else {
      this.setData({ petName: '', petType: 'cat' })
    }
  },

  // 从云数据库加载今日打卡心情
  async loadTodayMood() {
    const db = wx.cloud.database()
    const today = new Date().toISOString().slice(0, 10)
    const res = await db.collection('checkins')
      .where({ date: today })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }))
    this.setData({ todayMood: res.data[0] ? res.data[0].moodLabel : '' })
  },

  // 跳转宠物档案页
  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' })
  },

  // ===== 录音核心逻辑 =====

  // 长按开始录音
  onRecordStart() {
    if (this.data.isRecording) return
    wx.authorize({ scope: 'scope.record' })
      .then(() => {
        this.setData({ isRecording: true, duration: 0 })
        // 每秒更新计时，最长 15 秒自动停止
        this._timer = setInterval(() => {
          const d = this.data.duration + 1
          this.setData({ duration: d })
          if (d >= 15) this.onRecordEnd()
        }, 1000)
        recorderManager.start({
          format:          'mp3',
          sampleRate:      16000,
          numberOfChannels: 1,
          duration:        15000,
        })
      })
      .catch(() => {
        // 用户拒绝授权：引导去设置页开启
        wx.showModal({
          title:       '需要麦克风权限',
          content:     '请在设置中允许使用麦克风，用于录制宠物叫声进行情绪分析',
          confirmText: '去设置',
          cancelText:  '取消',
          success(res) {
            if (res.confirm) wx.openSetting()
          },
        })
      })
  },

  // 松手停止录音
  onRecordEnd() {
    if (!this.data.isRecording) return
    clearInterval(this._timer)
    this.setData({ isRecording: false })

    // 不足 3 秒，提示重录
    if (this.data.duration < 3) {
      wx.showToast({ title: '请至少录音 3 秒 🎙️', icon: 'none' })
      recorderManager.stop()
      return
    }
    recorderManager.stop()
    // 录音结束后由 recorderManager.onStop 回调处理上传
  },

  // 上传音频并跳转结果页
  async uploadAndAnalyze(tempFilePath) {
    // 没有宠物档案时，弹窗引导（不强制，用户可选择直接录）
    if (!this.data.petName) {
      wx.showModal({
        title:       '先创建宠物档案 🐾',
        content:     '填写宠物信息后翻译更准确，只需 10 秒～',
        confirmText: '去创建',
        cancelText:  '直接翻译',
        success:     (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/profile/index' })
          } else {
            // 用户选择跳过，用默认名字继续上传
            this._doUpload(tempFilePath)
          }
        },
      })
      return
    }
    this._doUpload(tempFilePath)
  },

  // 执行上传 & 跳转
  async _doUpload(tempFilePath) {
    wx.showLoading({ title: '上传中...', mask: true })
    try {
      // 上传到云存储（路径：audio/时间戳.mp3）
      const cloudPath = `audio/${Date.now()}.mp3`
      const { fileID } = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath,
      })
      wx.hideLoading()

      // 跳转结果页，携带云存储 fileID 和宠物信息
      wx.navigateTo({
        url: `/pages/result/index?taskId=${encodeURIComponent(fileID)}&petName=${encodeURIComponent(this.data.petName || '宠物')}&petType=${this.data.petType}`,
      })
    } catch (e) {
      wx.hideLoading()
      console.error('上传失败:', e)
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    }
  },
})
