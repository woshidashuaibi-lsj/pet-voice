// pages/ai/index.js
Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    aiServices: [
      {
        id: 'health',
        icon: '🏥',
        title: '宠物健康咨询',
        desc: '描述症状，获取专业健康建议',
        color: '#26DE81',
        path: '/pages/healthchat/index'
      },
      {
        id: 'training',
        icon: '🎓',
        title: '宠物训练师',
        desc: '行为问题，定制专属训练方案',
        color: '#FF9F43',
        path: '/pages/training/index'
      }
    ],
    healthQuestions: [
      '宠物食欲不振怎么办？',
      '猫咪突然不爱理人',
      '宠物呕吐正常吗？',
      '宠物需要每年打疫苗吗？'
    ],
    trainingQuestions: [
      '狗狗拆家怎么训练？',
      '宠物随地大小便',
      '狗狗乱叫怎么办？',
      '猫咪抓家具怎么纠正？'
    ]
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    const statusBarHeight = systemInfo.statusBarHeight || 0;
    const navBarHeight = 44; // 微信小程序默认导航栏高度

    this.setData({
      statusBarHeight,
      navBarHeight
    });
  },

  onShow() {
    // 检查云端开关，未开放则直接跳回首页（防止提审时被看出 AI 功能）
    this._checkAiEnabled(() => {
      // 开放时才同步 tabBar 高亮
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setSelected(1)
      }
    })
  },

  // 检测 AI 功能是否开放
  _checkAiEnabled(onEnabled) {
    const db = wx.cloud.database()
    db.collection('config').where({ key: 'aiEnabled' }).limit(1).get({
      success: (res) => {
        const enabled = res.data && res.data.length > 0 && !!res.data[0].value
        if (!enabled) {
          // 未开放，静默跳回首页
          wx.switchTab({ url: '/pages/index/index' })
        } else {
          onEnabled && onEnabled()
        }
      },
      fail: () => {
        // 查询失败也跳回首页，保守处理
        wx.switchTab({ url: '/pages/index/index' })
      }
    })
  },

  // 跳转到专属服务
  goToService(e) {
    const { path } = e.currentTarget.dataset;
    wx.navigateTo({
      url: path,
      fail: () => {
        wx.showToast({
          title: '页面加载失败',
          icon: 'none'
        });
      }
    });
  },

  // 发送健康问题
  sendHealthQuestion(e) {
    const { question } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/healthchat/index?question=${encodeURIComponent(question)}`,
      fail: () => {
        wx.showToast({
          title: '页面加载失败',
          icon: 'none'
        });
      }
    });
  },

  // 发送训练问题
  sendTrainingQuestion(e) {
    const { question } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/trainingchat/index?question=${encodeURIComponent(question)}`,
      fail: () => {
        wx.showToast({
          title: '页面加载失败',
          icon: 'none'
        });
      }
    });
  }
});
