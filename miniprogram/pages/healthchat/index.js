// pages/healthchat/index.js
const app = getApp()

let msgIdCounter = 0
function nextId() { return ++msgIdCounter }

// 快捷问题列表
const QUICK_QUESTIONS = [
  '猫咪突然不吃饭是怎么回事？',
  '狗狗多久洗一次澡比较好？',
  '宠物需要每年打疫苗吗？',
  '猫咪经常呕吐正常吗？',
  '狗狗拉稀需要去医院吗？',
]

// 打字机速度（ms/字）—— 越小越快
const TYPEWRITER_SPEED = 28

Page({
  data: {
    messages: [],
    inputText: '',
    isLoading: false,
    scrollToId: '',
    keyboardHeight: 0,
    petName: '',
    petType: 'cat',
    statusBarHeight: 0,
    navBarHeight: 44,
    quickQuestions: QUICK_QUESTIONS,
    topicTitle: '',
  },

  // 保存打字机 timer，用于页面卸载时清除
  _typewriterTimer: null,
  _isTyping: false,

  onLoad(options) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight:    app.globalData.navBarHeight,
    })
    this._loadPetInfo()

    if (options.topic) {
      const topic = decodeURIComponent(options.topic)
      this.setData({ topicTitle: topic })
      setTimeout(() => {
        this._sendText(`我想了解关于「${topic}」的更多信息，能详细解答吗？`)
      }, 400)
    }
  },

  onUnload() {
    // 页面卸载时清除打字机定时器
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer)
      this._typewriterTimer = null
    }
  },

  async _loadPetInfo() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('pets').limit(1).get()
      if (res.data[0]) {
        this.setData({
          petName: res.data[0].name || '',
          petType: res.data[0].type || 'cat',
        })
      }
    } catch (e) {
      // 无宠物档案也能正常使用
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onFocus(e) {
    const height = e.detail.height || 0
    this.setData({ keyboardHeight: height })
    setTimeout(() => this._scrollToBottom(), 200)
  },

  onBlur() {
    this.setData({ keyboardHeight: 0 })
  },

  sendQuick(e) {
    const q = e.currentTarget.dataset.q
    this._sendText(q)
  },

  sendMessage() {
    const text = this.data.inputText.trim()
    if (!text || this.data.isLoading || this._isTyping) return
    this.setData({ inputText: '' })
    this._sendText(text)
  },

  // ---- 核心：发送消息 ----
  async _sendText(text) {
    // 1. 加入用户消息
    const userMsg = { id: nextId(), role: 'user', content: text }
    const messages = [...this.data.messages, userMsg]
    this.setData({ messages, isLoading: true })
    this._scrollToBottom()

    // 2. 加入 AI loading 占位气泡
    const loadingMsgId = nextId()
    const loadingMsg = { id: loadingMsgId, role: 'assistant', content: '', loading: true }
    this.setData({ messages: [...this.data.messages, loadingMsg] })
    this._scrollToBottom()

    // 3. 构建对话历史
    const historyForCloud = messages
      .slice(-10)
      .filter(m => !m.loading)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await wx.cloud.callFunction({
        name: 'askVet',
        data: {
          messages: historyForCloud,
          petName:  this.data.petName,
          petType:  this.data.petType,
        },
      })

      const result = res.result || {}
      const reply = result.reply || '抱歉，我暂时无法回答，请稍后重试。'

      // 4. 先把 loading 气泡切换为空文本（停止动画）
      const withEmpty = this.data.messages.map(m =>
        m.id === loadingMsgId ? { ...m, loading: false, content: '' } : m
      )
      this.setData({ messages: withEmpty, isLoading: false })

      // 5. 启动打字机动画
      this._typewriter(loadingMsgId, reply)

    } catch (e) {
      console.error('[health-chat] 调用失败:', e)
      const errMessages = this.data.messages.map(m =>
        m.id === loadingMsgId
          ? { ...m, loading: false, content: '网络异常，请检查网络后重试 😢' }
          : m
      )
      this.setData({ messages: errMessages, isLoading: false })
    }
  },

  // ---- 打字机逐字输出 ----
  _typewriter(msgId, fullText) {
    this._isTyping = true
    let index = 0

    // 将文本拆成「字符」数组（正确处理 emoji 等多字节字符）
    const chars = [...fullText]
    const total = chars.length

    // 每批次输出的字符数（加速感：前期慢、中期快）
    const step = () => {
      if (index >= total) {
        this._isTyping = false
        this._typewriterTimer = null
        this._scrollToBottom()
        return
      }

      // 每次追加 1-3 个字符（让速度看起来更自然）
      const chunkSize = index < 10 ? 1 : (index < 50 ? 2 : 3)
      const nextIndex = Math.min(index + chunkSize, total)
      const currentText = chars.slice(0, nextIndex).join('')
      index = nextIndex

      // 更新对应消息的 content
      const updated = this.data.messages.map(m =>
        m.id === msgId ? { ...m, content: currentText } : m
      )
      this.setData({ messages: updated })

      // 每隔几个字滚动一次（不是每个字都滚，减少性能消耗）
      if (index % 15 === 0 || index === total) {
        this._scrollToBottom()
      }

      this._typewriterTimer = setTimeout(step, TYPEWRITER_SPEED)
    }

    step()
  },

  clearChat() {
    wx.showModal({
      title: '清空对话',
      content: '确认清空本次对话记录？',
      success: (res) => {
        if (res.confirm) {
          // 清空前先停止打字机
          if (this._typewriterTimer) {
            clearTimeout(this._typewriterTimer)
            this._typewriterTimer = null
          }
          this._isTyping = false
          this.setData({ messages: [] })
        }
      },
    })
  },

  _scrollToBottom() {
    this.setData({ scrollToId: 'chat-bottom' })
  },
})
