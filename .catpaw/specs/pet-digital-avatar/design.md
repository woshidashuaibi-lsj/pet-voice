# Live2D 宠物分身互动 - 实现规划

## 整体架构

```
用户交互 → 宠物分身模块 → Live2D 渲染 → 动画效果 → 数据反馈
   ↑                                             ↓
   ├─← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←┘
```

### 核心数据流

```
pets.memory + checkins（现有数据）
        ↓
    avatar_state 云函数（每日或打开时更新）
        ↓
┌─────────────────────────────┐
│   avatar_state 快照         │
│  ├─ contentment: 68         │ ← 满足度
│  ├─ energy: 45              │ ← 能量值
│  ├─ affection: 82           │ ← 亲密度
│  ├─ health: 75              │ ← 健康度
│  ├─ primaryTraits: [...]    │ ← 行为特征
│  ├─ recentMood: "开心"      │ ← 最近情绪
│  └─ appearanceLevel: 2      │ ← 外观等级
└─────────────────────────────┘
        ↓
   Live2D 模型选择
   └─ 根据 moodScore 映射到不同的表情、动作、皮肤
        ↓
    前端点击交互 → 触发对应动作 + 数据反馈
```

## Phase 0：基础版实现（2周）

### 1. 数据模型设计

#### 1.1 avatar_state 数据结构

```javascript
// collections/pet_avatar_states
{
  _id: "xxx",
  petId: "pet_001",
  userId: "user_001",
  
  // 四维数据（0-100）
  dimensions: {
    contentment: 68,      // 满足度：打卡频率、对话热度
    energy: 45,           // 精力值：活跃度特征、近期行为
    affection: 82,        // 亲密度：对话次数、互动频率
    health: 75            // 健康度：打卡评分、健康对话比例
  },
  
  // 性格特征
  personality: {
    primaryTraits: ["粘人", "活泼"],    // 前2个主要特征
    temperament: "extroverted",        // 性格类型
    recentMood: "happy"                // 最近情绪倾向
  },
  
  // 外观进化
  appearance: {
    level: 2,                          // 1-5 进化等级（基于对话轮数）
    skinId: "default_cat",             // 皮肤ID
    unlockedSkins: ["default_cat"],    // 已解锁皮肤
    accessories: [],                   // 已装备的装饰品
    lastLevelUpAt: "2026-03-20"
  },
  
  // 动作库管理
  actions: {
    unlockedActions: ["idle", "happy", "curious"],  // 已解锁动作
    favoriteAction: "happy"            // 最常显示的动作
  },
  
  // 统计数据
  stats: {
    totalInteractions: 156,            // 总互动次数
    lastInteractionAt: "2026-03-24T10:30:00Z",
    streakDays: 7,                     // 连续活跃天数
    totalConversations: 45             // 总对话数
  },
  
  createdAt: "2026-02-15",
  updatedAt: "2026-03-24",
  nextAutoUpdateAt: "2026-03-25"  // 下次自动更新时间
}
```

#### 1.2 维度计算公式

**满足度（Contentment）**
```
= (打卡频率分 * 0.4 + 对话热度分 * 0.3 + 游戏参与度 * 0.3)
= (最近7天打卡数/7 * 100 * 0.4) + (最近7天对话数/10 * 100 * 0.3) + (游戏完成数/总游戏数 * 100 * 0.3)
范围：0-100
```

**能量值（Energy）**
```
= (活跃特征权重 * 0.5 + 最近行为积极性 * 0.5)
- 衰减因子（超过3天未互动，每天-5）

活跃特征权重：如果性格标签有"活泼/好动" → 基础60分，否则基础40分
```

**亲密度（Affection）**
```
= (互动频率 * 0.3 + 对话深度 * 0.4 + 一致性 * 0.3)

互动频率：最近30天互动数 / 30 * 100
对话深度：对话轮数超过5轮的比例 * 100
一致性：连续打卡天数 / 30 * 100
```

**健康度（Health）**
```
= (打卡健康评分平均 * 0.6 + 无不适记录天数占比 * 0.4)

如果 memory 中有"不舒服"标签 → 自动-20分
```

#### 1.3 进化等级（基于对话数）

