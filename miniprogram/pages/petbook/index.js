// pages/petbook/index.js
const app = getApp()

// 预设性格标签
const PRESET_TRAITS = [
  '活泼好动', '文静乖巧', '粘人', '独立',
  '胆小', '勇敢', '好奇心强', '傲娇',
  '亲人', '怕生', '话多爱叫', '安静',
  '贪吃', '挑食', '爱玩', '爱睡觉',
]

// 习性 key -> 标题 + 占位文字
const HABIT_META = {
  diet:     { title: '饮食偏好', placeholder: '记录 TA 喜欢吃什么、不能吃什么、进食量和频率…' },
  schedule: { title: '作息规律', placeholder: '记录 TA 什么时候睡觉、最活跃的时段、睡眠时长…' },
  likes:    { title: '喜欢的事', placeholder: '记录 TA 最爱的玩具、互动方式、喜欢去的地方…' },
  fears:    { title: '害怕的事', placeholder: '记录 TA 的恐惧点、敏感事物、应激反应…' },
}

// Phase 4：档案完整度权重表（对应 snapshot 字段）
const COMPLETENESS_WEIGHTS = {
  vaccine_date:    { label: '疫苗记录',   weight: 9, field: 'vaccine_date' },
  spayed:          { label: '绝育状态',   weight: 8, field: 'spayed' },
  chronic_disease: { label: '慢性病史',   weight: 8, field: 'chronic_disease' },
  allergy:         { label: '过敏史',     weight: 7, field: 'allergy' },
  age:             { label: '出生日期',   weight: 6, field: 'age' },
  diet_brand:      { label: '粮食品牌',   weight: 5, field: 'diet_brand' },
}

