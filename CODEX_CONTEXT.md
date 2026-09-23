# CODEX_CONTEXT.md — Kiki Immersion 项目交接文档

> **Last Updated**: 2026-09-23
> **Engine Version**: 1.2.8 | **Loader Version**: 1.0.5
> **Repository**: https://github.com/kekeqwq/Kiki-Immersion
> **Author**: keke

---

## 1. 项目概述

### 项目目标

**Kiki Immersion** 是一个运行在 YouTube 上的浏览器用户脚本（Userscript），目标是为日语/英语学习者提供**沉浸式语言学习体验**。

核心功能：
- 在 YouTube 视频上叠加**毛玻璃效果的自定义字幕**（替代原生字幕）
- 点击字幕中的任意单词即可触发 **Yomitan 离线词典查询**（内建完整日英词典引擎 + JSZip 解压 + IndexedDB 缓存）
- 集成 **OpenAI 兼容的 AI 上下文引擎**，提供单词在当前句子中的语境释义
- 支持 **A/D 键快捷跳转字幕行**、Space 暂停、Alt+F 网页全屏
- 支持 Safari（macOS/iPadOS）、Chrome、Edge，通过 Userscripts / Tampermonkey / Violentmonkey 安装

### 解决的问题

YouTube 原生字幕无法点击单个单词查词、无法与词典/AI 集成、样式不可定制。本项目完全接管字幕渲染流程，将 YouTube 变成一个沉浸式语言学习平台。

### 整体架构

```
┌──────────────────────────────────────────────────┐
│                   loader.user.js                  │
│  (document-start, 桩脚本, 注入 wire sniffer,      │
│   从 GitHub CDN 加载 5 个模块到页面)               │
└────────────────────┬─────────────────────────────┘
                     │ 按序加载 (eval 到同一 IIFE 作用域)
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
 ┌────────┐   ┌──────────┐   ┌──────────┐
 │ core   │   │ yomitan  │   │    ai    │
 │ (.js)  │   │  (.js)   │   │  (.js)   │
 └────┬───┘   └──────────┘   └──────────┘
      │
      ▼
 ┌────────┐   ┌──────────┐
 │  ui    │   │ youtube  │
 │ (.js)  │   │  (.js)   │
 └────────┘   └──────────┘
```

**模块加载顺序**: `core → yomitan → ai → ui → youtube`

所有模块在同一个 IIFE 作用域内执行，共享 `STATE`、`playerEl()`、`videoEl()` 等全局对象和函数。**没有 ES module import/export**，所有函数定义在模块级作用域。

### 技术栈和主要依赖

| 技术 | 用途 |
|------|------|
| **Vanilla JavaScript (ES2020+)** | 全部代码，无框架 |
| **Userscript API** | `@run-at document-start`, `@grant none`, `@inject-into page` |
| **JSZip 3.10.1** | 内嵌在 yomitan.js 中，用于解压离线词典 ZIP |
| **IndexedDB** | 离线词典数据缓存 |
| **localStorage / sessionStorage** | 设置持久化、模块缓存、PoToken 缓存 |
| **YouTube InnerTube API** | 获取字幕轨道列表 |
| **YouTube TimedText API** | 获取字幕内容（当前被 PoToken 阻断） |
| **MutationObserver** | 监听 YouTube 原生字幕 DOM 变化 |
| **Performance Resource Timing API** | 捕获播放器发出的 timedtext 请求 URL |
| **Python 3** | `scripts/bundle.py` 打包脚本（无 Node.js 依赖） |

---

## 2. 当前开发状态

### ✅ 已完成的功能

1. **模块化热更新加载器** — `loader.user.js` 从 GitHub CDN 加载模块，支持 localStorage 缓存和版本自动失效
2. **完整的离线 Yomitan 词典引擎** — 内嵌 JSZip、deinflector（词形还原）、IndexedDB 缓存、TTS 发音
3. **AI 上下文引擎** — OpenAI 兼容 API 流式请求、多轮对话、MarginNote 探索式建议药丸
4. **毛玻璃字幕 UI** — 自定义样式覆盖 YouTube 原生字幕，支持点击查词
5. **HUD 状态栏** — 显示字幕状态、轨道选择下拉菜单、设置面板入口
6. **字幕轨道选择** — 自动优先选择视频原语言轨道，支持手动切换
7. **键盘快捷键** — A/D 跳转字幕行、Space 暂停/播放、Alt+F 网页全屏
8. **桌面模式强制** — 自动将 m.youtube.com 重定向到桌面版
9. **Wire Sniffer 网络嗅探** — Hook fetch/XHR 捕获 YouTube 的 timedtext 请求和响应
10. **Live 实时字幕模式** — 通过 DOM 抓取 `.ytp-caption-segment` 实时显示字幕
11. **自愈机制** — 后台持续尝试从 Live 模式升级到结构化字幕
12. **Chrome Tampermonkey 支持** — 包含 Trusted Types 策略兼容
13. **单文件打包** — `scripts/bundle.py` 将所有模块合并为一个 userscript

