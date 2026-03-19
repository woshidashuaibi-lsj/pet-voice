// pages/profile/index.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    pet: null,
    petAge: '',
    showEdit: false,
    form: { name: '', type: 'cat', breed: '', birthday: '', weight: '' },
    statusBarHeight: 0,
    navBarHeight: 44,
    // 首次登录引导
    showLoginGuide: false,
    loginTempAvatar: '',
    loginTempNickName: '',
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })
    this._initUser()
    this.loadPet()
  },

  onShow() {
    this.loadPet()
    const ui = app.globalData.userInfo
    if (ui) this.setData({ userInfo: ui })
  },

  // 初始化用户信息：有缓存直接用，没有则弹出引导
  _initUser() {
    const cached = wx.getStorageSync('userInfo') || app.globalData.userInfo
    if (cached && (cached.nickName || cached.avatarUrl)) {
      app.globalData.userInfo = cached
      this.setData({ userInfo: cached })
    } else {
      // 首次进入，弹出登录引导
      this.setData({ showLoginGuide: true })
    }
  },

  // ---- 登录引导弹层：选择微信头像 ----
  onLoginChooseAvatar(e) {
    this.setData({ loginTempAvatar: e.detail.avatarUrl })
  },

  // ---- 登录引导弹层：输入昵称 ----
  onLoginNicknameInput(e) {
    this.setData({ loginTempNickName: e.detail.value })
  },

  // ---- 登录引导弹层：点击「完成」----
  confirmLogin() {
    const { loginTempAvatar, loginTempNickName } = this.data
    // 至少要有头像或昵称之一
    if (!loginTempAvatar && !loginTempNickName.trim()) {
      wx.showToast({ title: '请先选择头像或填写昵称', icon: 'none' })
      return
    }
    const userInfo = {
      avatarUrl: loginTempAvatar || '',
      nickName:  loginTempNickName.trim() || '宠物主人',
    }
    wx.setStorageSync('userInfo', userInfo)
    app.globalData.userInfo = userInfo
    this.setData({
      userInfo,
      showLoginGuide: false,
      loginTempAvatar: '',
      loginTempNickName: '',
    })
    wx.showToast({ title: '设置成功 🎉', icon: 'success' })
  },

  // ---- 跳过登录 ----
  skipLogin() {
    // 跳过时设置一个默认用户名，以后还能在主页更新
    const userInfo = { avatarUrl: '', nickName: '宠物主人' }
    wx.setStorageSync('userInfo', userInfo)
    app.globalData.userInfo = userInfo
    this.setData({ userInfo, showLoginGuide: false })
  },

  // ---- 主页头像更换（登录后点击更换）----
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    const updated = { ...this.data.userInfo, avatarUrl }
    wx.setStorageSync('userInfo', updated)
    app.globalData.userInfo = updated
    this.setData({ userInfo: updated })
  },

  // ---- 主页昵称修改 ----
  onNicknameInput(e) {
    const nickName = e.detail.value
    const updated = { ...this.data.userInfo, nickName }
    wx.setStorageSync('userInfo', updated)
    app.globalData.userInfo = updated
    this.setData({ userInfo: updated })
  },

  // ---- 加载宠物信息 ----
  async loadPet() {
    const db = wx.cloud.database()
    const res = await db.collection('pets').limit(1).get().catch(() => ({ data: [] }))
    const pet = res.data[0] || null
    const petAge = pet ? this._calcAge(pet.birthday) : ''
    this.setData({ pet, petAge })
  },

  // ---- 宠物年龄计算 ----
  _calcAge(birthday) {
    if (!birthday) return ''
    const parts = birthday.split('-')
    const year = parseInt(parts[0])
    const month = parseInt(parts[1] || 1)
    if (isNaN(year)) return ''
    const now = new Date()
    let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month)
    if (months <= 0) return ''
    if (months < 12) return months + ' 个月'
    const y = Math.floor(months / 12)
    const m = months % 12
    return m > 0 ? `${y} 岁 ${m} 个月` : `${y} 岁`
  },

  openEdit() {
    const p = this.data.pet
    this.setData({
      showEdit: true,
      form: p
        ? { name: p.name, type: p.type, breed: p.breed || '', birthday: p.birthday || '', weight: p.weight || '' }
        : { name: '', type: 'cat', breed: '', birthday: '', weight: '' },
    })
  },

  closeEdit() { this.setData({ showEdit: false }) },

  setType(e) { this.setData({ 'form.type': e.currentTarget.dataset.type }) },

  onNameInput(e)     { this.setData({ 'form.name':     e.detail.value }) },
  onBreedInput(e)    { this.setData({ 'form.breed':    e.detail.value }) },
  onBirthdayInput(e) { this.setData({ 'form.birthday': e.detail.value }) },
  onWeightInput(e)   { this.setData({ 'form.weight':   e.detail.value }) },

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
      this.setData({ showEdit: false })
      this.loadPet()
      wx.showToast({ title: '保存成功 ✅', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  noop() {},
})