```javascript
const LEVEL_THRESHOLDS = [
  { level: 1, minConversations: 0,   description: "刚认识" },
  { level: 2, minConversations: 10,  description: "初步了解" },
  { level: 3, minConversations: 50,  description: "很熟悉" },
  { level: 4, minConversations: 100, description: "非常懂" },
  { level: 5, minConversations: 200, description: "灵魂伙伴" }
]

// 每个等级对应的解锁内容
const UNLOCKS_BY_LEVEL = {
  1: { skinId: "default", actions: ["idle", "happy"] },
  2: { skinId: "default", actions: ["idle", "happy", "curious", "sleepy"] },
  3: { skinId: "deluxe", actions: ["idle", "happy", "curious", "sleepy", "playful", "affectionate"] },
  4: { skinId: "premium", actions: [...所有动作...] },
  5: { skinId: "legendary", actions: [...所有动作...], specialEffect: "aura" }
}
```

---

### 2. Live2D 模型与动作库设计

#### 2.1 Live2D 模型选择方案

**MVP 阶段推荐方案**：

| 方案 | 来源 | 成本 | 动作数 | 模型质量 | 建议 |
|------|------|------|--------|---------|------|
| **Cubism Free** | Live2D 官方 | 免费 | 5-10 | 低 | 可用于快速原型 |
| **二次元模型库** | itch.io / GitHub | 免费/¥500-2000 | 20+ | 中 | **推荐**用于 MVP |
| **自定义美术** | 委托外包 | ¥3000-8000 | 30+ | 高 | 后期升级方案 |

**推荐**：采用现成的二次元宠物 Live2D 模型（可从 GitHub 上的开源项目获取），支持 15-20 个基础动作。

#### 2.2 动作库规划（15个核心动作）

```javascript
const ANIMATION_LIBRARY = {
  // 基础状态（2个）
  idle: {
    name: "待机",
    duration: 3000,
    loop: true,
    triggerBy: ["init", "timeout"],
    description: "宠物的默认站立/坐下动作"
  },
  sleep: {
    name: "睡眠",
    duration: 5000,
    loop: true,
    triggerBy: ["night", "tired"],
    description: "闭眼，呼吸起伏"
  },
  
  // 情绪动作（4个）
  happy: {
    name: "开心",
    duration: 1500,
    loop: false,
    triggerBy: ["mood:happy", "game_win"],
    sound: "happy.mp3",
    description: "摇尾巴、跳跃、眼睛发光"
  },
  sad: {
    name: "难受",
    duration: 2000,
    loop: false,
    triggerBy: ["mood:sad", "health_alert"],
    sound: "sad.mp3",
    description: "低头、萎靡不振"
  },
  curious: {
    name: "好奇",
    duration: 1500,
    loop: false,
    triggerBy: ["newFeature", "tap_head"],
    sound: "curious.mp3",
    description: "竖起耳朵、转头张望"
  },
  playful: {
    name: "调皮",
    duration: 1800,
    loop: false,
    triggerBy: ["tap", "game_start"],
    sound: "playful.mp3",
    description: "跳跃、翻滚、咬尾巴"
  },
  
  // 互动响应（5个）
  pet: {
    name: "被摸",
    duration: 1200,
    loop: false,
    triggerBy: ["tap_back"],
    sound: "pet.mp3",
    description: "舒服地眯起眼睛"
  },
  startle: {
    name: "惊吓",
    duration: 1000,
    loop: false,
    triggerBy: ["tap_aggressive"],
    sound: "startle.mp3",
    description: "突然跳起或后退"
  },
  excited: {
    name: "兴奋",
    duration: 1500,
    loop: false,
    triggerBy: ["treat_time", "game_reward"],
    sound: "excited.mp3",
    description: "跳跃、转圈、摇尾巴"
  },
  tired: {
    name: "疲倦",
    duration: 2000,
    loop: false,
    triggerBy: ["late_night"],
    description: "打哈欠、伸懒腰"
  },
  confused: {
    name: "困惑",
    duration: 1200,
    loop: false,
    triggerBy: ["tap_random"],
    sound: "confused.mp3",
    description: "歪头、眨眼"
  },
  
  // 特殊动作（4个）
  eating: {
    name: "进食",
    duration: 2500,
    loop: false,
    triggerBy: ["feed_game"],
    sound: "eating.mp3",
    description: "低头吃东西，偶尔抬头"
  },
  grooming: {
    name: "整理",
    duration: 3000,
    loop: false,
    triggerBy: ["idle_random"],
    sound: "grooming.mp3",
    description: "舔爪子、擦脸"
  },
  affectionate: {
    name: "亲昵",
    duration: 1800,
    loop: false,
    triggerBy: ["highAffection"],
    sound: "affectionate.mp3",
    description: "蹭主人、靠近、眼神对视"
  },
  victory: {
    name: "胜利",
    duration: 2000,
    loop: false,
    triggerBy: ["level_up", "achievement"],
    sound: "victory.mp3",
    description: "抬头挺胸、摇尾巴"
  }
}
```