### 已实现的重要模块

| 模块 | 文件 | 行数 | 核心职责 |
|------|------|------|----------|
| **core** | `modules/core.js` | 1067 | STATE 定义、Wire Sniffer hooks、样式注入、存储工具 |
| **yomitan** | `modules/yomitan.js` | 1838 | 离线词典引擎（含 JSZip 库 ~160KB 内嵌）、deinflector、音频 |
| **ai** | `modules/ai.js` | 525 | OpenAI API 客户端、流式渲染、多轮上下文 |
| **ui** | `modules/ui.js` | 1590 | 字幕渲染、HUD bar、设置面板、About 弹窗、词典查询卡片 |
| **youtube** | `modules/youtube.js` | 1811 | YouTube 适配器：字幕管线、SPA 导航、轨道抓取、全屏手势 |
| **loader** | `loader.user.js` | 373 | document-start 入口、模块下载/缓存/eval |

### 已修改的重要文件及作用

| 文件 | 作用 |
|------|------|
| `loader.user.js` | 入口桩脚本，document-start 注入 Wire Sniffer，按序从 GitHub 加载 5 个模块 |
| `modules/core.js` | 全局 STATE 对象、timedtext URL 捕获、PoToken 持久化、Resource Timing 检查 |
| `modules/youtube.js` | 字幕获取管线（9 步 fallback）、Live/结构化模式切换、tick 循环（120ms）、SPA 导航监听 |
| `modules/ui.js` | 字幕 DOM 渲染（`renderTextToBox`、`renderCue`）、HUD 更新、Yomitan 查词卡片 UI |
| `modules/yomitan.js` | 完整离线词典引擎，含 JSZip 库、词形还原、IndexedDB 缓存 |
| `modules/ai.js` | AI 上下文解释，OpenAI 兼容 streaming API |
| `scripts/bundle.py` | 将 loader 头 + 5 模块合并为 `dist/` 和 `userscript/` 下的单文件 |
| `manifest.json` | 模块清单（名称、路径、描述），loader 加载时参考 |
| `README.md` | 用户文档、安装指南、版本发布说明 |

### 当前可以运行到什么程度

- ✅ 安装 loader.user.js 后，可以在 YouTube 上正常加载所有模块
- ✅ HUD 状态栏正常显示，设置面板可打开
- ✅ 离线词典导入和查词功能正常
- ✅ AI 上下文引擎功能正常（需配置 API Key）
- ✅ **结构化字幕已完美恢复**（通过 Transcript Panel `ytd-engagement-panel-searchable-transcript` 绕过 PoToken 阻断，精准提取带有 `startMs` / `endMs` 毫秒级时间戳的全部结构化字幕行，显示 `CC: Track · Lines ▾`）
- ✅ **实时字幕极速起播**（视频播放开始瞬间立即显示 Live 抓取字幕，后台 ~500ms 内静默拉取完整结构化字幕并无感升级）
- ✅ **A/D 键跳转行完美工作**（结构化轨道精准跳转，Live 模式平滑回退）
- ✅ **Trusted Types 兼容**（在 `document-start` 注入 `default` 策略，彻底杜绝 YouTube CSP 导致的模块执行拦截）

---

## 3. 未完成工作

### 🟢 已完成核心突破

#### P0: 修复 YouTube PoToken 导致的字幕加载失败
**状态**: ✅ 已在 v1.2.8 彻底解决（利用 YouTube 内部 Transcript Engagement Panel 自动化提取，完美绕过 PoToken 限制获取数百至上千条结构化 cues）

### 未完成的功能列表

