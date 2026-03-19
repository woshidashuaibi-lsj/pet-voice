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

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 44,
    pet: null,
    petAge: '',
    // 习性数据
    traits: [],      // 性格标签数组
    habits: {        // 各分类习性文字
      diet: '',
      schedule: '',
      likes: '',
      fears: '',
    },
    memos: [],       // 成长备忘列表 [{date, content}]
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
  },

  goBack() {
    wx.navigateBack()
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

  setType(e)       { this.setData({ 'form.type':     e.currentTarget.dataset.type }) },
  onNameInput(e)   { this.setData({ 'form.name':     e.detail.value }) },
  onBreedInput(e)  { this.setData({ 'form.breed':    e.detail.value }) },
  onBirthdayInput(e){ this.setData({ 'form.birthday': e.detail.value }) },
  onWeightInput(e) { this.setData({ 'form.weight':   e.detail.value }) },

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

  onHabitInput(e) { this.setData({ habitEditVal: e.detail.value }) },

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

  noop() {},
})
