// app.js
App({
  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-3gpof7zo2262d4f3',
      traceUser: true,
    })

    // 获取状态栏高度，供自定义导航栏适配刘海屏/灵动岛
    const sysInfo = wx.getSystemInfoSync()
    this.globalData.statusBarHeight = sysInfo.statusBarHeight || 0
    // 胶囊按钮位置（用于计算导航栏总高度）
    const menuBtn = wx.getMenuButtonBoundingClientRect()
    this.globalData.navBarHeight = menuBtn.bottom + menuBtn.top - sysInfo.statusBarHeight * 2
    this.globalData.navBarTop = sysInfo.statusBarHeight

    // 静默登录：获取 openid，更新云端用户记录
    this._silentLogin()

    // 尝试从本地缓存恢复用户信息（避免每次重新授权）
    const cached = wx.getStorageSync('userInfo')
    if (cached) {
      this.globalData.userInfo = cached
    }
  },

  // 静默登录（不弹授权窗），只获取 openid
  _silentLogin() {
    wx.login({
      success: () => {
        // wx.cloud 初始化后会自动维护 openid，无需额外操作
        // 后续可通过 cloud.callFunction 在云端获取 openid
      },
    })
  },

  // 供页面调用：获取用户头像昵称（需用户主动点击）
  // 返回 Promise<userInfo>
  getUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于展示您的个人信息',
        success: (res) => {
          const info = res.userInfo
          wx.setStorageSync('userInfo', info)
          this.globalData.userInfo = info
          resolve(info)
        },
        fail: (err) => {
          reject(err)
        },
      })
    })
  },

  globalData: {
    userInfo: null,
    petInfo: null,
    statusBarHeight: 0,
    navBarHeight: 44,
    navBarTop: 0,
  },
})