| # | 任务 | 状态 | 完成度 |
|---|------|------|--------|
| 1 | 解决 PoToken 问题，恢复结构化字幕加载 | 🔴 阻断 | 0% |
| 2 | 改进 Live 模式使其体验接近结构化字幕 | 🟡 未开始 | 0% |
| 3 | Live 模式下的 A/D 键跳转优化（liveCues 准确性） | 🟡 部分完成 | 60% |
| 4 | 双语字幕显示（同时显示原文 + 翻译） | 🟡 未开始 | 0% |
| 5 | 更多语言支持（韩语、中文等） | 🟡 未开始 | 0% |
| 6 | 离线字幕缓存（避免每次都需要网络） | 🟡 未开始 | 0% |
| 7 | Firefox 兼容性测试和修复 | 🟡 未开始 | 0% |

### 推荐执行顺序

1. **首先**：研究 PoToken 提取方案或找到替代的字幕数据源
2. **如果 PoToken 短期无法解决**：大幅改进 Live 模式体验（更稳定的 DOM 抓取、更好的 cue 累积、准确的时间戳）
3. **然后**：完善 A/D 键在 Live 模式下的导航体验
4. **最后**：双语字幕、更多语言、离线缓存等增强功能

---

## 4. 当前问题和阻塞点

### 🔴 核心阻塞：YouTube PoToken 要求

**根本原因**: YouTube 现在对所有 timedtext API 请求要求 PoToken 认证。

**详细技术分析**:

- 所有 timedtext API URL 包含 `exp=xpe` 参数
- 所有 fetch/curl 请求返回 HTTP 200 + content-length: 0（空 body）
- 移除 `exp=xpe` 参数后返回 404
- InnerTube `/youtubei/v1/player` 端点返回 400（ANDROID/IOS/WEB client）
- InnerTube `get_transcript` 端点返回 400 FAILED_PRECONDITION
- `video.textTracks` 显示 2 个轨道（kind: "forced", label: "YouTube Captions"）但都有 **0 个 cues**
- Wire Sniffer 捕获不到任何内容 — YouTube 播放器的字幕请求也返回空
- `__kiki_lastPoToken` 为空 — 没有 PoToken 被生成
- YouTube 自己的播放器通过 `.ytp-caption-segment` DOM 元素渲染字幕，但这些是临时性的，不由 textTrack cues 支持
- Python 的 `youtube-transcript-api` 库也有同样的问题（抛出 `PoTokenRequired` 异常）

**验证方法**: 这些结论通过 AppleScript 远程执行 JavaScript 在 Safari 中实际测试过，不是推测。

### 🟡 已知 Bug

1. **youtube.js 底部 console.log 版本号硬编码为 1.2.5** — L1811 `console.log('[Kiki Immersion] v1.2.5 ...')` 应该是 1.2.7
2. **Live 模式偶尔丢失字幕** — 当 YouTube 播放器更新 DOM 但 `.ytp-caption-segment` 元素尚未渲染时，tick 循环可能错过字幕
3. **Live 模式 cue 时间戳不精确** — `liveCues` 的 start/end 时间基于 `videoEl().currentTime` 快照，与实际字幕时间有偏差

### 🟡 需要进一步调查的地方

1. **YouTube 播放器内部如何获取字幕？** — 播放器确实能渲染字幕（`.ytp-caption-segment` 有内容），但我们的 Wire Sniffer 捕获不到对应请求。可能是通过 WebSocket、ServiceWorker、或内部 Blob URL 传输。
2. **BotGuard / Attestation** — YouTube 使用 BotGuard JavaScript 生成 PoToken，理论上可以 hook 其 API 来提取 token，但这是高度混淆的代码。
3. **"Show transcript" 面板** — 点击后面板打开但无法获取到文本数据（continuation renderer 为空），需要调查面板是否也需要 PoToken。
4. **其他浏览器表现** — 只在 Safari 测试过，Chrome/Firefox 的行为可能不同。

---

## 5. 重要技术决策

### 为什么采用当前方案

| 决策 | 原因 |
|------|------|
| **无框架纯 JS** | 需要作为 userscript 注入到 YouTube 页面，不能引入 React/Vue 等框架 |
| **模块化 + 热更新** | 方便开发迭代，用户不需要重新安装脚本。loader 从 GitHub CDN 拉取最新模块 |
| **document-start 注入** | 必须在 YouTube 页面加载前 hook fetch/XHR，否则无法捕获 timedtext 请求 |
| **同一 IIFE 作用域** | 不能用 ES modules（userscript 限制），所有模块 eval 到同一作用域共享变量 |
| **内嵌 JSZip** | Yomitan 词典是 ZIP 格式，不能依赖外部 CDN 加载 JSZip |
| **Wire Sniffer 拦截** | 拦截 YouTube 原生的 fetch/XHR timedtext 请求来获取字幕数据和 PoToken |
| **Live DOM 抓取 fallback** | 当所有结构化字幕获取方式失败时，直接抓取 YouTube 播放器渲染的 DOM 字幕 |
| **120ms tick 循环** | 需要频繁检查视频进度来同步字幕显示，120ms 是性能和响应速度的平衡点 |