---

### 3. 点击互动系统

#### 3.1 交互热区划分

```
    ╔═══════════════════════╗
    ║        head           ║  ← tap_head: 好奇反应
    ║     ╭─────────╮       ║
    ║    │           │      ║
    ║  back│    😺    │back  ║  ← tap_back: 被摸反应
    ║    │           │      ║
    ║     ╰─────────╯       ║
    ║        body           ║  ← tap_body: 一般互动
    ║         tail          ║  ← tap_tail: 调皮反应
    ╚═══════════════════════╝
```

#### 3.2 点击逻辑与响应

```javascript
const CLICK_INTERACTION = {
  head: {
    name: "点击头部",
    probability: 0.7,
    animations: ["curious", "pet"],
    emotionalBoost: { affection: +3, contentment: +2 },
    dialog: ["你摸我头干嘛呢？", "这样挠舒服~"],
    cooldown: 500  // 毫秒
  },
  
  back: {
    name: "点击后背",
    probability: 0.85,
    animations: ["pet", "happy"],
    emotionalBoost: { affection: +5, contentment: +3 },
    dialog: ["嗯~舒服", "继续摸~"],
    cooldown: 300
  },
  
  body: {
    name: "点击身体",
    probability: 0.6,
    animations: ["playful", "excited"],
    emotionalBoost: { affection: +2, contentment: +2 },
    dialog: ["来玩吗？", "你干嘛呢"],
    cooldown: 400
  },
  
  tail: {
    name: "点击尾巴",
    probability: 0.5,
    animations: ["playful", "startle"],
    emotionalBoost: { affection: +2, contentment: +4 },
    dialog: ["别拉尾巴!", "坏蛋~"],
    cooldown: 600
  },
  
  // 特殊互动
  double_tap: {
    name: "双击",
    probability: 0.9,
    animations: ["excited", "victory"],
    emotionalBoost: { affection: +10, contentment: +8 },
    specialEffect: "heart_particles",
    dialog: ["主人最好了！"],
    cooldown: 2000
  },
  
  long_press: {
    name: "长按（3秒+）",
    probability: 1.0,
    animations: ["affectionate"],
    emotionalBoost: { affection: +15, contentment: +10, health: +5 },
    specialEffect: "glow_effect",
    dialog: ["这样和你在一起真幸福~"],
    cooldown: 5000  // 长互动后需要冷却
  }
}
```

#### 3.3 智能响应机制

```javascript
// 根据当前状态和性格决定反应
function getInteractionResponse(clickArea, petState, personality) {
  const baseResponse = CLICK_INTERACTION[clickArea];
  
  // 1. 根据性格调整概率
  if (personality.includes("粘人") && clickArea === "back") {
    baseResponse.probability += 0.2;  // 粘人的宠物更喜欢被摸
  }
  
  // 2. 根据当前维度调整
  if (petState.dimensions.energy < 30) {
    // 能量低 → 不太想互动
    baseResponse.probability *= 0.5;
    baseResponse.animations = ["tired"];
    baseResponse.dialog = ["我有点累...", "让我休息会"];
  }
  
  if (petState.dimensions.affection > 80) {
    // 亲密度高 → 更积极响应
    baseResponse.emotionalBoost.affection += 5;
    baseResponse.animations.push("affectionate");
  }
  
  // 3. 时间感知（夜间可能在睡眠）
  const hour = new Date().getHours();
  if (hour > 22 || hour < 8) {
    baseResponse.animations = ["sleep"];  // 在睡眠状态
  }
  
  return baseResponse;
}
```

