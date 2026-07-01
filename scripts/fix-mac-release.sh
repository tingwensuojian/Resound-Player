#!/bin/bash
# fix-mac-release.sh — 修复已有 macOS Release 的 latest-mac.yml
# 用法: ./scripts/fix-mac-release.sh <release-tag>
# 示例: ./scripts/fix-mac-release.sh v1.1.5

set -e

TAG="${1:-v1.1.5}"
REPO="tingwensuojian/Resound-Player"

echo "=== 修复 Release ${TAG} 的 latest-mac.yml ==="

# 检查 gh 是否安装
if ! command -v gh &>/dev/null; then
  echo "请先安装 gh CLI: brew install gh && gh auth login"
  exit 1
fi

# 检查 gh 是否已登录
if ! gh auth status &>/dev/null; then
  echo "请先登录: gh auth login"
  exit 1
fi

# 下载合并版 latest-mac.yml（包含 x64 + arm64）
echo "下载 merged-latest-mac.yml..."
MERGED_URL="https://github.com/${REPO}/releases/download/${TAG}/merged-latest-mac.yml"
curl -sL "$MERGED_URL" -o /tmp/_merged-latest-mac.yml

if [ ! -s /tmp/_merged-latest-mac.yml ]; then
  echo "错误: 无法下载 merged-latest-mac.yml，Release ${TAG} 可能没有该文件"
  exit 1
fi

# 修正 releaseDate 双引号嵌套
sed -i '' "s/releaseDate: \"'\(.*\)'\"/releaseDate: \"\1\"/" /tmp/_merged-latest-mac.yml

echo "修正后的内容:"
cat /tmp/_merged-latest-mac.yml

# 删除已有 latest-mac.yml
echo "删除旧的 latest-mac.yml..."
gh release view "${TAG}" --json assets -q ".assets[] | select(.name==\"latest-mac.yml\") | .id" 2>/dev/null | while read id; do
  gh api -X DELETE "repos/${REPO}/releases/assets/$id" 2>/dev/null || true
done

# 上传修正版
echo "上传修正版 latest-mac.yml..."
gh release upload "${TAG}" /tmp/_merged-latest-mac.yml --clobber

# 清理
rm -f /tmp/_merged-latest-mac.yml

echo ""
echo "✅ Release ${TAG} 的 latest-mac.yml 已修复"
echo "现在 electron-updater 可以正确识别对应架构的 DMG 进行下载更新"
echo ""
echo "注意: 此修复只解决单架构 latest-mac.yml 问题。"
echo "根本修复（添加 zip 构建目标）已在代码中完成，推送到 main 分支后"
echo "下次 Release 会自动生成 .zip 文件供 electron-updater 使用。"
