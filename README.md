# 毛孩子翻译官 🐱🐶

一个基于微信小程序的宠物声音翻译与 AI 助手应用，帮助宠物主人理解宠物的情绪和行为。

## 功能特性

### 核心功能
- 🎙️ **声音翻译** - 录制宠物叫声，AI 分析情绪和意图
- 🤖 **AI 宠物医生** - 健康咨询、症状分析、饮食建议
- 🎓 **AI 训练师** - 行为问题诊断、训练方案定制
- 📚 **宠物百科** - 宠物知识库、养护指南
- 📋 **宠物档案** - 记录宠物信息、健康数据
- ✅ **每日打卡** - 养宠习惯养成、数据追踪

### 页面结构
```
├── 首页 (index)
│   ├── 宠物欢迎卡片
│   ├── 录音按钮
│   └── 功能入口（2列卡片布局）
├── AI 助手 (ai)
│   ├── AI 宠物问诊入口
│   ├── AI 训练师入口
│   ├── 健康咨询快捷问题
│   └── 训练咨询快捷问题
├── AI 宠物问诊 (healthchat)
│   └── 聊天界面
├── AI 训练师 (trainingchat)
│   └── 聊天界面
├── 结果页 (result)
│   └── 声音分析结果展示
├── 打卡页 (checkin)
│   └── 每日打卡记录
├── 宠物百科 (baike)
│   └── 宠物知识库
├── 养宠指南 (guide)
│   └── 养护指南
├── 健康记录 (health)
│   └── 健康数据记录
├── 宠物档案 (petbook)
│   └── 宠物档案管理
├── 我的 (profile)
│   └── 个人中心
└── 隐私政策 (privacy)
    └── 隐私说明
```

## 技术栈

### 前端
- **框架**: 微信小程序原生框架
- **样式**: WXSS (WeChat Style Sheet)
- **语言**: JavaScript (ES6+)

### 后端
- **云开发**: 微信云开发
- **云函数**: analyzeAudio - 音频分析
- **云存储**: 用于音频文件存储

### 核心依赖
- 云函数依赖包（位于 `cloudfunctions/analyzeAudio/package.json`）

## 项目结构

```
pet-voice/
├── miniprogram/              # 小程序前端代码
│   ├── pages/              # 页面目录
│   │   ├── index/         # 首页
│   │   ├── ai/            # AI 助手
│   │   ├── healthchat/     # 健康问诊聊天
│   │   ├── trainingchat/   # 训练师聊天
│   │   ├── result/        # 结果页
│   │   ├── checkin/       # 打卡页
│   │   ├── baike/         # 百科
│   │   ├── guide/         # 指南
│   │   ├── health/        # 健康记录
│   │   ├── petbook/       # 宠物档案
│   │   ├── profile/       # 我的
│   │   └── privacy/       # 隐私政策
│   ├── assets/             # 静态资源
│   │   └── tab/          # Tab 图标
│   ├── custom-tab-bar/     # 自定义 Tab Bar
│   ├── app.js              # 小程序入口
│   ├── app.json            # 小程序配置
│   ├── app.wxss            # 全局样式
│   └── sitemap.json        # 站点地图
├── cloudfunctions/         # 云函数
│   └── analyzeAudio/      # 音频分析云函数
├── project.config.json      # 项目配置
└── README.md              # 项目说明
```

## 快速开始

### 环境要求
- 微信开发者工具（最新稳定版）
- 微信小程序 AppID
- Node.js 环境（用于云函数开发）

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd pet-voice
```

2. **打开微信开发者工具**
   - 导入项目目录
   - 填写 AppID
   - 选择云开发模板

3. **云函数初始化**
   - 在开发者工具中右键 `cloudfunctions/analyzeAudio`
   - 选择"上传并部署：云端安装依赖"

4. **配置云开发环境**
   - 在开发者工具中开启云开发
   - 创建云环境（开发/测试/生产）

### 本地开发

1. **启动云函数本地调试**
```bash
# 在 cloudfunctions/analyzeAudio 目录下
npm install
```

2. **小程序预览**
   - 点击开发者工具"编译"按钮
   - 在模拟器中预览

## 配置说明

### 小程序配置 (app.json)

```json
{
  "pages": [...],
  "tabBar": {
    "custom": true,
    "selectedColor": "#FF9F43",
    "backgroundColor": "#ffffff"
  },
  "permission": {
    "scope.record": {
      "desc": "用于录制宠物叫声，进行情绪分析"
    }
  }
}
```

### 权限说明
- `scope.record`: 录音权限，用于录制宠物叫声

## 设计规范

### 配色方案
```css
--color-primary: #FF9F43;      /* 主色调 - 橙色 */
--color-text: #333333;          /* 主要文字 */
--color-gray: #999999;          /* 次要文字 */
--background-gradient: linear-gradient(180deg, #FFF9F0 0%, #FFE8CC 100%);
```

### 设计风格
- **主题**: 可爱温馨风格
- **圆角**: 统一使用 28-32rpx 圆角
- **阴影**: 柔和的阴影效果
- **动画**: 轻微的浮动、弹跳动画

## 开发指南

### 添加新页面

1. 在 `miniprogram/pages/` 下创建新页面目录
2. 在 `app.json` 的 `pages` 数组中注册页面
3. 按照现有页面结构开发

### 云函数开发

1. 在 `cloudfunctions/` 下创建新云函数目录
2. 编写 `index.js` 和 `package.json`
3. 在开发者工具中上传部署

### 样式规范
- 使用 rpx 单位（750rpx = 屏幕宽度）
- 遵循 BEM 命名规范
- 优先使用 flexbox 布局

## 部署

### 小程序发布
1. 点击开发者工具"上传"按钮
2. 填写版本号和项目备注
3. 在微信公众平台提交审核

### 云函数部署
1. 右键云函数目录
2. 选择"上传并部署"
3. 选择云端安装依赖

## 常见问题

### Q: 云函数调用失败？
A: 检查云环境 ID 是否正确，确保云函数已正确部署。

### Q: 录音功能无法使用？
A: 确保用户已授权录音权限，检查 `permission` 配置。

### Q: 自定义 Tab Bar 不显示？
A: 检查 `custom-tab-bar` 组件是否正确引入，确保 `tabBar.custom` 为 `true`。

## 版本历史

- **v0.0.2** - 优化首页布局、添加 AI 助手功能
- **v0.0.1** - 初始版本，基础功能实现

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

本项目仅供学习交流使用。

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 Issue
- 发送邮件

---

**毛孩子翻译官** - 让你更懂你的毛孩子 🐾
