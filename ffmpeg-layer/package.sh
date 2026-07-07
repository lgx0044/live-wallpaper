#!/usr/bin/env bash
# package.sh — 将已有的 FFmpeg 静态二进制打包为 CloudBase Layer
#
# 如果你的环境中已有编译好的 ffmpeg 静态二进制文件，直接执行此脚本：
#   ./package.sh
#
# 会生成 ffmpeg-layer.zip，通过 CloudBase CLI 创建 Layer:
#   tcb fn layer create ffmpeg-layer --file ./ffmpeg-layer.zip -e <env-id>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$SCRIPT_DIR/bin"
OUTPUT="$SCRIPT_DIR/../ffmpeg-layer.zip"

if [ ! -f "$BIN_DIR/ffmpeg" ]; then
  echo "❌ 未找到 $BIN_DIR/ffmpeg"
  echo "请先放置静态 FFmpeg 二进制文件到 bin/ 目录"
  echo ""
  echo "你可以："
  echo "  1. 自行编译（运行 build.sh）"
  echo "  2. 从 https://johnvansickle.com/ffmpeg/ 或 https://github.com/eugeneware/ffmpeg-static 下载"
  echo "     注意：需要 Linux x86_64 静态版本"
  exit 1
fi

echo "📦 打包 Layer..."
cd "$SCRIPT_DIR"
mkdir -p /tmp/ffmpeg-layer-pack
cp "$BIN_DIR/ffmpeg" /tmp/ffmpeg-layer-pack/
cd /tmp/ffmpeg-layer-pack
zip "$OUTPUT" ffmpeg
cd "$SCRIPT_DIR"

ls -lh "$OUTPUT"
echo ""
echo "✅ 打包完成！Layer 包: $OUTPUT"
echo ""
echo "部署命令："
echo "  tcb fn layer create ffmpeg-layer --file $OUTPUT -e <env-id>"
echo "  tcb fn layer bind processLivePhoto --layer ffmpeg-layer --layer-version 1 -e <env-id>"
