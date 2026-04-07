// pages/health/index.js
const app = getApp()

// ============================================================
// 健康知识库（静态数据，后续可迁移至云数据库）
// ============================================================
const HEALTH_DATA = [
  // ---- 通用 ----
  {
    _id: 1, type: 'all', petLabel: '🐱🐶 通用',
    tag: '日常护理', tagColor: '#2ECC71',
    title: '宠物饮水量参考指南',
    summary: '每天喝够水是健康的基础，知道你家毛孩子该喝多少吗？',
    content: `水是生命之源，对宠物同样重要。

【猫咪】
• 每日需水量约为体重(kg) × 50ml
• 如一只 4kg 的猫需约 200ml/天
• 猫天生饮水欲低，建议用流水饮水机
• 干粮猫要额外补水，湿粮可减少约一半饮水需求

【狗狗】
• 每日需水量约为体重(kg) × 60ml
• 运动后、天热时要额外增加
• 饮水突然减少可能是生病信号

【注意事项】
• 换水频率：每天至少换一次，夏天每天两次
• 水碗位置：远离厕所和食盆，保持清洁
• 饮水突然增多（多饮多尿）需警惕糖尿病、肾病`,
    symptoms: ['连续 2 天以上不喝水', '饮水量突然增加 3 倍以上', '尿量同步异常增多'],
  },
  {
    _id: 2, type: 'all', petLabel: '🐱🐶 通用',
    tag: '疫苗接种', tagColor: '#3498DB',
    title: '宠物疫苗接种时间表',
    summary: '按时打疫苗是保护毛孩子最经济有效的方式，别错过关键节点！',
    content: `【猫咪疫苗计划】
• 8周龄：猫三联第一针（猫鼻支、猫杯状、猫泛白细胞减少症）
• 12周龄：猫三联第二针
• 16周龄：猫三联第三针 + 狂犬疫苗
• 之后每年补打一次

【狗狗疫苗计划】
• 6-8周龄：犬二联（细小+犬瘟）第一针
• 10-12周龄：犬六联/七联 第二针
• 14-16周龄：犬六联/七联 第三针 + 狂犬疫苗
• 之后每年补打一次

【接种前后注意】
• 打疫苗前确保宠物健康，先驱虫
• 接种后 24 小时内不洗澡、不剧烈运动
• 接种后观察 30 分钟，注意过敏反应（呕吐、颤抖、虚脱）`,
    symptoms: ['接种后出现呕吐或腹泻', '注射部位红肿超过 3 天', '精神萎靡超过 24 小时'],
  },
  // ---- 猫咪专区 ----
  {
    _id: 3, type: 'cat', petLabel: '🐱 猫咪',
    tag: '常见疾病', tagColor: '#E74C3C',
    title: '猫咪应激反应：怎么判断和缓解？',
    summary: '搬家、陌生人、声音……这些都可能让猫进入应激状态，学会识别很重要。',
    content: `应激（Stress）是猫咪最常见的心理健康问题。

【应激的常见原因】
• 环境变化：搬家、换房间、新家具
• 陌生人或动物进入领地
• 噪音：鞭炮、雷声、工地
• 主人长时间不在家
• 医院就诊后气味变化

【应激的表现】
• 轻度：躲藏、食欲减退、不停梳理毛发
• 中度：乱尿、攻击性增加、腹泻
• 重度：完全不进食、持续颤抖

【缓解方法】
1. 提供安全的躲藏空间（纸箱、猫爬架高处）
2. 使用费利威（猫信息素喷雾）
3. 保持日常喂食时间规律
4. 不要强行安抚，让猫自主靠近
5. 严重时就医，医生可开镇静药物辅助`,
    symptoms: ['超过 24 小时不进食不喝水', '持续颤抖或蜷缩不动', '出现血尿或排便困难'],
  },
  {
    _id: 4, type: 'cat', petLabel: '🐱 猫咪',
    tag: '营养喂养', tagColor: '#E67E22',
    title: '猫咪不能吃什么？避坑清单',
    summary: '这些食物对你来说是美味，对猫咪却可能是毒药，一定要记牢！',
    content: `【绝对禁止】
❌ 葱、蒜、韭菜 — 破坏红细胞，导致溶血性贫血
❌ 葡萄、葡萄干 — 可能导致急性肾衰竭
❌ 巧克力、可可 — 含可可碱，心律失常甚至死亡
❌ 木糖醇（很多口香糖、零食含有）— 低血糖、肝衰竭
❌ 酒精 — 极低剂量即可致命
❌ 生鸡蛋清 — 含抗生物素蛋白，长期食用导致维生素缺乏
❌ 牛奶 — 大多数猫乳糖不耐受，会腹泻

【谨慎食用】
⚠️ 生鱼生肉 — 可能含寄生虫，建议煮熟
⚠️ 咸的食物 — 肾脏代谢负担重
⚠️ 骨头 — 尖锐骨头可能刺穿消化道

【误食怎么办】
• 少量误食：密切观察 4-6 小时
• 大量误食或出现呕吐/颤抖：立即就医
• 告知医生误食的食物名称和大致分量`,
    symptoms: ['误食后出现呕吐、腹泻', '四肢无力、站立不稳', '牙龈变白或变黄'],
  },
  // ---- 狗狗专区 ----
  {
    _id: 5, type: 'dog', petLabel: '🐶 狗狗',
    tag: '常见疾病', tagColor: '#E74C3C',
    title: '狗狗拉稀怎么办？分级处理指南',
    summary: '偶尔拉软便不用慌，但这些情况必须去医院，教你判断严重程度。',
    content: `腹泻是狗狗最常见的问题，需要先判断严重程度再决定是否就医。

【严重程度分级】

🟢 轻度（观察处理）
• 软便或轻微稀便，1-2 次
• 精神、食欲正常
• 无血便、无黏液
→ 处理：禁食 12-24 小时（正常饮水），之后喂易消化食物（白米饭+水煮鸡胸肉）

🟡 中度（密切观察，准备就医）
• 水样便，超过 3 次/天
• 轻微精神不振
• 有少量黏液
→ 处理：补水防脱水，观察 12 小时无好转立即就医

🔴 重度（立即就医）
• 血便（红色或黑色焦油样）
• 伴随呕吐
• 明显精神萎靡、发烧
• 幼犬（6月龄以下）或老年犬

【预防腹泻的日常注意】
• 换粮要循序渐进（新旧混合 7 天过渡）
• 避免给人类食物特别是油腻食物
• 定期驱虫`,
    symptoms: ['便中带血（红色或黑色）', '持续超过 24 小时未好转', '同时出现呕吐和精神萎靡', '幼犬或老年犬出现腹泻'],
  },
  {
    _id: 6, type: 'dog', petLabel: '🐶 狗狗',
    tag: '日常护理', tagColor: '#2ECC71',
    title: '狗狗洗澡频率与正确方法',
    summary: '洗太勤反而伤皮肤，多久洗一次才合适？这篇讲清楚了。',
    content: `【洗澡频率建议】
• 短毛狗（拉布拉多、柴犬）：每 3-4 周一次
• 长毛狗（金毛、边牧）：每 2-3 周一次
• 皮肤问题狗：遵医嘱，可能需要用药浴
• 幼犬（3月龄以下）：尽量少洗，注意保暖

【正确洗澡步骤】
1. 先梳理毛发，去除打结
2. 水温 38-40°C（偏体温）
3. 从颈部往后打湿，避开耳朵和眼睛
4. 宠物专用沐浴露，充分揉搓 3-5 分钟
5. 彻底冲洗，残留沐浴露会刺激皮肤
6. 毛巾吸水后立即用吹风机低温吹干（重要！）

【常见误区】
❌ 用人类洗发水 — pH 值不同，破坏皮肤屏障
❌ 洗完自然晾干 — 容易受凉，且潮湿环境易滋生细菌
❌ 洗完外出 — 等完全干透再出门`,
    symptoms: ['洗澡后出现大量脱毛', '皮肤出现红斑或丘疹', '持续瘙痒抓挠皮肤'],
  },
  {
    _id: 7, type: 'all', petLabel: '🐱🐶 通用',
    tag: '驱虫防护', tagColor: '#9B59B6',
    title: '体内外驱虫完整指南',
    summary: '驱虫不只是夏天的事！全年定期驱虫才是正确做法。',
    content: `驱虫分为体外驱虫（跳蚤、蜱虫、螨虫）和体内驱虫（蛔虫、绦虫等）。

【体外驱虫】
• 推荐产品：福来恩、大宠爱、博来恩等滴剂或项圈
• 频率：每月一次（全年）
• 有户外活动的宠物：每 2-3 周一次
• 重点注意：夏季蜱虫高发，外出归来检查耳后、腋下、腹股沟

【体内驱虫】
• 幼年宠物：每月驱虫一次，直到 6 月龄
• 成年宠物：每 3 个月驱虫一次
• 有捕猎行为的猫或户外犬：每月一次
• 常用药：拜宠清、犬心保（预防心丝虫）

【感染寄生虫的信号】
• 体外：皮毛上发现黑色小颗粒（跳蚤粪便）、持续瘙痒、脱毛
• 体内：便便中发现白色节片或米粒状物体、腹部膨胀、消瘦`,
    symptoms: ['便便中发现活动的白色虫体', '皮肤出现大面积脱毛', '腹部明显膨胀且消瘦', '发现蜱虫叮咬超过 24 小时'],
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
    let list = HEALTH_DATA
    if (activeTab === '猫咪') list = list.filter(i => i.type === 'cat' || i.type === 'all')
    if (activeTab === '狗狗') list = list.filter(i => i.type === 'dog' || i.type === 'all')
    this.setData({ filteredList: list })
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id
    const item = HEALTH_DATA.find(i => i._id === id)
    if (item) {
      this.setData({ showDetail: true, currentItem: item })
    }
  },

  closeDetail() {
    this.setData({ showDetail: false, currentItem: null })
  },

  noop() {},  // 阻止弹层背景点击穿透

  // 跳转 AI 问诊（无预设话题）
  goAskVet() {
    wx.navigateTo({ url: '/pages/healthchat/index' })
  },

  // 从详情弹层跳转 AI 问诊（携带当前话题标题）
  goAskVetWithTopic() {
    const title = this.data.currentItem?.title || ''
    this.setData({ showDetail: false })
    wx.navigateTo({
      url: `/pages/healthchat/index?topic=${encodeURIComponent(title)}`
    })
  },
})
