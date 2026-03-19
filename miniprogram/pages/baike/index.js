// pages/baike/index.js
const ALL_BAIKE = [
  { _id: 1, type: 'dog', title: '🐕 摇尾巴', desc: '狗狗摇尾巴不一定代表开心，不同速度和姿势含义不同。快速大幅摇摆通常是兴奋开心，缓慢摇摆可能是不确定，尾巴夹着摇则可能是害怕。', tags: ['开心', '警惕', '打招呼'] },
  { _id: 2, type: 'dog', title: '🐕 扑人',   desc: '狗狗扑人多半是打招呼、想玩或表示兴奋。如果频繁扑人需要适当训练，可以在它扑来时转身忽视，等它安静后再给予关注。', tags: ['打招呼', '想玩', '兴奋'] },
  { _id: 3, type: 'dog', title: '🐕 打哈欠', desc: '狗狗打哈欠不仅仅是困了，也可能是压力信号或安抚行为。当它在紧张环境中打哈欠，是在告诉你"我有点不舒服"。', tags: ['疲惫', '压力', '安抚'] },
  { _id: 4, type: 'dog', title: '🐕 啃爪子', desc: '偶尔舔爪子是正常的梳理行为，但频繁啃咬可能是过敏、焦虑或皮肤问题的信号，建议观察是否有红肿。', tags: ['梳理', '焦虑', '健康'] },
  { _id: 5, type: 'cat', title: '🐈 蹭人',   desc: '猫咪蹭人是在标记领地气味，表示对你的信任和喜爱。这是猫咪说"你是我的人"的方式，是最高级别的爱意表达。', tags: ['示爱', '领地', '信任'] },
  { _id: 6, type: 'cat', title: '🐈 踩奶',   desc: '踩奶是猫咪幼年时揉搓妈妈乳房促进泌乳的行为残留。成年后踩奶表示它感到极度放松和安全，你就是它的"妈妈"。', tags: ['放松', '开心', '安全感'] },
  { _id: 7, type: 'cat', title: '🐈 慢眨眼', desc: '猫咪对你慢慢眨眼，是猫界的"飞吻"，代表信任和放松。你可以对它回一个慢眨眼，双方都会感到更亲近。', tags: ['信任', '示爱', '放松'] },
  { _id: 8, type: 'cat', title: '🐈 露肚皮', desc: '猫咪把肚子露给你看是巨大的信任，因为肚子是最脆弱的部位。但注意，这不代表邀请你摸，很多猫咪不喜欢被摸肚子。', tags: ['信任', '放松', '示爱'] },
]

const app = getApp()

Page({
  data: {
    tabs: ['全部', '狗狗', '猫咪'],
    activeTab: '全部',
    keyword: '',
    filteredList: [],
    statusBarHeight: 0,
    navBarHeight: 44,
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight,
    })
    this.filterList()
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
    this.filterList()
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value })
    this.filterList()
  },

  filterList() {
    const { activeTab, keyword } = this.data
    let list = ALL_BAIKE
    if (activeTab === '狗狗') list = list.filter(i => i.type === 'dog')
    if (activeTab === '猫咪') list = list.filter(i => i.type === 'cat')
    if (keyword.trim()) {
      const kw = keyword.trim()
      list = list.filter(i =>
        i.title.includes(kw) || i.desc.includes(kw) || i.tags.some(t => t.includes(kw))
      )
    }
    this.setData({ filteredList: list })
  },
})