### 放弃过的方案

| 放弃的方案 | 原因 |
|-----------|------|
| **直接 fetch timedtext URL** | YouTube 要求 PoToken，返回空 body |
| **InnerTube player API** | 从浏览器上下文返回 400 |
| **InnerTube get_transcript** | 返回 400 FAILED_PRECONDITION |
| **移除 URL 中的 exp=xpe** | 返回 404 |
| **HTML5 video.textTracks** | YouTube 不再填充 textTrack cues（tracks 有 0 个 cue） |
| **YouTube Transcript 面板抓取** | 面板打开但 continuation renderer 为空 |
| **Selenium / Playwright** | 开发环境没有安装，且 userscript 无法使用 |

### ⚠️ 不要轻易修改的设计

1. **`loader.user.js` 的 Wire Sniffer hooks** — 这些必须在 `document-start` 尽早执行，任何延迟都会导致错过 YouTube 的 timedtext 请求
2. **模块加载顺序** `core → yomitan → ai → ui → youtube` — youtube 模块依赖 ui 和 core 的函数
3. **STATE 对象结构** — 多个模块共享同一个 STATE，修改字段名会破坏所有模块
4. **`suppressNativeCaptions()` 调用** — 必须在 tick 循环和 mutation handler 中都调用，否则会出现双重字幕
5. **`origFetch` 引用** — youtube.js 中保存了原始 fetch 的引用，用于绕过自己的 hook 发起请求

---

## 6. 项目结构说明

### 目录结构

```
Kiki-Immersion-Safari/
├── loader.user.js          # 入口桩脚本 (373 行)
├── manifest.json           # 模块清单 (模块名、路径、描述)
├── README.md               # 用户文档 + 安装指南 + 版本历史
├── LICENSE                 # GPL-3.0
├── .gitignore
├── modules/                # 核心模块代码
│   ├── core.js             # STATE、Wire Sniffer、样式、工具函数 (1067 行)
│   ├── yomitan.js          # 离线词典引擎 + 内嵌 JSZip (1838 行, 192KB)
│   ├── ai.js               # AI 上下文引擎 (525 行)
│   ├── ui.js               # UI 渲染、HUD、设置面板 (1590 行)
│   └── youtube.js          # YouTube 适配器、字幕管线 (1811 行)
├── scripts/
│   ├── bundle.py           # 打包脚本：合并所有模块为单文件 userscript
│   └── build_all.py        # 完整构建脚本
├── dist/
│   └── kiki-immersion.user.js  # 打包后的单文件 userscript (~399KB)
├── userscript/
│   └── kiki-immersion.user.js  # 同上 (用于 iPadOS 复制粘贴安装)
└── test/
    ├── index.html          # 测试页面
    ├── hub.html
    ├── css/
    └── js/
```

### 核心文件详细说明

#### `loader.user.js` — 入口桩脚本

- 在 `document-start` 阶段执行
- **Section 1**: 强制桌面模式（cookie + m.youtube.com 重定向 + navigator.platform 伪造）
- **Section 2**: 注入早期 Wire Sniffer — hook `fetch()` 和 `XMLHttpRequest.prototype.open/send`，拦截所有 timedtext 请求的 URL 和响应 body
- **Section 3**: 从 GitHub CDN (`raw.githubusercontent.com`) 按序加载 5 个模块，带 localStorage 缓存和版本校验（`EXPECTED_CACHE_VERSION`）
- **Section 4**: 模块加载前进行语法校验（JavaScriptCore / `new Function()`），防止缓存损坏的代码

#### `modules/core.js` — 核心状态和工具

- **STATE 对象** (L17-40): 所有模块共享的全局状态
  - `cues: []` — 结构化字幕数组 `{start, end, text}`
  - `liveCues: []` — Live 模式实时抓取的字幕
  - `tracks: []` — 可用字幕轨道列表
  - `activeTrack` — 当前选中的轨道
  - `idx` — 当前显示的字幕索引
  - `liveMode: true` — 是否在 Live 抓取模式
  - `liveFallbackAllowed: true` — 是否允许 Live 回退
  - `lastPoToken` — 最后捕获的 PoToken
  - `capturedLastUrl` / `capturedBody` — Wire Sniffer 捕获的 URL 和 body
