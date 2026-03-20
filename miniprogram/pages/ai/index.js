// pages/ai/index.js
Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    aiServices: [
      {
        id: 'health',
        icon: '🏥',
        title: '智能宠物问诊',
        desc: '描述症状，获取专业健康建议',
        color: '#26DE81',
        path: '/pages/healthchat/index'
      },
      {
        id: 'training',
        icon: '🎓',
        title: '智能训练师',
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
    // 同步自定义 tabBar 高亮（AI index = 1）
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setSelected(1)
    }
  },

  // 跳转到 AI 服务
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
