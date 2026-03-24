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

// 方案二：摘要压缩阈值
// 本轮有效消息字符数超过此值时，触发压缩；保留最近 KEEP_RECENT 条完整消息
const COMPRESS_THRESHOLD = 1500  // 约等于 1000 Token
const KEEP_RECENT        = 6     // 压缩后保留最近 6 条完整消息

Page({
  data: {
    messages: [],
    inputText: '',
    isLoading: false,
    scrollToId: '',
    keyboardHeight: 0,
    petName: '',
    petType: 'cat',
    petId: '',           // 新增：宠物文档 _id，用于精准读写 memory
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
    } else if (options.question) {
      const question = decodeURIComponent(options.question)
      setTimeout(() => {
        this._sendText(question)
      }, 400)
    }
  },

  onUnload() {
    // 清除打字机定时器
    if (this._typewriterTimer) {
      clearTimeout(this._typewriterTimer)
      this._typewriterTimer = null
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
          petType: res.data[0].type || 'cat',
        })
      }
    } catch (e) {
      // 无宠物档案也能正常使用
    }
  },

  // ---- 对话结束：静默触发记忆提取 ----
  _extractMemory() {
    const messages = this.data.messages
    // 至少要有 1 条用户消息才触发
    const userMsgCount = messages.filter(m => m.role === 'user').length
    if (userMsgCount < 1) return

    // 过滤掉 loading 状态和空消息，只保留有效对话
    const validMessages = messages
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role, content: m.content }))

    if (validMessages.length < 2) return

    // 静默调用云函数，不等待结果，不影响用户
    wx.cloud.callFunction({
      name: 'extractMemory',
      data: {
        messages: validMessages,
        petId:    this.data.petId,
        petName:  this.data.petName,
        petType:  this.data.petType,
        source:   'healthchat',
      },
    }).catch(err => {
      // 静默失败，不提示用户
      console.log('[healthchat] extractMemory 静默失败:', err)
    })
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

    // 2. 加入 loading 占位气泡
    const loadingMsgId = nextId()
    const loadingMsg = { id: loadingMsgId, role: 'assistant', content: '', loading: true }
    this.setData({ messages: [...this.data.messages, loadingMsg] })
    this._scrollToBottom()

    // 3. 构建对话历史（方案一+二+三组合）
    //    方案三：petId 传入，askVet 读取 memory 注入 System Prompt（跨轮）
    //    方案二：本轮消息超过阈值时，调用 summarizeHistory 压缩旧消息
    //    方案一：方案二失败降级时，slice(-6) 兜底
    const historyForCloud = await this._buildCompressedHistory(messages)

    try {
      const res = await wx.cloud.callFunction({
        name: 'askVet',
        data: {
          messages: historyForCloud,
          petName:  this.data.petName,
          petType:  this.data.petType,
          petId:    this.data.petId,
        },
      })

      const result = res.result || {}
      const reply = result.reply || '抱歉，我暂时无法回答，请稍后重试。'

      // 4. 停止 loading 动画
      const withEmpty = this.data.messages.map(m =>
        m.id === loadingMsgId ? { ...m, loading: false, content: '' } : m
      )
      this.setData({ messages: withEmpty, isLoading: false })

      // Phase 4：静默触发隐式矫正检测（不等待结果，不影响用户）
      this._detectCorrection(text)

      // 5. 打字机动画
      this._typewriter(loadingMsgId, reply)

    } catch (e) {
      console.error('[healthchat] 调用失败:', e)
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

    const chars = [...fullText]
    const total = chars.length

    const step = () => {
      if (index >= total) {
        this._isTyping = false
        this._typewriterTimer = null
        this._scrollToBottom()
        return
      }

      const chunkSize = index < 10 ? 1 : (index < 50 ? 2 : 3)
      const nextIndex = Math.min(index + chunkSize, total)
      const currentText = chars.slice(0, nextIndex).join('')
      index = nextIndex

      const updated = this.data.messages.map(m =>
        m.id === msgId ? { ...m, content: currentText } : m
      )
      this.setData({ messages: updated })

      if (index % 15 === 0 || index === total) {
        this._scrollToBottom()
      }

      this._typewriterTimer = setTimeout(step, TYPEWRITER_SPEED)
    }

    step()
  },

  // ---- 方案二：构建压缩后的对话历史 ----
  // 流程：
  //   1. 过滤 loading/空消息得到有效消息列表
  //   2. 计算总字符数，未超阈值 → 直接返回（最多 KEEP_RECENT 条，方案一兜底）
  //   3. 超阈值 → 把前半段发给 summarizeHistory 压缩，保留后半段完整消息
  //   4. summarizeHistory 失败 → 降级为方案一 slice(-6)
  async _buildCompressedHistory(messages) {
    const valid = messages
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role, content: m.content }))

    const totalChars = valid.reduce((s, m) => s + m.content.length, 0)

    // 未超阈值：方案一兜底，直接返回最近 KEEP_RECENT 条
    if (totalChars <= COMPRESS_THRESHOLD) {
      return valid.slice(-KEEP_RECENT)
    }

    // 超阈值：触发方案二压缩
    const oldMessages    = valid.slice(0, -KEEP_RECENT)
    const recentMessages = valid.slice(-KEEP_RECENT)

    if (oldMessages.length === 0) {
      return recentMessages
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'summarizeHistory',
        data: {
          messages: oldMessages,
          petName:  this.data.petName,
          petType:  this.data.petType,
        },
      })

      const summary = res.result?.summary || ''
      if (!summary) throw new Error('摘要为空')

      console.log('[healthchat] 方案二压缩成功，原', oldMessages.length, '条 →', summary.length, '字摘要')

      // 摘要作为 system 角色插在历史最前面
      return [
        { role: 'system', content: `以下是本次对话前半段的摘要：${summary}` },
        ...recentMessages,
      ]
    } catch (e) {
      // 压缩失败 → 降级为方案一
      console.warn('[healthchat] summarizeHistory 失败，降级方案一:', e.message || e)
      return recentMessages
    }
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
        console.log('[healthchat] 检测到矫正:', res.result.correction)
      }
    }).catch(() => {
      // 静默失败，不提示用户
    })
  },

  clearChat() {
    wx.showModal({
      title: '清空对话',
      content: '确认清空本次对话记录？',
      success: (res) => {
        if (res.confirm) {
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
