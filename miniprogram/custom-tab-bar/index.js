// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    // 是否显示 AI 助手 tab（由云数据库 config 集合的 aiEnabled 字段控制）
    aiTabVisible: false,
  },

  lifetimes: {
    attached() {
      this._loadAiConfig()
    },
  },

  methods: {
    // 从云数据库读取 AI 功能开关
    _loadAiConfig() {
      const db = wx.cloud.database()
      db.collection('config').where({ key: 'aiEnabled' }).limit(1).get({
        success: (res) => {
          if (res.data && res.data.length > 0) {
            this.setData({ aiTabVisible: !!res.data[0].value })
          } else {
            this.setData({ aiTabVisible: false })
          }
        },
        fail: () => {
          this.setData({ aiTabVisible: false })
        }
      })
    },

    // 外部页面调用此方法切换高亮
    setSelected(index) {
      this.setData({ selected: index })
    },

    onTap(e) {
      const index = e.currentTarget.dataset.index
      const path  = e.currentTarget.dataset.path
      this.setData({ selected: index })
      wx.switchTab({ url: path })
    },
  },
})
