# macOS 安装已损坏修复说明

当用户在 macOS 上安装 `Resound-Player` 后，如果打开时看到“已损坏，无法打开”之类的提示，通常是系统给应用保留了 `com.apple.quarantine` 隔离属性。

当前建议提供两种修复方式，由用户自行选择：

- 方式 A：终端命令移除隔离属性
- 方式 B：使用图形工具 `Sentinel` 解隔离

## 适用前提

- 应用已经拖入 `/Applications`
- 应用名称为 `/Applications/Resound-Player.app`
- 操作前建议先完全退出应用

## 方式 A：终端命令修复

在终端中运行下面的命令，按回车后输入系统密码（输入时不会显示），再按一次回车：

```bash
sudo xattr -r -d com.apple.quarantine /Applications/Resound-Player.app
```

如果在 `macOS 15` 及以上版本运行上面的命令时报错，请改用下面的替代命令：

```bash
sudo xattr -d com.apple.quarantine /Applications/Resound-Player.app
```

执行完成后，再次从“应用程序”中打开 `Resound-Player`。

## 方式 B：使用 Sentinel 图形化修复

`Sentinel` 是一个用于控制 Gatekeeper、移除隔离属性和自签名应用的 macOS 图形工具。

项目地址：

- [alienator88/Sentinel](https://github.com/alienator88/Sentinel)

### B1. 下载后拖拽解隔离

适合不想手动输入终端命令的用户：

1. 从 `Sentinel` 的 Release 页面下载安装应用
2. 建议先把 `Sentinel` 自身拖到 `/Applications` 再运行
3. 打开 `Sentinel`
4. 把 `/Applications/Resound-Player.app` 直接拖进它的解隔离区域
5. 解隔离完成后，再重新打开 `Resound-Player`

### B2. 安装 Homebrew 版本

如果用户已经安装 Homebrew，也可以直接安装：

```bash
brew install --cask alienator88-sentinel
```

安装完成后，打开 `Sentinel`，再按上面的拖拽方式处理 `Resound-Player.app`。

### B3. Finder 右键扩展

`Sentinel` 还提供 Finder 右键扩展。用户如果已经在 `Sentinel` 里启用了这个扩展，也可以在 Finder 中对 `Resound-Player.app` 右键，直接执行解隔离操作。

## 推荐对外说明文案

如果用户下载后安装打开提示“已损坏”，可任选以下一种方式处理：

### 方案一：终端命令

在终端窗口输入以下命令，按回车键后输入系统密码（不可见）并再次按回车键即可：

```bash
sudo xattr -r -d com.apple.quarantine /Applications/Resound-Player.app
```

如果在 `macOS 15` 及以上版本运行以上命令时报错，请尝试运行下方的替代命令：

```bash
sudo xattr -d com.apple.quarantine /Applications/Resound-Player.app
```

### 方案二：Sentinel 图形化处理

下载安装 [alienator88/Sentinel](https://github.com/alienator88/Sentinel)，打开后将 `Resound-Player.app` 拖入解隔离区域即可；如果已启用 Finder 扩展，也可以直接右键应用执行解隔离。

## 参考

- Sentinel GitHub 仓库：<https://github.com/alienator88/Sentinel>
- Sentinel Homebrew Cask：<https://formulae.brew.sh/cask/alienator88-sentinel>
