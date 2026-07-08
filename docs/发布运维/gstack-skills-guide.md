# gstack 技能参考手册

> 本文档来源于 [gstack](https://github.com/garrytan/gstack)（Garry Tan 的 AI 原生软件工厂），整理了所有在 Cursor IDE 中可用的技能及详细说明。

---

## 简述

gstack 不是代码生成工具，而是一套**完整的 AI 开发流程系统**。它将 AI 代理变成一支虚拟工程团队——包含 CEO、设计师、工程经理、QA、安全官、发布工程师等角色，全部以技能（skill）方式驱动。

工作流遵循：**Think → Plan → Build → Review → Test → Ship → Reflect**

每个技能的输出自动喂给下一个阶段，形成完整的开发闭环。

---

## 在 Cursor 中使用

gstack 已安装到全局 Cursor skills 路径 `~/.cursor/skills/gstack/`。在 Cursor 中，通过自然语言描述你要的技能即可触发（例如"帮我做一次代码审查"对应 `/review` 技能）。

**注意：** gstack 最初为 Claude Code 设计，使用 slash 命令（如 `/review`）调用。在 Cursor 中可以通过口头描述意图来触发对应技能。

---

## 技能全景一览

| 阶段 | 技能 | 角色 | 一句话 |
|------|------|------|--------|
| **Think** | `/office-hours` | YC 合伙人 | 重新定义你要做什么 |
| **Plan** | `/autoplan` | 全自动流程 | 一键跑完所有审查 |
| | `/plan-ceo-review` | CEO | 找到 10 星产品藏在哪 |
| | `/plan-eng-review` | 工程经理 | 锁定架构和边界条件 |
| | `/plan-design-review` | 资深设计师 | 设计评审计划 |
| | `/plan-devex-review` | DX 负责人 | 开发者体验规划 |
| | `/plan-tune` | 调优师 | 自调问题提问敏感度 |
| **Build** | `/design-consultation` | 设计合伙人 | 从零搭建完整设计系统 |
| | `/design-shotgun` | 设计探索器 | 批量生成设计变体 |
| | `/design-html` | 设计工程师 | 设计稿 → 可交付 HTML |
| **Review** | `/review` | Staff 工程师 | 找 bug，自动修复 |
| | `/design-review` | 设计师 | 80 项视觉审计 + 修复 |
| | `/devex-review` | DX 审查员 | 实机开发者体验审计 |
| | `/health` | 代码质量仪表 | 类型/测试/死代码综合评分 |
| **Test** | `/qa` | QA 主管 | 真实浏览器测试 + 修 bug |
| | `/qa-only` | QA 报告员 | 仅生成 bug 报告 |
| | `/browse` | QA 工程师 | 实时浏览器操作 |
| | `/scrape` | 数据提取器 | 网页数据提取 |
| | `/benchmark` | 性能工程师 | 页面性能基线 |
| | `/benchmark-models` | 模型基准 | 跨模型性能对比 |
| **Debug** | `/investigate` | 调试器 | 系统性根因分析 |
| | `/freeze` | 安全锁 | 限制编辑范围 |
| | `/careful` | 安全护栏 | 破坏性命令预警 |
| | `/guard` | 全防护 | careful + freeze |
| | `/unfreeze` | 解锁 | 解除编辑限制 |
| **Ship** | `/ship` | 发布工程师 | 测试 → 提交 → PR |
| | `/land-and-deploy` | 发布工程师 | 合入 PR → 部署 → 验证 |
| | `/canary` | SRE | 部署后监控 |
| **Reflect** | `/retro` | 敏捷教练 | 每周回顾报告 |
| | `/document-release` | 技术写作 | 自动更新项目文档 |
| | `/document-generate` | 技术写作 | 从代码生成 Diataxis 文档 |
| | `/learn` | 记忆管理员 | 管理跨会话学习记录 |
| **Security** | `/cso` | 安全官 | OWASP + STRIDE 安全审计 |
| **Multi-AI** | `/pair-agent` | 多代理协调 | 跨 AI 代理协作 |
| | `/setup-gbrain` | 记忆同步 | 设置跨机器记忆 |
| | `/sync-gbrain` | 大脑更新 | 同步仓库代码索引 |
| **Browser** | `/open-gstack-browser` | 浏览器管理 | 启动可视化浏览器 |
| | `/connect-chrome` | 浏览器管理 | 启动可视化浏览器 |
| | `/setup-browser-cookies` | 会话管理 | 导入真实浏览器 cookies |
| **Utility** | `/gstack-upgrade` | 自更新 | 升级 gstack |
| | `/setup-deploy` | 部署配置 | 一键配置部署平台 |
| | `/context-save` | 状态保存 | 保存当前工作上下文 |
| | `/context-restore` | 状态恢复 | 恢复工作上下文 |
| | `/skillify` | 技能编码 | 将浏览器操作固化为技能 |
| | `/make-pdf` | PDF 生成 | Markdown → 出版级 PDF |
| | `/landing-report` | 发布队列 | 查看工作区发布状态 |

> **注意：** `/codex`（OpenAI Codex CLI 独立审查）仅在 Codex CLI 环境下可用，Cursor 中不包含。

---

## 阶段一：Think（思考）

### /office-hours — YC 合伙人

这是每个项目的起点。在写任何代码之前，先和一个 YC 风格的合伙人聊聊你真正在造什么。

**核心能力：**

1. **重新定义问题** — 不听你的功能需求，而是听你的痛点，找到真正的产品
2. **前提挑战** — 提出可证伪的主张，你同意/不同意/调整，每个被接受的前提都成为设计文档的承重墙
3. **实现方案** — 生成 2-3 种具体方案，附带诚实的工作量评估
4. **设计文档** — 输出到 `~/.gstack/projects/`，自动喂给后续技能

**两种模式：**

| 模式 | 适用场景 | 特点 |
|------|---------|------|
| Startup 模式 | 创业者、内部创业者 | 6 个强力问题：需求真实性、现状、绝望特异性、最窄楔子、观察与惊喜、未来适配 |
| Builder 模式 | 黑客马拉松、个人项目 | 热情的协作者，帮你找到最酷的版本 |

**触发方式：** 描述你的想法，要求做一次 office hours 产品思考

---

## 阶段二：Plan（规划）

### /autoplan — 全自动审查流水线

一键执行 CEO → Design → Eng → DX 全链路审查，用 6 个决策原则自动做决定，只把品味相关的决策留给你。

**核心能力：**
- 自动检测哪些审查适用于当前变更
- 编码的决策原则处理 90% 的常规决定
- 只问真正的品味问题

### /plan-ceo-review — CEO / 创始人

"这个需求的背后藏着什么 10 星产品？"

不要机械地实现需求，而是从用户角度重新思考问题。四档模式：

| 模式 | 用途 |
|------|------|
| **SCOPE EXPANSION** | 大胆做梦，逐个选择是否扩展 |
| **SELECTIVE EXPANSION** | 保持当前范围基线，选择性采纳 |
| **HOLD SCOPE** | 对现有计划做最大严格审查 |
| **SCOPE REDUCTION** | 砍到最小可行版本 |

**示例：** 用户说"让卖家上传商品照片"，CEO 审查会问——真正的功能不是"上传照片"，而是"帮卖家创建一个真正能卖出去的列表"。然后自动推断产品型号、搜索网络、起草标题描述、检测照片质量。

### /plan-eng-review — 工程经理

产品方向确定后，转为技术负责人模式。锁定：

- 架构决策和系统边界
- 数据流和状态转换
- 失败模式和边界条件
- 信任边界和测试覆盖率

**强制要求：** 生成 ASCII 图表（架构图、状态机、数据流图、测试矩阵），迫使隐藏假设暴露。

**审查准备仪表板：** 每次审查（CEO、Eng、Design）记录结果，显示：

```
+====================================================================+
|                    REVIEW READINESS DASHBOARD                       |
+====================================================================+
| Review          | Runs | Last Run            | Status    | Required |
|-----------------|------|---------------------|-----------|----------|
| Eng Review      |  1   | 2026-03-16 15:00    | CLEAR     | YES      |
| CEO Review      |  1   | 2026-03-16 14:30    | CLEAR     | no       |
| Design Review   |  0   | —                   | —         | no       |
+--------------------------------------------------------------------+
| VERDICT: CLEARED — Eng Review passed                                |
+====================================================================+
```

### /plan-design-review — 资深设计师

在写一行代码之前做设计审查。7 轮审查：

1. **信息架构** — 内容层级是否清晰
2. **交互状态覆盖** — 空状态/加载/错误/边界
3. **用户体验旅程** — 用户完成目标的路径
4. **AI 生成内容风险** — 检测"生成的 AI 设计"特征
5. **设计系统一致性** — 是否对齐已有系统
6. **响应式/无障碍** — 多尺寸、可访问性
7. **未解决的设计决策** — 哪些决定被推迟了

每轮评分 0-10，低于 8 分的全面修复，8 分以上的快速通过。

### /plan-devex-review — 开发者体验审查

交互式 DX 审查。探索开发者画像、对比竞品 TTHW（Time To Hello World）、设计"魔法时刻"、追踪摩擦点。三档模式：

| 模式 | 用途 |
|------|------|
| DX EXPANSION | 扩展开发者体验愿景 |
| DX POLISH | 打磨现有体验 |
| DX TRIAGE | 优先处理关键痛点 |

### /plan-tune — 问题调优

跨技能自调 AskUserQuestion 提问敏感度。标记问题为：

- **never-ask** — 不问了，直接决定
- **always-ask** — 每次都问
- **one-way** — 只需要确认一次

---

## 阶段三：Build（构建）

### /design-consultation — 设计合伙人

从零搭建完整设计系统。对话式流程：

1. 了解你的产品和用户
2. 研究竞品视觉风格（截图分析）
3. 提出完整设计系统——审美、字体、颜色、间距、布局、动效
4. 标注哪些是"安全选择"、哪些是"创意风险"
5. 生成交互式 HTML 预览页面（真实产品页面，不是色板）
6. 输出 `DESIGN.md` 到仓库根目录

### /design-shotgun — 设计探索器

"给我看看选项。"

1. 描述你想要什么
2. 生成 4-6 种 AI 设计变体
3. 在浏览器中打开对比面板
4. 收集你的反馈
5. 迭代下一轮

**品味记忆：** 记录你的偏好，逐轮衰退（5%/周），让系统学习你真正喜欢什么。

### /design-html — 设计工程师

将设计稿转为可交付的生产级 HTML/CSS。

- 使用 Pretext 计算文本布局：文本随窗口自动重排、高度自适应
- 检测框架（React/Svelte/Vue），输出正确格式
- 智能 API 路由：落地页、仪表盘、表单、卡片使用不同模式
- 输出是可交付的，不是演示品

---

## 阶段四：Review（审查）

### /review — Staff 工程师

找到那些能通过 CI 但会在生产环境爆炸的 bug。

- 自动修复明显问题
- 标记需要人工确认的（ASK 项）
- 检测：边界违例、条件副作用、状态泄漏、不完整的错误处理

### /design-review — 设计师（会写代码）

对已上线的网站做 80 项视觉审计 + 修复循环：

1. 运行完整的视觉审计
2. 每发现一个问题 → 定位源码 → 做最小改动 → 提交 → 重新截图验证
3. 每次修复一个独立的原子提交
4. 附带 before/after 截图
5. 硬上限 30 个修复

**安全策略：** 纯 CSS 改动自动放行，改组件 JSX/TSX 计入风险预算。超过 20% 风险评分则停下来询问。

### /devex-review — 开发者体验实测

实机开发者体验审计。真的去走你的 onboarding 流程：

- 浏览文档
- 尝试 getting started 流程
- 计时 TTHW（Time To Hello World）
- 发现文档与实际不符的地方
- 截图错误页面

### /health — 代码质量仪表板

集成了类型检查器、linter、测试运行器、死代码检测，计算加权综合得分（0-10），追踪趋势变化。

---

## 阶段五：Test（测试）

### /qa — QA 主管

在真实浏览器中测试你的应用，找到 bug，修复它们。

1. 使用 Chromium 打开你的页面
2. 点击交互流程
3. 发现 bug
4. 修复源码，原子提交
5. 生成回归测试
6. 重新验证修复

每个修复自动生成回归测试，确保不会再次出现。

### /qa-only — QA 报告员

和 /qa 一样的方法论，但只生成报告——不修改代码。输出结构化的 bug 报告：健康评分、截图、复现步骤。

### /browse — QA 工程师

为 AI 代理装上"眼睛"。真实的 Chromium 浏览器，真实的点击，真实的截图。约 100ms 一条命令。

操作包括：导航、点击、填写表单、截图、悬停、滚动、拖拽、处理弹窗、diff 对比。

### /scrape — 浏览器数据提取器

从网页提取数据。首次调用通过 `$B` 命令做原型，后续同意图的调用在 ~200ms 内运行已经固化的浏览器技能。

### /benchmark — 性能工程师

建立页面加载时间、Core Web Vitals、资源大小的基线。在每次 PR 上做前后对比，追踪趋势。

### /benchmark-models — 跨模型基准

并排运行 Claude、GPT（通过 Codex CLI）、Gemini 进行同一技能的对比——延迟、Token 数、成本对比。

---

## 阶段六：Debug（调试）

### /investigate — 调试器

系统性根因调试。铁律：**不查明根源就不修复。**

1. 复现问题
2. 分析数据流
3. 提出假设
4. 实施修复
5. 验证

连续 3 次修复失败后自动停止，转完整报告。

### /freeze — 编辑锁

将所有文件编辑限制在单个目录。写操作超出范围会被阻止。调试时防止意外修改不该改的代码。

### /careful — 安全护栏

在破坏性命令（rm -rf、DROP TABLE、force-push、git reset --hard）前发出警告。常用构建清理命令已加入白名单。

### /guard — 全防护

组合 `/careful` + `/freeze` 为一个命令。

### /unfreeze — 解锁

解除 `/freeze` 的编辑限制。

---

## 阶段七：Ship（发布）

### /ship — 发布工程师

从代码到 PR 的一键流程：

1. 检测并合并基础分支
2. 运行测试
3. 审查差异
4. 更新版本号（VERSION 文件）
5. 更新 CHANGELOG
6. 拆分提交（每个逻辑变更一个提交）
7. 推送
8. 创建 PR

如果项目没有测试框架，会自动搭建一个。每次 `/ship` 都会做覆盖率审计。

### /land-and-deploy — 发布工程师

从"已批准"到"已在生产中验证"：

1. 合入 PR
2. 等待 CI 完成
3. 部署
4. 通过 canary 检查验证生产环境健康

### /canary — SRE

部署后监控循环。使用浏览器守护进程监控：

- 控制台错误
- 性能退化
- 页面异常

---

## 阶段八：Reflect（复盘）

### /retro — 每周回顾

团队感知的每周复盘。包含：

- 每人产出分解
- 交付连续记录
- 测试健康趋势
- 代码质量趋势
- 增长机会

支持 `/retro global` 跨项目运行。

### /document-release — 技术写作

读取项目中所有文档文件，与差异交叉比对，自动更新所有漂移的内容：

- README
- ARCHITECTURE 文档
- CONTRIBUTING 指南
- CLAUDE.md / 项目规范
- TODO 列表

构建 Diataxis 覆盖地图（参考/教程/解释/指南），差距一目了然。

### /document-generate — 文档作者

使用 Diataxis 框架（教程/操作指南/参考/解释说明）从代码生成缺失文档。先研究代码库，再写出与代码真实匹配的文档。

### /learn — 记忆管理

管理 gstack 跨会话学习到的内容。查看、搜索、裁剪、导出项目特定的模式、陷阱和偏好。学习内容跨会话叠加，gstack 越用越了解你的代码库。

---

## 阶段九：Security（安全）

### /cso — 首席安全官

OWASP Top 10 + STRIDE 威胁建模安全审计。扫描：

- 注入攻击（SQL、命令、XSS）
- 认证和授权漏洞
- 加密和密钥管理
- 访问控制
- 依赖供应链安全
- CI/CD 流水线安全
- LLM/AI 安全

**特点：**
- 17 个误报排除规则
- 8/10 以上置信度门限
- 独立发现验证
- 每个漏洞包含具体可利用场景

---

## 阶段十：Multi-AI（多 AI 协作）

### /pair-agent — 多 AI 代理协调

让不同的 AI 代理协作查看同一个页面。Claude Code 中执行，输出另一代理可执行的指令块。支持 OpenClaw、Codex、Cursor、Hermes 等。

### /setup-gbrain — 记忆同步

设置 gbrain 实现跨机器会话记忆同步。一条命令从零到运行：

- 本地 PGLite
- Supabase 已有项目
- 自动新建 Supabase 项目
- 注册 MCP
- 配置每仓库信任策略

### /sync-gbrain — 保持大脑更新

刷新 gbrain 中当前仓库的代码索引。更新 CLAUDE.md 中的搜索指引。安全可重复执行。

---

## 阶段十一：Browser（浏览器）

### /open-gstack-browser — GStack 浏览器

启动 GStack Browser：

- 可视化浏览器窗口，侧边栏
- 反爬虫隐身模式（Google、NYTimes 等正常工作）
- 自动模型路由（Sonnet 做操作、Opus 做分析）
- 一键 Cookie 导入
- 侧边栏 AI 助手（自然语言操作浏览器）
- 提示注入防御（多层 ML 分类器）

### /connect-chrome — 连接浏览器

启动可视化浏览器窗口，可以实时观看每个操作。

### /setup-browser-cookies — Cookie 导入

导入真实浏览器（Chrome、Arc、Brave、Edge）的 cookie 到头less 会话。交互式选择器界面，可以选择导入哪些域名的 cookies。用于测试需要登录的页面。

---

## 阶段十二：Utility（工具）

### /gstack-upgrade — 自更新

升级 gstack 到最新版本。自动检测全局安装 vs 仓库内安装，同步两者，显示变更内容。

### /setup-deploy — 部署配置

一次性配置 `/land-and-deploy`。自动检测平台（Fly.io、Render、Vercel、Netlify、Heroku、GitHub Actions 等）、生产 URL 和部署命令。

### /context-save — 保存状态

保存当前工作上下文（git 状态、决策记录、剩余工作），让任何未来会话可以无缝接续。

### /context-restore — 恢复状态

从保存的上下文恢复，即使跨工作区切换。

### /skillify — 技能编码

回退到对话历史，找到上一次 `/scrape` 的原型，将其综合为脚本 + 测试 + fixture。未来的 `/scrape` 同意图调用 ~200ms 完成。

### /make-pdf — PDF 生成器

将 Markdown 文件转为出版级 PDF：正确页边距、页号、封面、可点击目录、智能分页。

### /landing-report — 发布队列仪表板

工作区感知的发布队列快照。查看哪些版本槽被占用、哪些并行工作区有 WIP。

---

## 典型工作流示例

### 完整功能开发

```
你描述需求 → /office-hours（重新定义问题）
     → /autoplan（一键审查）
     → 实现代码
     → /review（代码审查）
     → /qa（浏览器测试）
     → /ship（创建 PR）
     → /land-and-deploy（合并部署）
     → /document-release（文档更新）
```

### 纯设计流程

```
/design-consultation（建立设计系统）
  → /design-shotgun（探索设计变体）
  → 批准方向
  → /design-html（生成 HTML）
  → /design-review（上线后视觉审计）
```

### 紧急排查

```
/investigate（根因分析）
  → /freeze（锁定编辑范围）
  → 修复 bug
  → /unfreeze
  → /qa（验证修复）
```

---

## 安装与更新

gstack 安装在全局路径 `~/.cursor/skills/gstack/`。

```bash
# 更新到最新版本
cd ~/.cursor/skills/gstack && git pull && ./setup
# 或通过技能自更新
gstack-upgrade
```

---

> 原文链接：https://github.com/garrytan/gstack
> 许可证：MIT