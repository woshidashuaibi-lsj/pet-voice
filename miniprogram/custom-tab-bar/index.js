// custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
  },

  methods: {
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
