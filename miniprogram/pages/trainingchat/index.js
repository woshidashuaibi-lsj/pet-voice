// pages/trainingchat/index.js
const app = getApp()

const TYPEWRITER_SPEED = 30  // 每字间隔 ms

Page({
  data: {
    messages: [],
    inputText: '',
    isLoading: false,
    scrollToId: '',
    statusBarHeight: 0,
    navBarHeight: 44,
    keyboardHeight: 0,
    petName: '',         // 新增：宠物名称
    petType: 'dog',
    petId: '',           // 新增：宠物文档 _id，用于精准读写 memory
    quickQuestions: [
      '怎么训练狗狗坐下？',
      '猫咪抓家具怎么纠正？',
      '狗狗乱叫怎么办？',
      '怎么教宠物用响片？',
      '如何让狗狗不扑人？',
    ],
  },

  _msgId: 0,
  _typewriterTimer: null,
  _isTyping: false,

  onLoad(options) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight:    app.globalData.navBarHeight || 44,
    })

    // 从数据库加载宠物信息（含 petId）
    this._loadPetInfo()

    // 从训练详情页跳转时携带话题
    if (options.topic) {
      const decoded = decodeURIComponent(options.topic)
      wx.nextTick(() => {
        this.setData({ inputText: `我想了解「${decoded}」的训练方法` })
      })
    } else if (options.question) {
      const question = decodeURIComponent(options.question)
      wx.nextTick(() => {
        this.setData({ inputText: question })
        this._sendText(question)
      })
    }
  },

  onUnload() {
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer)
    }

    // 对话结束时静默提取宠物关键信息
    this._extractMemory()
  },

  // ---- 加载宠物信息（含 petId）----
  async _loadPetInfo() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('pets').limit(1).get()
      if (res.data[0]) {
        this.setData({
          petId:   res.data[0]._id  || '',
          petName: res.data[0].name || '',
          petType: res.data[0].type || 'dog',
        })
      }
    } catch (e) {
      // 无宠物档案也能正常使用，兼容旧版 storage 方式
      const petInfo = wx.getStorageSync('petInfo')
      if (petInfo && petInfo.type) {
        this.setData({ petType: petInfo.type === 'cat' ? 'cat' : 'dog' })
      }
    }
  },

  // ---- 对话结束：静默触发记忆提取 ----
  _extractMemory() {
    const messages = this.data.messages
    const userMsgCount = messages.filter(m => m.role === 'user').length
    if (userMsgCount < 1) return

    const validMessages = messages
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role, content: m.content }))

    if (validMessages.length < 2) return

    wx.cloud.callFunction({
      name: 'extractMemory',
      data: {
        messages: validMessages,
        petId:    this.data.petId,
        petName:  this.data.petName,
        petType:  this.data.petType,
        source:   'trainingchat',
      },
    }).catch(err => {
      console.log('[trainingchat] extractMemory 静默失败:', err)
    })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onFocus(e) {
    this.setData({ keyboardHeight: e.detail.height || 0 })
    this._scrollToBottom()
  },

  onBlur() {
    this.setData({ keyboardHeight: 0 })
  },

  sendQuick(e) {
    const q = e.currentTarget.dataset.q
    this.setData({ inputText: q })
    this._sendText(q)
  },

  sendMessage() {
    const text = this.data.inputText.trim()
    if (!text || this.data.isLoading || this._isTyping) return
    this._sendText(text)
  },

  _nextId() {
    return ++this._msgId
  },

  _sendText(text) {
    // 推入用户消息
    const userMsg = { id: this._nextId(), role: 'user', content: text }
    // 推入 loading 占位
    const aiMsgId = this._nextId()
    const aiMsg   = { id: aiMsgId, role: 'assistant', content: '', loading: true }

    const messages = [...this.data.messages, userMsg]

    this.setData({
      messages: [...messages, aiMsg],
      inputText: '',
      isLoading: true,
    })
    this._scrollToBottom()

    // 构建多轮对话历史（最近6条，方案三：关键信息由 memory 承担，不依赖长历史）
    const historyForCloud = messages
      .filter(m => !m.loading && m.content)
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    // Phase 4：静默触发隐式矫正检测
    this._detectCorrection(text)

    // 调用云函数（升级为传 messages 多轮对话）
    wx.cloud.callFunction({
      name: 'askTrainer',
      data: {
        messages: historyForCloud,
        petName:  this.data.petName,
        petType:  this.data.petType,
        petId:    this.data.petId,
      },
      success: (res) => {
        const reply = res.result?.reply || '抱歉，我暂时无法回答这个问题，请稍后再试。'
        this._removeLoadingAndTypewrite(aiMsgId, reply)
      },
      fail: (err) => {
        console.error('[trainingchat] callFunction fail:', err)
        this._removeLoadingAndTypewrite(aiMsgId, '网络出现了问题，请检查连接后重试。')
      },
    })
  },

  _removeLoadingAndTypewrite(aiMsgId, fullText) {
    const msgs = this.data.messages.map(m =>
      m.id === aiMsgId ? { ...m, loading: false, content: '' } : m
    )
    this.setData({ messages: msgs, isLoading: false })
    this._typewriter(aiMsgId, fullText, 0)
  },

  _typewriter(aiMsgId, fullText, index) {
    if (index > fullText.length) {
      this._isTyping = false
      return
    }
    this._isTyping = true
    const displayed = fullText.slice(0, index)
    const msgs = this.data.messages.map(m =>
      m.id === aiMsgId ? { ...m, content: displayed } : m
    )
    this.setData({ messages: msgs })
    if (index % 10 === 0) this._scrollToBottom()

    this._typewriterTimer = setTimeout(() => {
      this._typewriter(aiMsgId, fullText, index + 1)
    }, TYPEWRITER_SPEED)
  },

  _scrollToBottom() {
    this.setData({ scrollToId: 'chat-bottom' })
  },

  // ---- Phase 4：隐式矫正检测（静默异步，不影响用户体验）----
  _detectCorrection(userMessage) {
    if (!userMessage || !this.data.petId) return

    wx.cloud.callFunction({
      name: 'correctMemory',
      data: {
        userMessage,
        petId:   this.data.petId,
        petName: this.data.petName,
        petType: this.data.petType,
      },
    }).then(res => {
      if (res.result?.corrected) {
        console.log('[trainingchat] 检测到矫正:', res.result.correction)
      }
    }).catch(() => {
      // 静默失败，不提示用户
    })
  },

  clearChat() {
    if (this._typewriterTimer) clearTimeout(this._typewriterTimer)
    this._isTyping = false
    this.setData({ messages: [], inputText: '' })
  },
})
