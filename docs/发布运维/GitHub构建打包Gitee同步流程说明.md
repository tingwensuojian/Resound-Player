# GitHub 构建打包 → Gitee Release 同步流程说明

> 最后更新：2026-07-06
>
> 本文档完整记录了 Resound-Player 项目中将 GitHub Releases 同步到 Gitee Releases 的全部工作，包括：架构设计、Workflow 文件详解、每一步修改的原因与根因分析、release2gitee 工具源码分析、已知限制、后续待办。

---

## 一、整体架构

### 1.1 数据流

```
开发者推送 tag (v*) 或手动触发 workflow_dispatch
    │
    ▼
GitHub Actions (windows-latest)
    │
    ├── Step 1: 构建安装包
    │     ├── npm run dist:win        → NSIS 安装包 (Setup.exe ~130MB)
    │     └── npm run dist:win:portable → 便携版 (Portable.exe ~115MB)
    │
    ├── Step 2: Upload to Release
    │     └── 用 gh CLI 上传所有构件到 GitHub Release
    │
    ├── Step 3: Sync to Gitee Release (via release2gitee)
    │     ├── 从 GitHub API 获取最新 N 个 Release
    │     ├── 在 Gitee 上创建缺失的 Release
    │     ├── 上传小文件 (latest.yml 等) 到 Gitee
    │     └── 清理 Gitee 旧版附件
    │
    └── Step 4: Upload missing assets to Gitee (curl retry)
          └── 用 curl 补传 Step 3 可能遗漏的大文件
```

### 1.2 涉及的文件

| 文件 | 角色 |
|---|---|
| `.github/workflows/build-win.yml` | Windows 构建 + Release 上传 + Gitee 同步（主 Workflow） |
| `.github/workflows/build-mac.yml` | macOS 构建 + Release 上传 |
| `.github/workflows/sync-gitee.yml` | 代码同步（git push 到 Gitee） |
| `docs/GitHub构建打包Gitee同步流程说明.md` | **本文档** |

### 1.3 前置条件

| 条件 | 说明 |
|---|---|
| GitHub Secrets: GITEE_TOKEN | Gitee 个人访问令牌（需有 releases 写入权限） |
| Gitee 仓库 | 从 GitHub 导入，确保默认分支与 GitHub 一致（均为 main） |
| 双方仓库名一致 | `tingwensuojian/Resound-Player` |

---

## 二、Workflow 文件详解

### 2.1 sync-gitee.yml（代码同步）

**位置**：`.github/workflows/sync-gitee.yml`

专用于代码同步，不处理 Release 附件。每次 push main 或打 tag 时强制推送。

```yaml
- run: |
    git remote add gitee https://tingwensuojian:${{ secrets.GITEE_TOKEN }}@gitee.com/tingwensuojian/Resound-Player.git
    git push -f gitee HEAD:main
    git push -f gitee --tags
```

要点：
- `fetch-depth: 0` 确保全量历史推送
- 同时推送分支和 tags
- 使用 HTTPS + Token 认证

### 2.2 build-win.yml（构建 + Release 上传 + Gitee 同步）

**位置**：`.github/workflows/build-win.yml`

#### 触发器

| 事件 | 触发方式 | 说明 |
|---|---|---|
| `push tags: v*` | 自动 | 推送 v 开头的 tag 时触发 |
| `workflow_dispatch`（手动） | 手动 | 需传入 release_tag 参数 |

#### 构建步骤（Step 1-4）

1. `npm run dist:win` → NSIS 安装包
2. 备份安装包文件
3. `npm run dist:win:portable` → 便携版
4. 恢复备份

便携版构建会覆盖 dist-build/，因此备份和恢复是必需的。

#### 上传到 GitHub Release

```bash
TAG="${GITHUB_REF_NAME}"
if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
  TAG="${{ inputs.release_tag }}"
fi
gh release view "${TAG}" >/dev/null 2>&1 || \
  gh release create "${TAG}" --target "${GITHUB_SHA}" --title "Resound-Player ${TAG}"
gh release upload "${TAG}" dist-build/*.exe dist-build/*.blockmap dist-build/latest.yml --clobber
```

**⚠️ 修复记录**：`workflow_dispatch` 下 `GITHUB_REF_NAME` 是分支名 `main` 而非 tag 名。必须用 `inputs.release_tag`。

#### release2gitee 同步步骤

