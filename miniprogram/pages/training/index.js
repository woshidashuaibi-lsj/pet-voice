// pages/training/index.js
const app = getApp()

// ============================================================
// 训练课程数据库
// ============================================================
const TRAINING_DATA = [
  // ---- 基础指令（猫狗通用）----
  {
    _id: 1, type: 'all', petLabel: '🐱🐶 通用',
    tag: '基础指令', tagColor: '#3498DB',
    level: '入门', levelColor: '#27AE60',
    title: '坐下（Sit）—— 第一个必学指令',
    summary: '「坐下」是所有训练的基石，学会它才能开启后续所有技能！',
    duration: '5-10 分钟/天',
    steps: [
      '准备零食（小粒、气味浓的），让宠物保持注意力',
      '手持零食放在宠物鼻子前，缓慢向后上方移动',
      '宠物头往上抬、屁股自然往下坐时，立即说「坐下」',
      '一旦坐下就马上给零食 + 大力表扬',
      '重复 5-8 次后暂停，避免过度学习',
    ],
    tips: [
      '每次训练不超过 10 分钟，保持新鲜感',
      '零食要提前剪成绿豆大小，一次不给太多',
      '失败了不要惩罚，重新引导即可',
      '等宠物完全坐稳再给奖励，不要太急',
    ],
    difficulty: 1,
  },
  {
    _id: 2, type: 'all', petLabel: '🐱🐶 通用',
    tag: '基础指令', tagColor: '#3498DB',
    level: '入门', levelColor: '#27AE60',
    title: '等等（Wait/Stay）—— 培养自控力',
    summary: '让宠物学会等待，是安全出行、开门不乱跑的关键技能。',
    duration: '5-10 分钟/天',
    steps: [
      '先让宠物「坐下」（确保会了再练等待）',
      '手掌朝向宠物做「停」的手势，说「等等」',
      '向后退一小步，保持眼神接触',
      '等宠物保持静止 2-3 秒，立即回来给奖励',
      '逐渐拉长等待时间（3秒→5秒→10秒→更久）',
    ],
    tips: [
      '初期距离保持在 1 步以内，成功率要高',
      '如果宠物站起来，温和地让它重新坐好，不要大声训斥',
      '等待时间要循序渐进，不要一开始就要求太长',
      '练习到 30 秒以上后，可以尝试短暂离开视线',
    ],
    difficulty: 2,
  },
  {
    _id: 3, type: 'all', petLabel: '🐱🐶 通用',
    tag: '基础指令', tagColor: '#3498DB',
    level: '入门', levelColor: '#27AE60',
    title: '过来（Come）—— 最重要的安全指令',
    summary: '召回指令是宠物安全的最后一道防线，在户外遇到危险时能救命！',
    duration: '10 分钟/天',
    steps: [
      '在家中短距离开始，蹲下来张开双臂，热情地喊名字+「过来」',
      '宠物靠近时立即给最好吃的零食，并大力抚摸表扬',
      '永远不要在宠物过来后做它不喜欢的事（洗澡、剪指甲）',
      '逐渐在不同房间、不同干扰环境下练习',
      '户外时先用长绳辅助，确保安全',
    ],
    tips: [
      '「过来」的奖励要比其他指令都丰厚，让它觉得这是最值得做的事',
      '永远不要叫宠物过来然后惩罚它，会毁掉这个指令',
      '如果宠物不来，不要追它，转身走开往往反而有效',
      '每天练习，保持这个指令的新鲜感',
    ],
    difficulty: 2,
  },
  // ---- 狗狗专属 ----
  {
    _id: 4, type: 'dog', petLabel: '🐶 狗狗',
    tag: '行为纠正', tagColor: '#E74C3C',
    level: '进阶', levelColor: '#E67E22',
    title: '停止乱叫 —— 安静指令训练法',
    summary: '狗狗乱叫是最常见的问题，用对方法能有效减少 80% 的吠叫。',
    duration: '全天随机训练',
    steps: [
      '找出触发吠叫的原因（门铃/陌生人/其他狗），分别针对训练',
      '当狗狗开始吠叫时，不要大声制止（它会以为你也在叫）',
      '平静地说「安静」，手持零食放在狗狗鼻子前',
      '狗狗停止吠叫（哪怕只是为了闻零食）立即说「对了！」并给零食',
      '练习控制吠叫时长：先要求停 2 秒，逐渐延长',
    ],
    tips: [
      '狗狗吠叫大多是因为需求未被满足（无聊/焦虑/领地意识），根本解决要找原因',
      '增加每天运动量，精力消耗后吠叫会明显减少',
      '绝对不要用打、喷水等惩罚方式，会增加焦虑',
      '对于分离焦虑引起的吠叫，需要单独训练',
    ],
    difficulty: 3,
  },
  {
    _id: 5, type: 'dog', petLabel: '🐶 狗狗',
    tag: '礼貌行为', tagColor: '#9B59B6',
    level: '入门', levelColor: '#27AE60',
    title: '不扑人 —— 训练礼貌打招呼',
    summary: '扑人是热情但危险的行为，尤其对老人小孩有安全隐患，必须从小纠正。',
    duration: '每次见面时训练',
    steps: [
      '当狗狗扑上来时，立即转身背对它，完全无视',
      '四脚着地后立即转回来，给予热情的注意和奖励',
      '如果再次扑上来，再次转身',
      '告知所有家人和访客统一执行这个方法',
      '练习「坐下打招呼」：要求先坐下才给关注',
    ],
    tips: [
      '一致性最重要，全家人要统一标准，不能有时允许有时不允许',
      '不要用膝盖顶、踩脚等方法，可能造成伤害',
      '从幼犬期就开始训练，成年后纠正要更有耐心',
      '无视要彻底，连眼神接触都不能给',
    ],
    difficulty: 2,
  },
  {
    _id: 6, type: 'dog', petLabel: '🐶 狗狗',
    tag: '进阶技能', tagColor: '#F39C12',
    level: '进阶', levelColor: '#E67E22',
    title: '握手（Shake）—— 最受欢迎的社交技能',
    summary: '握手是狗狗最讨喜的技能，学会后见谁都能"交朋友"！',
    duration: '5 分钟/天',
    steps: [
      '让狗狗先坐下',
      '手握零食，放在狗狗鼻子前下方，等它用爪子扒你的手',
      '一旦爪子抬起接触你的手，立即说「握手」并给零食',
      '逐渐要求主动把爪子放进你张开的手心',
      '加入手势：伸出手掌，狗狗主动来握',
    ],
    tips: [
      '有些狗狗不喜欢别人碰爪子，先做触碰爪子的脱敏训练',
      '左右爪分开练习，可以教会「左手」「右手」两个指令',
      '不要强行拉起爪子，要让狗狗自主完成动作',
    ],
    difficulty: 2,
  },
  // ---- 猫咪专属 ----
  {
    _id: 7, type: 'cat', petLabel: '🐱 猫咪',
    tag: '基础训练', tagColor: '#3498DB',
    level: '入门', levelColor: '#27AE60',
    title: '猫咪也能训练！响片训练入门',
    summary: '响片训练（Clicker Training）是训练猫咪最高效的方法，比你想象的容易！',
    duration: '3-5 分钟/次，每天 2-3 次',
    steps: [
      '购买响片（或用圆珠笔代替），准备猫咪最爱的零食',
      '第一步「充电」：按一下响片，立即给零食，重复 20 次建立条件反射',
      '当猫咪做出你想要的动作时，立即按响片+给零食',
      '加入语言指令：在猫咪做动作时说出指令名称',
      '逐渐过渡到指令→动作→响片→零食的流程',
    ],
    tips: [
      '时机至关重要：动作发生的瞬间按响片，误差不超过 0.5 秒',
      '每次训练在猫咪主动靠近时进行，不要强迫',
      '饭前训练效果最好，猫咪更有食物动力',
      '猫咪比狗狗更需要短时间、高频次的训练',
    ],
    difficulty: 1,
  },
  {
    _id: 8, type: 'cat', petLabel: '🐱 猫咪',
    tag: '行为引导', tagColor: '#E74C3C',
    level: '进阶', levelColor: '#E67E22',
    title: '停止抓家具 —— 正向引导法',
    summary: '猫咪抓家具是天性，正确引导比惩罚有效 10 倍！',
    duration: '日常随时引导',
    steps: [
      '准备合适的猫抓板（材质最好是瓦楞纸或麻绳，放在被抓家具旁边）',
      '在猫抓板上喷猫薄荷，引导猫咪靠近探索',
      '当猫咪主动抓猫抓板时，立即给零食+夸奖',
      '当猫咪抓家具时，平静地抱起它放到猫抓板前，再次引导',
      '可以在家具上贴双面胶（猫讨厌黏黏的感觉），引导偏好猫抓板',
    ],
    tips: [
      '猫抓板的位置很重要：放在猫咪喜欢待的地方，而不是角落里',
      '猫抓板要足够高，让猫咪能完全伸展身体（建议 60cm 以上）',
      '定期修剪猫爪，减少抓家具的破坏力',
      '绝对不要体罚，会增加焦虑反而加剧问题',
    ],
    difficulty: 2,
  },
  {
    _id: 9, type: 'cat', petLabel: '🐱 猫咪',
    tag: '进阶技能', tagColor: '#F39C12',
    level: '高级', levelColor: '#C0392B',
    title: '击掌（High Five）—— 猫咪最酷的技能',
    summary: '利用响片训练教猫咪击掌，让所有来访朋友都惊叹！',
    duration: '3-5 分钟/次',
    steps: [
      '确保猫咪已熟练掌握响片训练基础',
      '将零食握在手中，举起手到猫咪脸前高度',
      '等猫咪用爪子扒你手时，立即响片+给零食',
      '逐渐改成张开手掌，等猫咪主动击掌',
      '加入指令「击掌」，最终可以徒手完成',
    ],
    tips: [
      '这个技能通常需要 2-4 周才能稳定，不要急',
      '每次只练 3-5 分钟，保持猫咪的新鲜感和兴趣',
      '如果猫咪不感兴趣就停止，明天再试',
    ],
    difficulty: 3,
  },
]

