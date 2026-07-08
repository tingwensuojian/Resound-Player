# CodeGraph 代码知识图谱使用说明

## 概述

CodeGraph 是一个基于 Tree-sitter 的代码知识图谱工具。它将项目源码解析为符号（函数、类、方法、接口等）和关系（调用、导入、继承等），存入本地 SQLite 数据库，通过 MCP 协议向 AI agent 提供结构化的代码查询能力。

对 Resound-Player 项目而言，你可以在 Cursor 的 AI 对话中直接使用 `codegraph_*` 工具，无需手动 grep/glob/Read 文件。

## 安装状态

- 安装方式：`npm install -g @colbymchenry/codegraph`（全局安装）
- 当前版本：0.7.9
- 索引状态：已初始化（3,060 节点，6,915 边，140 文件）
- 存储引擎：native SQLite（最快路径）
- MCP 配置：已写入 `~/.cursor/mcp.json`

## 文档索引

- [CLI 命令参考](#cli-命令参考)
- [MCP 工具参考](#mcp-工具参考)
- [日常使用场景](#日常使用场景)
- [索引维护](#索引维护)
- [故障排查](#故障排查)

---

## CLI 命令参考

### 基础命令

| 命令 | 用途 | 示例 |
|---|---|---|
| `codegraph init -i` | 初始化项目并建立索引 | `codegraph init -i` |
| `codegraph index` | 全量索引（--force 强制重建） | `codegraph index --force` |
| `codegraph sync` | 增量更新 | `codegraph sync` |
| `codegraph status` | 查看索引状态 | `codegraph status` |
| `codegraph serve --mcp` | 启动 MCP 服务器 | 由 Cursor 自动拉起，一般无需手动执行 |

### 查询命令

| 命令 | 用途 | 示例 |
|---|---|---|
| `codegraph query <关键词>` | 搜索符号 | `codegraph query playerStore` |
| `codegraph context <任务描述>` | 为 AI 任务构建上下文 | `codegraph context "fix login bug"` |
| `codegraph files` | 显示文件结构 | `codegraph files --json` |
| `codegraph affected <文件>` | 找出受影响的测试文件 | `codegraph affected src/stores/player.ts` |

### 配置命令

| 命令 | 用途 |
|---|---|
| `codegraph install` | 运行交互式安装器 |
| `codegraph init [path]` | 在项目中初始化 |
| `codegraph uninit [path]` | 移除 CodeGraph |
| `codegraph clean` | 删除当前索引 |
| `codegraph clean --all --force` | 删除所有索引 |

---

## MCP 工具参考

MCP（Model Context Protocol）工具可以在 Cursor 的 AI 对话中直接使用。

### 探索类工具

#### `codegraph_search`
- **用途**：按名称跨代码库搜索符号
- **适合**：查找函数定义、类定义、变量定义
- **示例**：`codegraph_search("playerStore")` → 返回 `playerStore` 的所有定义位置

#### `codegraph_context`
- **用途**：为给定任务构建相关代码上下文
- **适合**：需要全局了解某个功能区域时
- **注意**：返回内容较多，只用于探索 agent，不要在主会话中调用

#### `codegraph_files`
- **用途**：获取已索引的文件结构
- **适合**：快速了解目录结构，比文件系统扫描更快

### 调用链工具

#### `codegraph_callers`
- **用途**：查找谁调用了某个函数
- **适合**：改函数前先确认调用方

#### `codegraph_callees`
- **用途**：查找某个函数调用了什么
- **适合**：理解函数内部依赖

#### `codegraph_impact`
- **用途**：分析修改某个符号会影响哪些代码
- **适合**：改代码前做影响范围评估

### 信息查询工具

#### `codegraph_node`
- **用途**：获取单个符号的详细信息（签名、源码、文档注释）
- **适合**：快速查看某个函数/类的源码

#### `codegraph_status`
- **用途**：检查索引健康状态和统计信息
- **适合**：怀疑索引过期或损坏时使用

---

## 日常使用场景

### 场景 1：查找符号定义

**旧方式**：目测 + grep 猜测文件名 → Read 文件 → 确认位置

**使用 CodeGraph**：

直接搜索：
```
codegraph_search("useBgLoaded")
```

一次调用返回精确位置、签名和所在文件。不需要 grep。

### 场景 2：改代码前评估影响

假设要修改 `playerStore.ts` 中的 `play()` 方法：

```
codegraph_impact("play", "src/stores/player.ts")
```

返回所有调用 `play()` 的地方、依赖它的组件和函数、影响范围深度分组 + 置信度评分。

### 场景 3：追踪调用链

```
codegraph_callers("play")
→ 返回：PlayerBar.vue → PlayerExpanded.vue → ... 
```

### 场景 4：理解一个不熟悉的模块

如果你的 AI agent 支持 spawn 子 agent（如 Claude Code 的 Task），在子 agent 中：

```
codegraph_context("understand how lyrics rendering works")
```

它会返回歌词渲染相关的所有符号、文件和关系。

---

## 索引维护

### 自动同步

CodeGraph MCP 服务器通过操作系统原生文件事件（macOS 上为 FSEvents）监听文件变更：

- 检测到文件修改后，等待 2 秒安静期（debounce）
- 只对有变更的源码文件做增量更新
- 索引始终与磁盘文件保持同步

**正常开发流程中不需要手动干预。**

### 手动维护

```bash
# 查看当前索引状态
codegraph status

# 强制重建全量索引（如发现索引异常）
codegraph index --force

# 手动增量同步
codegraph sync
```

### 什么情况下需要重建索引

- 修改了 `.codegraph/config.json` 配置
- 索引文件损坏（`codegraph status` 报错）
- 新增了大量文件，自动同步未覆盖

---

## 故障排查

### "CodeGraph not initialized"

当前目录没有 `.codegraph/` 目录。运行：

```bash
codegraph init -i
```

### MCP 服务器未连接

1. 检查 `~/.cursor/mcp.json` 中是否包含 `codegraph` 配置
2. 确认 `codegraph serve --mcp` 能在命令行正常运行
3. 重启 Cursor

### 索引过期

修改代码后，自动同步有约 2 秒延迟。等待几秒再查询，或手动运行：

```bash
codegraph sync
```

### native SQLite 回退到 WASM

```bash
codegraph status
```

如果显示 `Backend: wasm` 而非 `Backend: native`，表示原生模块未正确编译，查询速度会慢 5-10 倍。修复：

```bash
npm rebuild better-sqlite3
```