```powershell
$env:GITHUB_OWNER = "tingwensuojian"
$env:GITHUB_REPO = "Resound-Player"
$env:GITEE_OWNER = "tingwensuojian"
$env:GITEE_REPO = "Resound-Player"
$env:release2gitee__github_latest_release_count = "5"
$env:release2gitee__gitee_retain_release_attach_files_count = "1"
$env:release2gitee__release_body_url_replace = "false"
$env:release2gitee__latest_json_url_replace = "false"
.\release2gitee.exe
```

**关键配置说明**：

| 参数 | 值 | 含义 |
|---|---|---|
| `github_latest_release_count` | 5 | 从 GitHub 获取最新 5 个 Release |
| `gitee_retain_release_attach_files_count` | 1 | Gitee 只保留最新 1 个版本的附件（避免跨海传输过多大文件） |
| `release_body_url_replace` | false | 不替换 Release 正文中的 GitHub URL（因为 .exe 不在 Gitee 上） |
| `latest_json_url_replace` | false | 不替换 latest.yml 中的下载 URL（同上） |

**⚠️ 之前写死 `gitee_branch = "master"` 是错误的**。Gitee 仓库实际默认分支是 `main`（已验证），写死 `master` 会导致 Gitee API 拒绝创建 Release。已删除该配置，由工具自动检测。

#### curl 补传步骤

release2gitee 的 HTTP 客户端有 60s 硬编码超时，大文件上传必超时。此步骤用 curl 补传。

逻辑：
1. 查询 Gitee Release ID
2. 对比已上传文件列表，只传缺失的
3. 优先级：Setup.exe（最重要）→ .blockmap → latest.yml

```powershell
curl.exe -s --connect-timeout 30 -X POST "$uploadUrl" `
  -H "Authorization: token $env:GITEE_TOKEN" `
  -F "file=@$($file.Path)" `
  -w "`nHTTP_CODE:%{http_code}"
```

**⚠️ 注意**：curl 不加 `--fail` 时，HTTP 4xx/5xx 仍返回退出码 0。

---

## 三、release2gitee 工具分析

### 3.1 基本信息

| 属性 | 值 |
|---|---|
| 仓库 | [hepengju/release2gitee](https://github.com/hepengju/release2gitee) |
| 语言 | Rust（reqwest HTTP 客户端） |
| 版本 | v1.2.1 |
| 体积 | ~6MB |
| 跨平台 | Windows / macOS / Linux x86_64 |

### 3.2 核心同步流程

```
sync_github_releases_to_gitee()
    ├── 1. github_releases()         → GET GitHub API：获取最新 N 个 Release
    ├── 2. gitee_releases()          → GET Gitee API：获取所有 Release
    ├── 3. 确定 gitee_branch         → 优先用指定值，否则自动检测
    ├── 4. 排序 + 去重 + 确定白名单  → 哪些 Release 带附件
    ├── 5. clean_oldest_gitee_releases() → 删除旧 Release 附件
    ├── 6. 重新获取 Gitee Releases   → 清理后重新查询
    └── 7. 逐版本同步 (倒序)         → 旧的先同步
          ├── 已存在？→ 跳过
          ├── 要带附件？→ 先下载到临时目录
          ├── gitee_release_create() → POST Gitee API
          └── upload_release_asserts() → POST Gitee API
```

### 3.3 关键源码片段

**HTTP 客户端超时（http.rs）**：
```rust
Client::builder()
    .retry(reqwest::retry::for_host("api.github.com"))
    .timeout(Duration::from_secs(60))   // ⚠️ 硬编码 60s，不可配置
    .build()?;