Page({
  data: {
    tabs: ['全部', '猫咪', '狗狗'],
    activeTab: '全部',
    filteredList: [],
    showDetail: false,
    currentItem: null,
    statusBarHeight: 0,
    navBarHeight: 44,
    aiVisible: false, // 由云端 aiEnabled 字段控制 AI 入口是否展示
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })
    this._filterList()
    this._loadAiConfig()
  },

  // 从云数据库读取 AI 功能开关
  _loadAiConfig() {
    const db = wx.cloud.database()
    db.collection('config').where({ key: 'aiEnabled' }).limit(1).get({
      success: (res) => {
        const enabled = res.data && res.data.length > 0 && !!res.data[0].value
        this.setData({ aiVisible: enabled })
      },
      fail: () => {
        this.setData({ aiVisible: false })
      }
    })
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
    this._filterList()
  },

  _filterList() {
    const { activeTab } = this.data
    let list = TRAINING_DATA
    if (activeTab === '猫咪') list = list.filter(i => i.type === 'cat' || i.type === 'all')
    if (activeTab === '狗狗') list = list.filter(i => i.type === 'dog' || i.type === 'all')
    this.setData({ filteredList: list })
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id
    const item = TRAINING_DATA.find(i => i._id === id)
    if (item) {
      this.setData({ showDetail: true, currentItem: item })
    }
  },

  closeDetail() {
    this.setData({ showDetail: false, currentItem: null })
  },

  noop() {},

  goAskTrainer() {
    wx.navigateTo({ url: '/pages/trainingchat/index' })
  },

  goAskTrainerWithTopic() {
    const title = this.data.currentItem?.title || ''
    this.setData({ showDetail: false })
    wx.navigateTo({
      url: `/pages/trainingchat/index?topic=${encodeURIComponent(title)}`
    })
  },
})