---

### 4. 情绪到表现的映射

#### 4.1 情绪评分计算

```javascript
// moodScore: 0-100 分
const moodScore = (
  contentment * 0.3 + 
  energy * 0.2 + 
  affection * 0.3 + 
  health * 0.2
);

// 情绪分段
const MOOD_SEGMENTS = {
  0-20:   { mood: "very_sad",    primaryColor: "#666", animations: ["sad"], eyeState: "closed" },
  21-40:  { mood: "sad",         primaryColor: "#999", animations: ["sad", "tired"], eyeState: "half" },
  41-60:  { mood: "neutral",     primaryColor: "#aaa", animations: ["idle", "curious"], eyeState: "normal" },
  61-80:  { mood: "happy",       primaryColor: "#ff9", animations: ["happy", "playful"], eyeState: "bright" },
  81-100: { mood: "very_happy",  primaryColor: "#ff0", animations: ["happy", "excited", "affectionate"], eyeState: "sparkling" }
};
```

#### 4.2 表现变化

| Mood | 皮肤色调 | 眼神 | 尾巴 | 姿态 | 背景 |
|------|---------|------|------|------|------|
| very_sad | 灰暗 | 无神 | 下垂 | 蜷缩 | 雨天 |
| sad | 暗淡 | 半睁 | 自然 | 低头 | 阴天 |
| neutral | 正常 | 正常 | 平静 | 站立 | 普通 |
| happy | 明亮 | 闪闪发光 | 摇晃 | 挺胸 | 晴天 |
| very_happy | 特别明亮 | 眨眼闪烁 | 快速摇晃 | 跳跃中 | 彩虹 |

---

### 5. 前端页面设计

#### 5.1 页面结构（pages/avatar/index）

```
┌─────────────────────────────────┐
│  ← 返回   宠物分身     分享 ⟳   │  ← 头部导航
├─────────────────────────────────┤
│                                 │
│          🎨 Live2D 模型          │  ← 可点击区域
│          （占屏幕 60%）          │
│                                 │
│  [💗] [⚡] [🏥] [😸]             │  ← 四维数据条
│  82    45   75    68             │
├─────────────────────────────────┤
│  📊 Level 2 | 初步了解            │  ← 进化信息
│  ━━━━━━━━━━━━━ 对话 45/50       │  ← 升级进度
├─────────────────────────────────┤
│  [🎮 小游戏]  [🎁 礼物]  [📖 回顾] │  ← 功能按钮
└─────────────────────────────────┘
```

#### 5.2 核心交互流程

```
用户打开页面
    ↓
加载 avatar_state 数据
    ↓
初始化 Live2D 模型 + 四维数据条
    ↓
播放欢迎动作（随机：happy / curious / playful）
    ↓
等待用户交互
    ├─ 点击宠物 → 触发交互动作 → 数据变化 → 视觉反馈
    ├─ 点击游戏 → 进入小游戏
    ├─ 点击礼物 → 装扮选择
    └─ 点击回顾 → 进化时间线
```

---

### 6. 云函数和接口设计

#### 6.1 核心云函数

**updateAvatarState（每日 0 点或打开小程序时调用）**
```javascript
// input
{
  petId: "pet_001",
  userId: "user_001"
}

// 逻辑
1. 读取 pets 档案
2. 读取最近 30 天 checkins 数据
3. 读取对话数据（askVet/askTrainer 调用次数）
4. 计算四维数据（contentment, energy, affection, health）
5. 计算进化等级
6. 写入 pet_avatar_states 集合

// output
{
  success: true,
  avatarState: { ... },
  levelChanged: false,
  newLevel: 2
}
```

**recordInteraction（用户每次点击时调用，可选异步）**
```javascript
// input
{
  petId: "pet_001",
  interactionType: "tap_back",  // 交互类型
  timestamp: "2026-03-24T10:30:00Z"
}

// 异步逻辑
1. 更新 pet_avatar_states 中的相关维度（+3 affection, +2 contentment）
2. 更新 stats.totalInteractions
3. 记录 interaction_log（用于后续分析）
4. 检测是否应该触发成就（如连续互动7天）

// 可以异步执行，不需要立即返回
```

