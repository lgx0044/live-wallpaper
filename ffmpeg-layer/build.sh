#!/usr/bin/env bash
# build.sh — 编译最小静态 FFmpeg 用于 CloudBase Layer
#
# 用法:
#   在 Linux x86_64 环境（或 Docker）中运行:
#     docker run -it --rm -v $(pwd):/build ubuntu:22.04 /build/build.sh
#
# 输出: ffmpeg-layer.zip (约 3-5MB)，通过 CloudBase CLI 创建 Layer:
#   tcb fn layer create ffmpeg-layer --file ./ffmpeg-layer.zip -e <env-id>
#   tcb fn layer bind processLivePhoto --layer ffmpeg-layer --layer-version 1 -e <env-id>

set -euxo pipefail

WORKDIR=/tmp/ffmpeg-build
OUTDIR=$WORKDIR/out
FFMPEG_VERSION=7.0

# 安装构建依赖
apt-get update && apt-get install -y \
  build-essential curl git pkg-config \
  nasm yasm libx264-dev libx265-dev \
  python3

mkdir -p $WORKDIR $OUTDIR/bin
cd $WORKDIR

# 下载 FFmpeg
curl -fsSL https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz -o ffmpeg.tar.xz
tar xf ffmpeg.tar.xz
cd ffmpeg-${FFMPEG_VERSION}

# 配置最小化构建
./configure \
  --prefix=$OUTDIR \
  --enable-static \
  --disable-shared \
  --disable-all \
  --enable-small \
  --enable-ffmpeg \
  --enable-avcodec \
  --enable-avformat \
  --enable-avfilter \
  --enable-swscale \
  --enable-swresample \
  --enable-gpl \
  --enable-libx264 \
  --enable-decoder=h264 \
  --enable-decoder=hevc \
  --enable-decoder=mjpeg \
  --enable-encoder=libx264 \
  --enable-encoder=mjpeg \
  --enable-encoder=rawvideo \
  --enable-parser=h264 \
  --enable-parser=hevc \
  --enable-demuxer=mov \
  --enable-demuxer=image2 \
  --enable-muxer=mp4 \
  --enable-muxer=rawvideo \
  --enable-muxer=image2 \
  --enable-protocol=file \
  --enable-filter=scale,pad,fps,format,crop,setsar,setdar \
  --enable-bsf=h264_mp4toannexb,hevc_mp4toannexb \
  --disable-doc \
  --disable-htmlpages \
  --disable-manpages \
  --disable-podpages \
  --disable-txtpages \
  --disable-network \
  --disable-hwaccels \
  --disable-indevs \
  --disable-outdevs \
  --disable-devices \
  --disable-ffplay \
  --disable-ffprobe \
  --extra-cflags="-I/usr/include/x86_64-linux-gnu" \
  --extra-ldflags="-L/usr/lib/x86_64-linux-gnu"

make -j$(nproc)
make install

# 去除调试符号（大幅减小体积）
strip $OUTDIR/bin/ffmpeg

# 打包为 Layer（解压后到 /opt/）
cd $OUTDIR
mkdir -p /tmp/layer-pack
cp -r bin /tmp/layer-pack/
cd /tmp/layer-pack
zip -r /tmp/ffmpeg-layer.zip .

echo "=== FFmpeg Layer 构建完成 ==="
ls -lh /tmp/ffmpeg-layer.zip
$OUTDIR/bin/ffmpeg -version 2>&1 | head -3