```

**分支选择（lib.rs）**：
```rust
let default_branch = match &cli.gitee_branch {
    Some(branch) => branch.clone(),      // 指定了就用指定的
    None => gitee_default_branch(...),   // 否则自动检测
};
```

**附件管理策略**：
- 所有 Release 都会同步到 Gitee
- 只有白名单中的 Release 保留附件（最新 N 个）
- 非白名单 Release 的附件会被删除，只保留 2 个源码附件
- 操作幂等：第二次运行不会重复操作

### 3.4 已知限制

1. **HTTP 60s 硬编码超时** — 不可配置，大文件跨海上传必超时
2. **幂等跳过忽略附件缺失** — Release 存在但附件不完整不会重试
3. **无进度反馈** — 只输出 info 级别日志

---

## 四、排坑记录（按修复时间排序）

### 4.1 workflow_dispatch 下 GITHUB_REF_NAME 是分支名而非 Tag

**问题**：手动触发并传入 `release_tag=v9.9.9` 时，脚本用了 `GITHUB_REF_NAME`（值为 `main`）。

**日志**：
```
REF_NAME=main
+ gh release view main
release not found
```

**根因**：`GITHUB_REF_NAME` 在 `workflow_dispatch` 中始终指向**目标分支名**。只有 `push tags:` 触发器下才指向 tag 名。

**修复**：增加 `if` 判断，`workflow_dispatch` 时用 `inputs.release_tag`。

**参考**：`build-mac.yml` 已正确实现该逻辑。

### 4.2 release2gitee gitee_branch 写死 master

**问题**：创建 Gitee Release 时 API 报错。

**根因**：
- 写死 `release2gitee__gitee_branch = "master"`
- Gitee 仓库只有 `main` 分支（已验证）
- release2gitee 源码：指定了 branch 就直接用，不自动检测

**验证**：
```bash
curl -s "https://gitee.com/api/v5/repos/tingwensuojian/Resound-Player"
# → "default_branch":"main"
curl -s "https://gitee.com/api/v5/repos/tingwensuojian/Resound-Player/branches"
# → [{"name":"main"}]
```

**修复**：删除该配置行，让工具自动检测。

### 4.3 Bash 引号缺失

**问题**：`echo "upload exit: $?` 缺少闭合引号，导致 bash 语法错误。

**修复**：补上 `"`。

### 4.4 大文件跨海上传超时

**问题**：115-130MB 的 .exe 上传到 Gitee 始终 60s 超时。

**根因**：
- release2gitee HTTP 客户端 60s 硬编码超时
- GitHub US Runner → Gitee 中国服务器速度 ~100KB/s
- 130MB 需要约 22 分钟

**尝试过的方案**：

| 方案 | 效果 |
|---|---|
| `--max-time 600`（10 分钟） | ❌ 临界超时 |
| `--max-time 1200`（20 分钟） | ❌ 几乎够但还差一点 |
| 去掉 `--max-time`（无限时） | ❌ Workflow 60 分钟总超时被打断 |
| Start-Job 并行上传 | ❌ 文件重复浪费超时 |
| 只传 Setup.exe（跳过 portable） | ❌ Gitee 100MB 限制 |
| 只传 .blockmap + latest.yml | ✅ 已完成 |

### 4.5 文件列表重复

**问题**：`*Setup*.exe` 和 `*.exe` 同时匹配 Setup.exe，被上传两次。

**修复**：改用按类逐个添加 + `Sort-Object Name -Unique` 去重。

### 4.6 Gitee 100MB 单文件限制

**问题**：Setup.exe (~130MB) 上传返回 HTTP 400。

**根因**：Gitee 免费版 Release 附件单文件 ≤ 100MB。

| 文件 | 大小 | 状态 |
|---|---|---|
| Setup.exe | ~130MB | ❌ 超限 |
| Portable.exe | ~115MB | ❌ 超限 |
| .blockmap | ~135KB | ✅ 已上传 |
| latest.yml | ~357B | ✅ 已上传 |

### 4.7 curl 不识别 HTTP 4xx

**问题**：HTTP 400 时脚本仍输出 "Uploaded"。

**根因**：curl 默认不将 HTTP 4xx/5xx 视为错误。

**修复方向**：加 `--fail` 参数。

---

## 五、已知限制汇总

| 类别 | 限制 | 影响 |
|---|---|---|
| **平台** | Gitee 100MB 附件限制 | .exe 文件无法上传到 Gitee |
| **平台** | GitHub Runner 位于美国 | 上传到 Gitee 速度 ~100KB/s |
| **平台** | Workflow 60 分钟超时 | 构建 + 大文件上传时间不够 |
| **工具** | release2gitee 60s 硬编码超时 | 大文件上传必超时 |
| **工具** | 幂等跳过忽略附件缺失 | Release 不完整时不会重试 |
| **脚本** | curl 未加 --fail | HTTP 4xx 无法被正确识别 |

---

## 六、后续待办

### 方案 A（推荐）：分开构建和同步

创建独立的 Gitee 同步 Workflow，脱离构建流程：
- 由 `release: published` 事件或 `workflow_dispatch` 触发
- 可考虑国内自建 Runner
- 不受 60 分钟构建超时限制
- 可手动重试失败步骤