- **noteTimedtextUrl()** (L47-67): 从 URL 中提取 PoToken 和 videoId
- **checkResourceTimingForTimedtext()** (L69-80): 通过 Performance API 查找 timedtext 资源
- **样式注入**: 毛玻璃效果 CSS、字幕定位、HUD 样式

#### `modules/youtube.js` — 字幕管线（最关键的模块）

**字幕加载流程** (`loadForVideo()`, L1440-1611):
```
1. 检查 Wire Sniffer 缓存 (capturedBody)
2. DOM / Player 提取字幕轨道列表 (getAllCaptionTracks)
3. InnerTube API 回退 (innertubeTracks)
4. 后台页面 fetch 回退 (从 watch 页面 HTML 提取)
5. 激活 YouTube 原生字幕按钮 (ensureCaptionsActive)
6. 直接 fetch 最佳轨道的 timedtext URL
7. 尝试移除 exp=xpe 参数重新 fetch
8. 检查 video.textTracks
9. 所有失败 → 切换到 Live 模式
   └→ 后台 self-heal 继续尝试 direct candidates
```

**关键函数**:
- `loadForVideo(force?)` — 9 步字幕加载管线
- `onNativeCaptionsMutated()` — 原生字幕 DOM 变化处理 + Live→结构化升级
- `tick()` — 120ms 主循环，同步字幕显示
- `onNavigate()` — SPA 导航处理（YouTube 页面切换不刷新）
- `fetchExact(url, timeout)` — 带超时的 timedtext fetch
- `selectSubtitleTrack(track)` — 手动切换字幕轨道
- `seekCue(delta)` — A/D 键跳转字幕行
- `parseAny(raw)` — 解析多种字幕格式（json3, srv1-3, vtt, ttml）
- `suppressNativeCaptions()` — 隐藏 YouTube 原生字幕
- `getLiveCaptionText()` — 从 `.ytp-caption-segment` 抓取实时字幕

#### `modules/ui.js` — UI 渲染

- `renderTextToBox(box, text)` — 将字幕文本渲染到毛玻璃容器，支持单词点击
- `renderCue(index)` — 根据索引渲染字幕 cue
- `updateHud(text?)` — 更新顶部状态栏文本
- `ensureHud()` / `ensureRoot()` — 确保 HUD 和字幕根元素存在
- `closeLookup()` — 关闭词典查询卡片并恢复播放
- `onWordPointer(word, event)` — 单词点击/触摸处理，触发 Yomitan 查询
- Settings Modal — AI API Key 配置、词典管理、字幕设置

#### `modules/yomitan.js` — 离线词典

- 内嵌完整 JSZip 3.10.1 库（约 160KB minified）
- 支持导入 Yomitan/Yomichan 格式的 ZIP 词典文件
- IndexedDB 缓存解压后的词典数据
- Deinflector 词形还原（日语动词变位等）
- TTS 音频播放
- 文件大小: 192KB（是最大的单个模块）

#### `modules/ai.js` — AI 引擎

- OpenAI 兼容 API（支持自定义 base URL）
- 流式响应渲染（SSE）
- 多轮对话上下文
- MarginNote 风格探索建议药丸
- ping 连接测试

---

## 7. 近期开发历史

### Git 提交历史（最近 10 条）

```
cd0e12c fix(subtitles): resolve live/structured desync and freeze, bump to Engine v1.2.7 and Loader v1.0.4
d4bbcac perf(captions): remove 22s blocking timeouts, render live text instantly & background self-heal
9debb45 feat(subtitles): install document-start sniffer in loader, accumulate live cues for A/D navigation & auto-supply PoToken
12cd188 fix(subtitles): reject pseudo-tracks < 5 cues, check signature param & bump engine to 1.2.6
8fe128b fix(captions): support arraybuffer/blob in wire sniffer, preserve signed URLs & activate player captions early
bce5b86 fix(loader): handle Trusted Types restriction during module pre-validation & bump to 1.0.3
c938dba fix(loader): validate module syntax before caching and saving to localStorage
c075b11 fix: remove misplaced closing brace causing SyntaxError in youtube.js loadForVideo
be4a47a fix: eliminate PoToken URL poisoning on signed URLs & restore multi-track direct fetch
120a263 fix: prevent fetch Illegal invocation playback error, isolate timedtext hooks, auto-reload on playback recovery & update README badges
```

