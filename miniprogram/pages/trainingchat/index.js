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
    petType: 'dog',
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

    // 从宠物信息中获取宠物类型
    const petInfo = wx.getStorageSync('petInfo')
    if (petInfo && petInfo.type) {
      this.setData({ petType: petInfo.type === 'cat' ? 'cat' : 'dog' })
    }

    // 从训练详情页跳转时携带话题
    if (options.topic) {
      const decoded = decodeURIComponent(options.topic)
      wx.nextTick(() => {
        this.setData({ inputText: `我想了解「${decoded}」的训练方法` })
      })
    }
  },

  onUnload() {
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer)
    }
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
    // 推入 AI loading 占位
    const aiMsgId = this._nextId()
    const aiMsg   = { id: aiMsgId, role: 'assistant', content: '', loading: true }

    this.setData({
      messages: [...this.data.messages, userMsg, aiMsg],
      inputText: '',
      isLoading: true,
    })
    this._scrollToBottom()

    // 调用云函数
    wx.cloud.callFunction({
      name: 'askTrainer',
      data: { question: text },
      success: (res) => {
        const reply = res.result?.reply || '抱歉，我暂时无法回答这个问题，请稍后再试。'
        this._removeLoadingAndTypewrite(aiMsgId, reply)
      },
      fail: (err) => {
        console.error('askTrainer callFunction fail:', err)
        this._removeLoadingAndTypewrite(aiMsgId, '网络出现了问题，请检查连接后重试。')
      },
    })
  },

  _removeLoadingAndTypewrite(aiMsgId, fullText) {
    // 先去掉 loading 状态
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

  clearChat() {
    if (this._typewriterTimer) clearTimeout(this._typewriterTimer)
    this._isTyping = false
    this.setData({ messages: [], inputText: '' })
  },
})