### 方案 B：解决 100MB 限制

短期：
- electron-builder `compression: "maximum"` 减小体积
- 移除不必要的 native modules

长期：
- Gitee 企业版（更高文件限制）
- 或放弃 Gitee 附件，用户从 GitHub 下载

### 方案 C：Gitee 仅做元数据源

配置 `gitee_retain_release_attach_files_count: 0`：
- Gitee 只保留 Release 元数据
- latest.yml 指向 GitHub 下载地址
- 已有 Gitee fallback 机制（commit a716f361）

### 小改进

- curl 加 `--fail`：`curl.exe -s --fail --connect-timeout 30 ...`
- 增加 HTTP 状态码数值判断
- release2gitee 升级到新版本（如果作者修复了超时问题）

---

## 七、调试命令与 API 参考

### 7.1 Gitee API

```bash
# 获取 Release 列表
curl -s "https://gitee.com/api/v5/repos/tingwensuojian/Resound-Player/releases?per_page=5" \
  -H "Authorization: token $GITEE_TOKEN"

# 获取仓库默认分支
curl -s "https://gitee.com/api/v5/repos/tingwensuojian/Resound-Player" \
  -H "Authorization: token $GITEE_TOKEN" | python -c "import sys,json; print(json.load(sys.stdin)['default_branch'])"

# 上传附件
curl -s -X POST "https://gitee.com/api/v5/repos/tingwensuojian/Resound-Player/releases/{id}/attach_files" \
  -H "Authorization: token $GITEE_TOKEN" \
  -F "file=@/path/to/file.exe"
```

### 7.2 GitHub API

```bash
# 获取 Workflow 运行状态
curl -s "https://api.github.com/repos/tingwensuojian/Resound-Player/actions/workflows/build-win.yml/runs?per_page=3" \
  -H "Authorization: Bearer $GITHUB_TOKEN"

# 触发 Workflow
curl -sL -X POST "https://api.github.com/repos/tingwensuojian/Resound-Player/actions/workflows/build-win.yml/dispatches" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ref":"main","inputs":{"release_tag":"v9.9.9"}}'
```

---

## 八、提交记录一览

### 8.1 同步架构建立阶段

| 提交 | 说明 |
|---|---|
| `01f313da` | ci: add Gitee sync workflow（初始代码同步） |
| `a716f361` | feat: add Gitee fallback for auto-update（前端更新回退） |
| `bffbe538` | ci: 用 release2gitee 替换内联 Gitee Release 同步脚本 |
| `da85f52c` | fix: Windows Upload to Release 改用 bash + gh CLI（与 Mac 一致） |
| `1c585a39` | fix: 修复 YAML 换行符丢失导致 workflow 不加载 |

### 8.2 修复问题阶段（2026-07-05）

| 提交 | 说明 |
|---|---|
| `f6af9775` | 修复 gitee_branch 写死 master（应为 main）+ 修复引号缺失 |
| `e5195aaf` | 修复 Upload to Release TAG 逻辑（workflow_dispatch 处理） |
| `10c7e418` | 减少 Gitee 保留附件版本数为 1 |
| `aec7c416` | 添加 curl 补传步骤（--max-time 600s） |
| `5e55eba0` | 增加超时到 1200s + 去重文件列表 |
| `74bff7d1` | 去掉 --max-time限制，不限时上传 |
| `dd1fda80` | 只上传 Setup.exe（最重要），跳过 portable.exe |

### 8.3 其他相关提交

| 提交 | 说明 |
|---|---|
| `62d59e60` | Gitee API 缺 Accept: application/json header |
| `2439243d` | sync-gitee detached HEAD 问题 |
| `4f0b27ce` | 更新检查并发保护（_updaterBusy / _giteeBusy） |
| `75fcd9d4` | Windows 反引号转义问题 |

---

## 九、Gitee Fallback 自动更新机制（electron/updater.js）

### 9.1 概述

当 GitHub 自动更新（electron-updater）因网络问题超时或失败时，自动回退到 Gitee 检查更新并下载。

**触发条件**：
- `checkForUpdates()` 调用 `autoUpdater.checkForUpdates()` 15 秒超时
- `checkForUpdates()` 调用 `autoUpdater.checkForUpdates()` 失败（catch）

### 9.2 架构