**updateAvatarStateFromMemory（在 extractMemory 完成后调用）**
```javascript
// 在 extractMemory 云函数中调用
// 目的：根据新提取的信息更新宠物性格标签，从而影响互动风格

例如：新提取到"粘人"标签
→ 更新 pet_avatar_states.personality.primaryTraits
→ 下次点击互动时，被摸的概率提高
```

---

### 7. 实现步骤（分 3 周）

#### **第 1 周：数据层 + 基础前端**

- [ ] **Day 1-2**：设计并创建 `pet_avatar_states` 数据集合
  - 创建云数据库集合
  - 设计数据模型
  - 写入测试数据

- [ ] **Day 3**：编写 `updateAvatarState` 云函数
  - 计算四维维度公式
  - 计算进化等级
  - 测试数据计算逻辑

- [ ] **Day 4-5**：创建 `pages/avatar/index` 基础页面
  - 布局：顶部导航 + 中央模型区域 + 下方按钮
  - 获取 avatar_state 数据并展示
  - 四维数据条的 UI（进度条）
  - 进化等级显示

#### **第 2 周：Live2D 集成 + 点击交互**

- [ ] **Day 6-7**：Live2D 模型集成
  - 下载/获取二次元 Live2D 宠物模型
  - 集成 live2d.min.js 库
  - 在页面上成功渲染模型
  - 测试基础动作播放

- [ ] **Day 8**：点击热区系统
  - 实现点击检测（head / back / body / tail）
  - 创建交互映射表
  - 实现基础的点击 → 动作 的逻辑

- [ ] **Day 9**：智能响应机制
  - 根据性格和当前维度调整响应
  - 实现情绪分数 → 表现映射
  - 集成随机对话文案

- [ ] **Day 10**：数据反馈
  - 点击后更新前端维度显示
  - 调用 `recordInteraction` 云函数（异步记录）
  - 实现视觉反馈（数字浮起、数据条变化）

#### **第 3 周：完善 + 优化**

- [ ] **Day 11-12**：细节打磨
  - 微动画和过渡效果
  - 声音反馈（可选）
  - 特殊时段处理（夜间睡眠等）
  - 性能优化

- [ ] **Day 13-14**：游戏集成
  - 实现第一个小游戏（投喂游戏）
  - 游戏结束后更新维度数据
  - 实现游戏奖励（解锁动作/装饰）

- [ ] **Day 15**：测试 + 联调
  - 完整流程测试
  - 与现有功能（对话、打卡）的联动
  - Bug 修复

---

## Phase 1：强化版（后续迭代）

- 多皮肤系统（解锁、更换）
- 装饰品系统（帽子、领结等）
- 小游戏集合（逗猫棒、拍照等）
- 进化时间线回顾
- 与好友宠物的互动

---

## 技术栈

| 层级 | 技术 | 备注 |
|------|------|------|
| **前端** | 微信小程序 + live2d.min.js | live2d 库通过 npm/CDN 引入 |
| **动画** | Live2D Cubism SDK | 官方动画引擎 |
| **交互** | 触摸事件 API（wx.onTouchStart/Move/End） | 原生支持 |
| **数据** | 云数据库 | 存储 avatar_state |
| **云函数** | Node.js + wx-server-sdk | updateAvatarState / recordInteraction |
| **音效** | 可选，wx.playBackgroundMusic | 小动作配音（MVP 可跳过） |

---

## 关键风险点和对策

| 风险 | 对策 |
|------|------|
| Live2D 模型过大导致包体积爆炸 | MVP 只集成 1-2 个轻量模型（<2MB） |
| 点击响应延迟 | 动画本地播放，云数据异步记录，不阻塞 UI |
| 四维数据计算复杂 | 预先定制公式，测试数据准确性 |
| 性格标签影响互动逻辑混乱 | 建立清晰的条件判断规则，枚举所有情况 |
| 用户频繁点击导致维度数据溢出 | 设置冷却时间 + 单日增长上限 |


