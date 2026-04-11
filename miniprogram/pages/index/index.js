// pages/index/index.js
const app = getApp()

Page({
  data: {
    petName:     '',
    petType:     'cat',
    statusBarHeight: 0,
    navBarHeight:    44,
  },

  onLoad() {
    // 读取 app.js 计算好的状态栏/导航栏高度（适配刘海屏/灵动岛）
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })
  },

  onShow() {
    // 每次回到首页时刷新宠物信息
    this.loadPetInfo()
    // 同步自定义 tabBar 高亮（首页 index = 0）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(0)
    }
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

  // 跳转宠物档案页
  goProfile() {
    wx.navigateTo({ url: '/pages/profile/index' })
  },
})