```
checkForUpdates()
    │
    ├── autoUpdater.checkForUpdates()  ── 正常 GitHub 更新检查
    │     ├── 超时 (15s) → _runGiteeFallback()
    │     └── 失败 (catch) → _runGiteeFallback()
    │
    └── _runGiteeFallback()
          └── doGiteeCheck()
                ├── checkGiteeRelease()   → GET Gitee API 获取最新 Release
                ├── 有新版本？→ 更新状态为 AVAILABLE
                └── giteeDownload()       → HTTPS 下载安装包
                      └── 完成 → 更新状态为 DOWNLOADED
```

### 9.3 关键函数

#### checkGiteeRelease()

```javascript
async function checkGiteeRelease() {
  const url = "https://gitee.com/api/v5/repos/" + GITEE_OWNER + "/" + GITEE_REPO + "/releases/latest";
  const rel = await httpsGet(url);
  const ver = rel.tag_name.replace(/^v/, "");
  const cur = app.getVersion();
  const cmp = ver.localeCompare(cur, undefined, { numeric: true });
  if (cmp <= 0) return null;
  // 构造下载 URL：Gitee 上的文件路径
  return { version: ver, tag: rel.tag_name, downloadUrl: GITEE_DL + "/" + rel.tag_name + "/" + fname, ... };
}
```

- 调用 Gitee API `/releases/latest` 获取最新 Release 信息
- 解析版本号并与当前版本比较
- 支持 macOS（DMG/ZIP）和 Windows（exe）
- 需要 Gitee 上已存在该版本的 Release 和附件

#### giteeDownload(url, dest)

```javascript
function giteeDownload(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": "Resound-Player/1.0" } }, (res) => {
      const total = parseInt(res.headers["content-length"] || "0", 10);
      res.on("data", (chunk) => { /* 写文件 + 进度回调 */ });
      res.on("end", () => { file.close(); resolve(dest); });
    });
  });
}
```

- 纯 Node.js HTTPS 下载，无外部依赖
- 实时计算下载进度（百分比 + 速度）
- 下载到系统临时目录 `resound-gitee-update/`

#### _runGiteeFallback()

```javascript
function _runGiteeFallback() {
  if (_giteeBusy) return;       // 并发保护
  _giteeBusy = true;
  doGiteeCheck().finally(() => {
    _giteeBusy = false;
    _updaterBusy = false;       // 释放主检查锁
  });
}
```

#### doGiteeCheck()

编排完整流程：
1. `checkGiteeRelease()` → 检查 Gitee 是否有新版本
2. 有更新 → 更新 UI 状态为 `AVAILABLE`，触发广播
3. 自动开始下载 → `giteeDownload()`
4. 下载完成 → 更新 UI 状态为 `DOWNLOADED`，用户可安装
5. 无更新或失败 → 更新 UI 状态为 `NOT_AVAILABLE` 或 `ERROR`

### 9.4 并发保护

```javascript
let _updaterBusy = false;   // 主检查锁（防止重复调用 checkForUpdates）
let _giteeBusy = false;     // Gitee 锁（防止重复调用 Gitee fallback）
```

- `checkForUpdates()` 入口检查 `_updaterBusy`
- `_runGiteeFallback()` 检查 `_giteeBusy`
- `downloadUpdate()` 检查 `_updaterBusy && DOWNLOADING` 状态
- `doGiteeCheck().finally()` 释放两把锁

### 9.5 状态流转

```
IDLE → CHECKING → (超时/失败) → AVAILABLE → DOWNLOADING → DOWNLOADED → (用户安装)
                → NOT_AVAILABLE → IDLE
                → ERROR → IDLE
```

### 9.6 与 CI/CD 的关系

Gitee fallback 依赖 CI/CD 创建的 Gitee Release 附件：
- `checkGiteeRelease()` 需要 Release 元数据 → 由 release2gitee 创建 ✅
- `giteeDownload()` 需要 .exe 文件 → 受 Gitee 100MB 限制 ❌（见 4.6）

如果 Gitee 上缺少 .exe 文件，fallback 会找到新版本但下载失败。

---

## 十、版本号记录

自 v1.2.3 以来的版本变更：

| 文件 | 旧版本 | 新版本 |
|---|---|---|
| `package.json` | 1.2.3 | 9.9.9 |
| `electron/package.json` | 1.2.3 | 9.9.9 |

版本号变更在 commit `1d94520f`（v9.9.9）中提交。9.9.9 为测试版本号，后续正式发布时应改为语义化版本号。
