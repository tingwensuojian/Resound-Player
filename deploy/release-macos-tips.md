> **macOS 安装提示**
> 
> 如果安装后打开 Resound-Player 时看到"已损坏，无法打开"之类的提示，可任选以下一种方式处理：
> 
> **方式 A：终端命令**
> 
> 在终端输入以下命令，按回车键后输入系统密码（不可见）并再次按回车键即可：
> 
> ```
> sudo xattr -r -d com.apple.quarantine /Applications/Resound-Player.app
> ```
> 
> 如果在 macOS 15 及以上版本运行以上命令时报错，请尝试运行下方的替代命令：
> 
> ```
> sudo xattr -d com.apple.quarantine /Applications/Resound-Player.app
> ```
> 
> **方式 B：Sentinel 图形化处理**
> 
> 用户也可以使用 [alienator88/Sentinel](https://github.com/alienator88/Sentinel) 处理隔离属性。打开 Sentinel 后，将 /Applications/Resound-Player.app 拖入解隔离区域即可；如果已经启用它的 Finder 扩展，也可以在 Finder 中右键应用直接执行解隔离。
> 
> 更完整说明见：[macOS 安装已损坏修复说明](https://github.com/tingwensuojian/Resound-Player/blob/main/docs/macOS%20%E5%AE%89%E8%A3%85%E5%B7%B2%E6%8D%9F%E5%9D%8F%E4%BF%AE%E5%A4%8D%E8%AF%B4%E6%98%8E.md)
