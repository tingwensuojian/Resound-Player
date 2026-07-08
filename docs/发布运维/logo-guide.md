# Resound-Player Logo 管理指南

## 1. Logo 设计概述

Resound-Player 的品牌 Logo 是一个**绿色系耳机图标**：

- **耳机头梁**：圆弧描边，象征音乐聆听
- **耳机罩**：两个圆角矩形，左右对称
- **右罩音孔**：小圆点细节，增加质感
- **配色**：绿色渐变 `#22c55e → #16a34a`

## 2. 源 SVG

项目所有 Logo 变体均派生自同一个 SVG 源：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="100%" stop-color="#16a34a"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="200" height="200" rx="44" fill="#121317"/>
  <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#g)" stroke-width="16" stroke-linecap="round"/>
  <rect x="40" y="100" width="30" height="45" rx="12" fill="url(#g)"/>
  <rect x="130" y="100" width="30" height="45" rx="12" fill="url(#g)"/>
  <circle cx="145" cy="122.5" r="5" fill="#121317" opacity="0.8"/>
</svg>
```

### 源版（完整版，含深色背景）

用于 `public/favicon.svg`、侧边栏头像、设置页 Logo，包含深色圆角矩形背景。

### 紧凑版（裁剪 viewBox，用于组件内显示）

```svg
viewBox="30 30 140 140"
```

裁剪掉原始 200×200 画布四周空白，让耳机图标占据更大比例。

### 纯绿版（无深色背景 rect，用于封面占位）

```svg
<!-- 省略 <rect>，保留 defs + 耳机路径 + 小圆点用 currentColor -->
```

| 文件 | 用途 |
|---|---|
| `public/favicon.svg` | Web 浏览器 favicon |
| `build/icon.png` (512px) | Electron 桌面应用图标（通用源图） |
| `build/icon.ico` | Windows 桌面图标（16–256px 多尺寸） |
| `build/icon.icns` | macOS 桌面图标 |
| `electron/main.js` | Electron BrowserWindow 图标引用 |

## 3. 组件内内联 SVG Logo 位置

| 组件 | CSS 类名 | 版本 | 说明 |
|---|---|---|---|
| `Sidebar.vue` | `.user-avatar-logo` | 含背景 rect | 侧边栏头像 |
| `SettingsPage.vue` | `.settings-logo` | 含背景 rect | 设置页关于区域 |
| `PlayerBar.vue` | `.cover-logo` | 纯绿版 | 底部播放栏封面占位（无歌曲时） |
| `PlayerExpanded.vue` | `.album-cover-logo` | 纯绿版 | 展开播放器封面占位（无歌曲时） |

### 3.1 组件内 SVG 路径（耳机版）

所有组件内嵌的耳机 SVG 路径保持一致：

```svg
<path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#logoGradX)" stroke-width="16" stroke-linecap="round" />
<rect x="40" y="100" width="30" height="45" rx="12" fill="url(#logoGradX)" />
<rect x="130" y="100" width="30" height="45" rx="12" fill="url(#logoGradX)" />
<circle cx="145" cy="122.5" r="5" fill="#121317" opacity="0.8" />
```

纯绿版将 `<circle>` 的 `fill` 改为 `currentColor`、`opacity="0.3"`。

**纯绿版**用于封面占位场景，通过 `fade-in-bg` + `bg-loaded` 机制控制显示隐藏：
- 无歌曲时显示绿色 Logo
- 有歌曲封面时自动隐藏 Logo

## 4. 桌面端 Build Icons 生成

### 4.1 环境要求

- macOS（使用 `qlmanage` + `sips` + `iconutil` 等系统内置工具）
- Node.js（运行 `scripts/prepare-win-icon.mjs`）

### 4.2 生成命令

```bash
# 1. 从 SVG 生成 1024px PNG 源图（macOS 内置命令）
qlmanage -t -s 1024 -o /tmp public/favicon.svg

# 2. 缩放为 512px 源图
sips -z 512 512 /tmp/favicon.svg.png --out build/icon.png

# 3. 生成 .icns（macOS）
mkdir -p /tmp/resound-player.iconset
for size in 16 32 64 128 256 512; do
  sips -z $size $size build/icon.png --out /tmp/resound-player.iconset/icon_${size}x${size}.png
done
iconutil -c icns -o build/icon.icns /tmp/resound-player.iconset

# 4. 生成 .ico（Windows 构建链）
node scripts/prepare-win-icon.mjs
```

### 4.3 输出文件

```
build/
├── icon.png      # 512×512 PNG（electron-builder 主源图）
├── icon.icns     # macOS 图标（16–512px 多尺寸）
├── icon.ico      # Windows 图标（16–256px 多尺寸）
└── icon-win.ico  # Windows 安装器 / 卸载器图标
```

### 4.4 electron-builder 配置引用

在 `package.json` 的 `build` 字段中已配置：

```json
{
  "build": {
    "icon": "build/icon.png",
    "mac": { "icon": "build/icon.icns" },
    "win": { "icon": "build/icon.ico" }
  }
}
```

### 4.5 Windows 图标实现说明

- Windows `.ico` 优先从高质量 PNG 主源生成，而不是直接从 `public/favicon.svg` 缩放。
- 当前主源优先级为：`build/icon-mac.png` → `public/logo.png` → `build/icon-win.png` → `build/icon.png`。
- `16 / 20 / 24 / 32 / 48` 等小尺寸会额外应用更紧凑的主体缩放和轻量锐化，减少桌面图标发糊、主体偏小的问题。
- 生成脚本会输出 `build/icon-preview-16.png`、`icon-preview-32.png`、`icon-preview-48.png`、`icon-preview-256.png`，方便在提交前做肉眼检查。

## 5. 更新流程

修改 Logo 后按以下步骤同步：

1. 更新 `public/favicon.svg`（SVG 源）
2. 更新各组件中的内联 SVG（保持路径一致）
3. 重新生成 `build/` 下所有图标
4. 更新 `electron/main.js` 中 `BrowserWindow` 的 `icon` 路径（如需要）

## 6. 注意事项

- 组件内 SVG 使用各自独立的 `linearGradient` id（如 `logoGradBar`、`logoGradExp`），避免 scoped CSS 重复冲突
- `viewBox="50 30 140 140"` 是紧凑裁剪版，用于 52×52 等小尺寸容器；`viewBox="0 0 200 200"` 用于大尺寸展示
- 纯绿版 SVG 省略了 `<rect>` 背景，由父容器的 `background-color` 或 `background-image` 兜底