// 各 category 显示名和 emoji
const CATEGORY_META = {
  health:   { label: '健康记录', emoji: '🏥' },
  diet:     { label: '饮食偏好', emoji: '🍽️' },
  behavior: { label: '行为特征', emoji: '🐾' },
  events:   { label: '重要事件', emoji: '📌' },
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    pet: null,
    petAge: '',
    // 当前 Tab：'profile'（档案）| 'memory'（专属记忆）
    activeTab: 'profile',
    // 习性数据
    traits: [],
    habits: { diet: '', schedule: '', likes: '', fears: '' },
    memos: [],
    // 编辑弹层
    showBaseEdit: false,
    form: { name: '', type: 'cat', breed: '', birthday: '', weight: '' },
    // 性格标签弹层
    showTraitPicker: false,
    presetTraits: PRESET_TRAITS,
    customTrait: '',
    // 习性编辑弹层
    showHabitEdit: false,
    habitEditKey: '',
    habitEditTitle: '',
    habitEditPlaceholder: '',
    habitEditVal: '',
    // 备忘添加弹层
    showMemoAdd: false,
    memoInput: '',

    // ── Phase 4：专属记忆 Tab ──
    memoryLoading: false,
    // 按 category 分组的记忆列表：{ health: [...], diet: [...], behavior: [...], events: [...] }
    memoryGroups: {},
    // 档案完整度 0~100
    completeness: 0,
    // 缺失的关键字段
    missingFields: [],
    // 手动添加记忆弹层
    showMemoryAdd: false,
    memoryAddCategory: 'health',
    memoryAddContent: '',
    // 手动填写关键字段弹层
    showFieldEdit: false,
    fieldEditKey: '',
    fieldEditLabel: '',
    fieldEditVal: '',
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })
    this.loadPet()
  },

  onShow() {
    this.loadPet()
    // 如果当前在记忆 Tab，刷新记忆数据
    if (this.data.activeTab === 'memory') {
      this._loadMemory()
    }
  },

  goBack() {
    wx.navigateBack()
  },

  // ========== Tab 切换 ==========
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (tab === 'memory' && Object.keys(this.data.memoryGroups).length === 0) {
      this._loadMemory()
    }
  },

  // ========== 加载宠物 ==========
  async loadPet() {
    const db = wx.cloud.database()
    const res = await db.collection('pets').limit(1).get().catch(() => ({ data: [] }))
    const pet = res.data[0] || null
    if (!pet) {
      this.setData({ pet: null, petAge: '', traits: [], habits: { diet:'', schedule:'', likes:'', fears:'' }, memos: [] })
      return
    }
    const petAge = this._calcAge(pet.birthday)
    const traits   = pet.traits   || []
    const habits   = Object.assign({ diet:'', schedule:'', likes:'', fears:'' }, pet.habits || {})
    const memos    = pet.memos    || []
    this.setData({ pet, petAge, traits, habits, memos })
  },

  // ========== 年龄计算 ==========
  _calcAge(birthday) {
    if (!birthday) return ''
    const parts = birthday.split('-')
    const year  = parseInt(parts[0])
    const month = parseInt(parts[1] || 1)
    if (isNaN(year)) return ''
    const now = new Date()
    let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
    if (months <= 0) return ''
    if (months < 12) return months + '个月'
    const y = Math.floor(months / 12)
    const m = months % 12
    return m > 0 ? `${y}岁${m}月` : `${y}岁`
  },

  // ========== 保存到数据库（增量更新）==========
  async _saveField(data) {
    const { pet } = this.data
    const db = wx.cloud.database()
    if (pet) {
      await db.collection('pets').doc(pet._id).update({ data }).catch(console.error)
    }
  },

  // ========== 基础信息编辑 ==========
  openBaseEdit() {
    const p = this.data.pet
    this.setData({
      showBaseEdit: true,
      form: p
        ? { name: p.name, type: p.type, breed: p.breed || '', birthday: p.birthday || '', weight: p.weight || '' }
        : { name: '', type: 'cat', breed: '', birthday: '', weight: '' },
    })
  },

  closeBaseEdit() { this.setData({ showBaseEdit: false }) },

  setType(e)        { this.setData({ 'form.type':     e.currentTarget.dataset.type }) },
  onNameInput(e)    { this.setData({ 'form.name':     e.detail.value }) },
  onBreedInput(e)   { this.setData({ 'form.breed':    e.detail.value }) },
  onBirthdayInput(e){ this.setData({ 'form.birthday': e.detail.value }) },
  onWeightInput(e)  { this.setData({ 'form.weight':   e.detail.value }) },

  async savePet() {
    const { form, pet } = this.data
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写宠物名字', icon: 'none' })
      return
    }
    const db = wx.cloud.database()
    wx.showLoading({ title: '保存中...', mask: true })
    try {
      if (pet) {
        await db.collection('pets').doc(pet._id).update({ data: form })
      } else {
        await db.collection('pets').add({ data: form })
      }
      wx.hideLoading()
      this.setData({ showBaseEdit: false })
      this.loadPet()
      wx.showToast({ title: '保存成功 ✅', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  // ========== 性格标签 ==========
  openTraitPicker() { this.setData({ showTraitPicker: true, customTrait: '' }) },
  closeTraitPicker() { this.setData({ showTraitPicker: false }) },

  toggleTrait(e) {
    const val = e.currentTarget.dataset.val
    const traits = [...this.data.traits]
    const idx = traits.indexOf(val)
    if (idx >= 0) {
      traits.splice(idx, 1)
    } else {
      traits.push(val)
    }
    this.setData({ traits })
    this._saveField({ traits })
  },

  removeTrait(e) {
    const traits = [...this.data.traits]
    traits.splice(e.currentTarget.dataset.index, 1)
    this.setData({ traits })
    this._saveField({ traits })
  },

  onCustomTraitInput(e) { this.setData({ customTrait: e.detail.value }) },

  addCustomTrait() {
    const val = this.data.customTrait.trim()
    if (!val) return
    const traits = [...this.data.traits]
    if (traits.indexOf(val) >= 0) {
      wx.showToast({ title: '已存在该标签', icon: 'none' })
      return
    }
    traits.push(val)
    this.setData({ traits, customTrait: '' })
    this._saveField({ traits })
  },

  // ========== 习性编辑 ==========
  openHabitEdit(e) {
    const key = e.currentTarget.dataset.key
    const meta = HABIT_META[key]
    this.setData({
      showHabitEdit: true,
      habitEditKey: key,
      habitEditTitle: meta.title,
      habitEditPlaceholder: meta.placeholder,
      habitEditVal: this.data.habits[key] || '',
    })
  },

  closeHabitEdit() { this.setData({ showHabitEdit: false }) },
  onHabitInput(e)  { this.setData({ habitEditVal: e.detail.value }) },

  async saveHabit() {
    const { habitEditKey, habitEditVal, habits } = this.data
    const newHabits = { ...habits, [habitEditKey]: habitEditVal.trim() }
    this.setData({ habits: newHabits, showHabitEdit: false })
    await this._saveField({ habits: newHabits })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // ========== 成长备忘 ==========
  openMemoAdd() { this.setData({ showMemoAdd: true, memoInput: '' }) },
  closeMemoAdd() { this.setData({ showMemoAdd: false }) },
  onMemoInput(e) { this.setData({ memoInput: e.detail.value }) },

  async saveMemo() {
    const content = this.data.memoInput.trim()
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const memos = [{ date, content }, ...this.data.memos]
    this.setData({ memos, showMemoAdd: false, memoInput: '' })
    await this._saveField({ memos })
    wx.showToast({ title: '记录成功 ✅', icon: 'success' })
  },

  async removeMemo(e) {
    const idx = e.currentTarget.dataset.index
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: async (res) => {
        if (!res.confirm) return
        const memos = [...this.data.memos]
        memos.splice(idx, 1)
        this.setData({ memos })
        await this._saveField({ memos })
      }
    })
  },

  // ================================================================
  // Phase 4：专属记忆 Tab 逻辑
  // ================================================================

  // ---- 加载记忆数据（snapshot + 近期 events）----
  async _loadMemory() {
    const { pet } = this.data
    if (!pet) return

    this.setData({ memoryLoading: true })

    try {
      const db = wx.cloud.database()
      const petId = pet._id

      // 读取 snapshot
      let snapshot = null
      try {
        const snapRes = await db.collection('pet_memory_snapshot')
          .where({ petId })
          .limit(1)
          .get()
        snapshot = snapRes.data[0] || null
      } catch (e) { /* 集合未创建 */ }

      // 读取近30天 events（展示最近50条）
      let events = []
      try {
        const eventsRes = await db.collection('pet_memory_events')
          .where({ petId })
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get()
        events = eventsRes.data || []
      } catch (e) { /* 集合未创建 */ }

      // 按 category 合并 snapshot + events 构建展示数据
      const memoryGroups = this._buildMemoryGroups(snapshot, events)

      // 计算档案完整度
      const { completeness, missingFields } = this._calcCompleteness(snapshot)

      this.setData({ memoryGroups, completeness, missingFields, memoryLoading: false })

    } catch (e) {
      console.error('[petbook] 加载记忆失败:', e)
      this.setData({ memoryLoading: false })
    }
  },

  // 将 snapshot + events 合并为按 category 分组的展示数据
  _buildMemoryGroups(snapshot, events) {
    const groups = {}

    // 先把 snapshot 各字段按 category 放进去
    const snapshotMap = {
      health:   (snapshot?.health   || []),
      diet:     (snapshot?.diet     || []),
      behavior: (snapshot?.behavior || []),
    }

    for (const [cat, items] of Object.entries(snapshotMap)) {
      if (items.length > 0) {
        groups[cat] = items.map(item => ({
          _id:         item._id || '',
          content:     typeof item === 'string' ? item : item.content,
          date:        item.date || '',
          confidence:  item.confidence || 80,
          source:      item.source || 'healthchat',
          isSnapshot:  true,   // 标记来自 snapshot（支持删除）
        }))
      }
    }

    // 再叠加 events（去重：相同内容的 snapshot 条目不再重复显示）
    for (const ev of events) {
      const cat = ev.category || 'events'
      if (!groups[cat]) groups[cat] = []
      // 避免与 snapshot 中已有的内容重复显示
      const exists = groups[cat].some(item => item.content === ev.content)
      if (!exists) {
        groups[cat].push({
          _id:        ev._id,
          content:    ev.content,
          date:       ev.date || '',
          confidence: ev.confidence || 80,
          source:     ev.source || '',
          isSnapshot: false,
        })
      }
    }

    // 将 groups 转成有序数组供 WXML 渲染（wx:for 不直接支持 Object）
    const orderedCategories = ['health', 'diet', 'behavior', 'events']
    const result = []
    for (const cat of orderedCategories) {
      if (groups[cat] && groups[cat].length > 0) {
        const meta = CATEGORY_META[cat] || { label: cat, emoji: '📋' }
        result.push({
          category: cat,
          label:    meta.label,
          emoji:    meta.emoji,
          items:    groups[cat].slice(0, 15),  // 每类最多展示15条
        })
      }
    }

    return result
  },

  // 计算档案完整度（基于 snapshot 字段填充情况）
  _calcCompleteness(snapshot) {
    const totalWeight = Object.values(COMPLETENESS_WEIGHTS).reduce((s, v) => s + v.weight, 0)
    let filledWeight  = 0
    const missingFields = []

    for (const [key, meta] of Object.entries(COMPLETENESS_WEIGHTS)) {
      const val = snapshot?.[key]
      if (val !== undefined && val !== null && val !== '') {
        filledWeight += meta.weight
      } else {
        missingFields.push({ key, label: meta.label, weight: meta.weight })
      }
    }

    // 基础档案有名字和类型 → 额外算20分基础分
    const baseScore = snapshot ? 20 : 0
    const completeness = Math.min(100, Math.round(baseScore + (filledWeight / totalWeight) * 80))
    missingFields.sort((a, b) => b.weight - a.weight)

    return { completeness, missingFields }
  },

  // ---- 删除一条记忆 ----
  deleteMemory(e) {
    const { id, isSnapshot, category, index, groupIndex } = e.currentTarget.dataset
    wx.showModal({
      title: '删除这条记忆',
      content: '删除后助手将不再使用这条信息提供建议',
      confirmColor: '#FF4444',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const db = wx.cloud.database()

          if (isSnapshot) {
            // 从 snapshot 中移除该条
            await this._removeFromSnapshot(category, index, groupIndex)
          } else {
            // 从 events 中软删除（直接删除文档）
            if (id) {
              await db.collection('pet_memory_events').doc(id).remove()
            }
          }

          // 重新加载记忆
          await this._loadMemory()
          wx.showToast({ title: '已删除', icon: 'success' })

        } catch (err) {
          console.error('[petbook] 删除记忆失败:', err)
          wx.showToast({ title: '删除失败，请重试', icon: 'none' })
        }
      },
    })
  },

  // 从 snapshot 对应字段数组中移除一条
  async _removeFromSnapshot(category, itemIndex, groupIndex) {
    const { pet, memoryGroups } = this.data
    const db = wx.cloud.database()

    // 获取当前 snapshot
    const snapRes = await db.collection('pet_memory_snapshot')
      .where({ petId: pet._id })
      .limit(1)
      .get()
    const snapshot = snapRes.data[0]
    if (!snapshot) return

    const arr = [...(snapshot[category] || [])]
    // 通过 memoryGroups 中的 index 找到对应项的内容，再从 snapshot 数组移除
    const group = memoryGroups[groupIndex]
    if (!group) return
    const targetContent = group.items[itemIndex]?.content
    if (!targetContent) return

    const newArr = arr.filter(item => {
      const str = typeof item === 'string' ? item : item.content
      return str !== targetContent
    })

    await db.collection('pet_memory_snapshot').doc(snapshot._id).update({
      data: { [category]: newArr },
    })
  },

  // ---- 手动添加记忆 ----
  openMemoryAdd() {
    this.setData({ showMemoryAdd: true, memoryAddContent: '', memoryAddCategory: 'health' })
  },
  closeMemoryAdd() { this.setData({ showMemoryAdd: false }) },

  onMemoryAddCategoryChange(e) {
    const cats = ['health', 'diet', 'behavior', 'events']
    this.setData({ memoryAddCategory: cats[e.detail.value] })
  },

  onMemoryAddContentInput(e) {
    this.setData({ memoryAddContent: e.detail.value })
  },

  async saveMemoryAdd() {
    const { memoryAddContent, memoryAddCategory, pet } = this.data
    if (!memoryAddContent.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    if (!pet) return

    const db = wx.cloud.database()
    const now = new Date().toISOString().slice(0, 10)

    wx.showLoading({ title: '保存中...', mask: true })

    try {
      // 手动添加的信息 → 来源标记为 user_stated，置信度100，直接写入 events
      await db.collection('pet_memory_events').add({
        data: {
          petId:        pet._id,
          content:      memoryAddContent.trim(),
          category:     memoryAddCategory,
          confidence:   100,
          date:         now,
          source:       'user_stated',
          mentionCount: 0,
          createdAt:    db.serverDate(),
        },
      })

      // 同时更新 snapshot（手动添加视为最高可信度，直接合并进 snapshot）
      await this._addToSnapshot(pet._id, memoryAddCategory, memoryAddContent.trim(), now)

      wx.hideLoading()
      this.setData({ showMemoryAdd: false })
      await this._loadMemory()
      wx.showToast({ title: '已添加 ✅', icon: 'success' })

    } catch (err) {
      wx.hideLoading()
      console.error('[petbook] 添加记忆失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  // 将手动添加的内容合并进 snapshot
  async _addToSnapshot(petId, category, content, date) {
    const db = wx.cloud.database()
    const arrayFields = ['health', 'diet', 'behavior']
    if (!arrayFields.includes(category)) return

    let snapshot = null
    try {
      const snapRes = await db.collection('pet_memory_snapshot')
        .where({ petId })
        .limit(1)
        .get()
      snapshot = snapRes.data[0] || null
    } catch (e) { /* 集合未创建 */ }

    const newItem = { content, confidence: 100, date, source: 'user_stated', createdAt: date }

    if (snapshot) {
      const arr = [...(snapshot[category] || []), newItem].slice(-10)
      await db.collection('pet_memory_snapshot').doc(snapshot._id).update({
        data: { [category]: arr, updatedAt: date },
      })
    } else {
      await db.collection('pet_memory_snapshot').add({
        data: {
          petId,
          [category]: [newItem],
          health: category === 'health' ? [newItem] : [],
          diet:   category === 'diet'   ? [newItem] : [],
          behavior: category === 'behavior' ? [newItem] : [],
          personality: [],
          updatedAt: date,
        },
      })
    }
  },

  // ---- 手动填写缺失的关键字段 ----
  openFieldEdit(e) {
    const { key, label } = e.currentTarget.dataset
    const { pet } = this.data
    // 读取 snapshot 中当前值（如有）
    this.setData({
      showFieldEdit: true,
      fieldEditKey:   key,
      fieldEditLabel: label,
      fieldEditVal:   '',
    })
  },
  closeFieldEdit() { this.setData({ showFieldEdit: false }) },
  onFieldEditInput(e) { this.setData({ fieldEditVal: e.detail.value }) },

  async saveFieldEdit() {
    const { fieldEditKey, fieldEditVal, pet } = this.data
    if (!fieldEditVal.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' })
      return
    }
    if (!pet) return

    const db = wx.cloud.database()
    wx.showLoading({ title: '保存中...', mask: true })

    try {
      // 写入 snapshot 的特殊字段（vaccine_date / spayed / chronic_disease / allergy / diet_brand）
      let snapshot = null
      try {
        const snapRes = await db.collection('pet_memory_snapshot')
          .where({ petId: pet._id })
          .limit(1)
          .get()
        snapshot = snapRes.data[0] || null
      } catch (e) { /* 集合未创建 */ }

      const now = new Date().toISOString().slice(0, 10)
      const fieldData = { [fieldEditKey]: fieldEditVal.trim(), updatedAt: now }

      if (snapshot) {
        await db.collection('pet_memory_snapshot').doc(snapshot._id).update({ data: fieldData })
      } else {
        await db.collection('pet_memory_snapshot').add({
          data: {
            petId: pet._id,
            health: [], diet: [], behavior: [], personality: [],
            ...fieldData,
          },
        })
      }

      wx.hideLoading()
      this.setData({ showFieldEdit: false })
      await this._loadMemory()
      wx.showToast({ title: '已保存 ✅', icon: 'success' })

    } catch (err) {
      wx.hideLoading()
      console.error('[petbook] 保存字段失败:', err)
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  noop() {},
})