### v1.2.7 中做的重大改动

1. **分离 `STATE.liveCues` 和 `STATE.cues`** — Live DOM 抓取的字幕累积到 `STATE.liveCues[]`，不再污染 `STATE.cues[]`
2. **更新 `seekCue()`** — 同时检查 `STATE.cues`（结构化）和 `STATE.liveCues`（live）
3. **更新 `onNativeCaptionsMutated()`** — 移除了阻止 live caption 更新的过早 `return`
4. **更新 `ensureCaptionsActive()`** — 默认语言从 `"en"` 改为 `detectVideoLanguage() || "ja"`
5. **更新 `loadForVideo()`** — 添加清理 URL 的 `exp=xpe` fetch 尝试，始终在结构化字幕不可用时显示 Live 模式
6. **更新 `tick()`** — Live 模式分支只在检测到新文本时才调用 `onNativeCaptionsMutated()`

---

## 8. 给下一个 AI Agent 的建议

### 开发环境

- **macOS**, 主力测试浏览器 **Safari**（用 Userscripts 扩展）
- **Python 3** 可用（`/run/current-system/sw/bin/python3`）
- **没有** Node.js、npm、bun、deno
- **没有** Selenium、Playwright 等浏览器自动化工具
- **JavaScriptCore** 可用于语法检查: `/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc`
- **AppleScript** 可用于 Safari 自动化: `osascript -e 'tell application "Safari" to do JavaScript "..." in current tab of window 1'`
- 打包命令: `cd /Users/keke/Repos/Kiki-Immersion-Safari && python3 scripts/bundle.py`

### 工作流程

1. 修改 `modules/` 下的源码
2. 运行 `python3 scripts/bundle.py` 打包
3. 版本号需要同步更新: `core.js`, `ui.js`, `youtube.js`, `loader.user.js`, `manifest.json`, `bundle.py`, `README.md`
4. 提交并推送到 GitHub
5. 用户在 Safari 中刷新页面即可加载最新模块（或手动清除 localStorage 缓存）

### 关键注意事项

1. **不要破坏 Wire Sniffer** — 这是在 `document-start` 阶段注入的 fetch/XHR hook，是获取 timedtext 数据的关键
2. **不要修改模块加载顺序** — youtube 依赖 ui 和 core 中的函数
3. **所有函数在同一作用域** — 没有 import/export，函数名冲突会直接覆盖
4. **STATE 是可变全局对象** — `window.STATE`，所有模块读写同一个对象
5. **YouTube 是 SPA** — 页面不会真正刷新，必须监听 `yt-navigate-finish` 等事件
6. **PoToken 是当前最大技术挑战** — 不要浪费时间尝试已经验证失败的方案（见第 4 节）
7. **测试视频**: `https://www.youtube.com/watch?v=29GgkdVV2o8`

### 可能的突破方向

1. **Hook YouTube 播放器内部的字幕渲染管线** — 播放器确实能渲染字幕（`.ytp-caption-segment` 有内容），说明内部有某种方式获取字幕数据。可以尝试 hook `innerHTML` setter 或 `Node.prototype.appendChild` 来捕获渲染前的数据。
2. **拦截播放器的内部 XHR/fetch** — 播放器必须在某处发起认证请求获取字幕，可能通过 ServiceWorker 或不同的 API 端点。
3. **提取 BotGuard/Attestation 生成的 PoToken** — 需要逆向 YouTube 的 BotGuard JavaScript，提取 token 生成逻辑。
4. **改进 Live 模式** — 如果 PoToken 短期无解，可以大幅优化 Live 模式：
   - 更精确的时间戳（通过 video.currentTime 校准）
   - 更稳定的 DOM 观察（MutationObserver 替代轮询）
   - 累积完整的 cue 列表用于 A/D 导航
   - 实现 "伪结构化" 模式，让用户体验接近完整字幕

### 代码规范

- 使用 `console.log('[Kiki ...]')` 或 `console.warn('[Kiki ...]')` 格式的日志前缀
- Toast 通知使用 `toast(message)` 函数
- 全局状态只通过 `STATE` 对象传递
- 版本号格式: Engine `X.Y.Z`, Loader `X.Y.Z`
