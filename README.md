# live动态壁纸

> 将 iPhone Live Photo 转换为兼容的动态壁纸（微信小程序）
> 
> **核心特性：iOS 原生插件穿透相册，直接读取 Live Photo 原始 HEIC + MOV 双文件**

## 功能

- 通过 **iOS 原生插件**（PHAsset 框架）读取 Live Photo 原始数据
- 自动转换为 H.264 编码的 1080p 60fps 壁纸视频
- 预览并保存到相册，可设置为动态壁纸
- 降级方案：`wx.chooseMedia` 兼容非插件环境

## 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | 微信小程序原生框架 |
| **iOS 原生插件** | Xcode + PHAsset + PHPicker + WKScriptMessageHandler |
| **后端** | 微信云开发（云函数 + 云存储 + 云数据库） |
| **视频处理** | FFmpeg（CloudBase Layer 部署） |

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  小程序 JS 层                                            │
│  ┌─────────────────────────────────────────────────┐    │
│  │ livePhotoBridge.js      wx.cloud.uploadFile     │    │
│  │ 选择实况照片 ──────────→ 上传 HEIC + MOV        │    │
│  └──────────┬──────────────────────────────────────┘    │
│             ↕ JS Bridge                                 │
│  ┌──────────┴──────────────────────────────────────┐    │
│  │ iOS 原生插件（LivePhotoReader.framework）         │    │
│  │ PHPicker → PHAsset → HEIC + MOV → 临时路径      │    │
│  └─────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  云开发                                                  │
│  cloudfunctions/processLivePhoto → FFmpeg → outputs/    │
└─────────────────────────────────────────────────────────┘
```

## 目录结构

```
live2screen/
├── miniprogram/                    # 小程序前端
│   ├── app.js / app.json / app.wxss
│   ├── pages/
│   │   ├── index/          # 首页
│   │   ├── upload/         # 上传页（原生插件 + 降级方案）
│   │   ├── processing/     # 处理页（轮询状态）
│   │   └── result/         # 结果页（预览 + 下载）
│   └── utils/
│       ├── config.js             # 云函数名、存储路径、转换参数
│       ├── util.js               # 工具函数
│       └── livePhotoBridge.js    # iOS 原生插件 JS Bridge
│
├── ios-plugin/                     # iOS 原生插件（Xcode 项目）
│   ├── plugin.json                # 小程序插件配置
│   ├── index.js                   # 插件 JS 入口
│   └── LivePhotoReader/
│       └── LivePhotoReader/
│           ├── Info.plist
│           ├── LivePhotoReader.h/m       # 核心：PHAsset 读取双文件
│           ├── LivePhotoReaderModule.h/m # JS Bridge 桥接模块
│           └── LivePhotoReaderFramework.h
│
├── cloudfunctions/                 # 云函数
│   ├── processLivePhoto/   # 下载 HEIC+MOV → FFmpeg 转码 → 上传结果
│   └── getStatus/          # 查询任务状态（轮询接口）
│
├── ffmpeg-layer/                   # FFmpeg Layer 构建脚本
│   ├── build.sh
│   └── package.sh
│
├── assets/                         # 图标
│   ├── icon.svg / icon_*.png
│
└── README.md
```

## 部署步骤

### 1. 编译 iOS 原生插件

用 Xcode 打开 `ios-plugin/` 目录，编译 `LivePhotoReader.framework`：

1. Xcode → File → New → Project → **Framework & Library**
2. 将 `LivePhotoReader.h/m` 和 `LivePhotoReaderModule.h/m` 加入项目
3. 添加依赖：`Photos.framework`, `WebKit.framework`
4. Build 生成 `LivePhotoReader.framework`

### 2. 注册小程序插件

1. 将编译好的 `.framework` 放到小程序的 iOS 插件目录
2. 在微信公众平台 → 设置 → 插件管理 → **注册插件**
3. 获取插件 ID，更新 `plugin.json` 中的 `provider`
4. 提交插件审核（需关联宿主小程序）

### 3. 小程序端启用插件

在 `miniprogram/app.json` 中添加：
```json
{
  "plugins": {
    "live-photo-reader": {
      "version": "1.0.0",
      "provider": "你的插件APPID"
    }
  }
}
```

### 4. 云开发环境

1. 开通云开发，创建环境
2. 修改 `app.js` 中的 `envId`
3. 创建 `tasks` 数据库集合
4. 部署云函数 `processLivePhoto`（1024MB, 300s）+ `getStatus`（256MB, 5s）

### 5. FFmpeg Layer

参考 `ffmpeg-layer/` 目录中的构建脚本部署 Layer。

## 原生插件选型对比

| 方案 | 能否读取 Live Photo | 画质 | 开发成本 |
|------|-------------------|------|---------|
| **✅ iOS 原生插件（本项目）** | ✅ 完整 HEIC + MOV | 原始无损 | 需 Xcode 编译 |
| ❌ wx.chooseMedia (mix) | ⚠️ 部分情况 | 降采样 | 零成本 |
| ❌ wx.chooseVideo | ❌ 看不到 Live Photo | — | 零成本 |
| ❌ wx.chooseImage | ❌ 只取封面图 | — | 零成本 |

## 使用流程

```
首页 → 选择实况照片（原生插件）→ 上传双文件 → 处理中 → 预览 + 保存到相册
```

1. 打开小程序，点击「开始转换」
2. 原生插件弹出 iOS 相册（仅筛选 Live Photo）
3. PHAsset 读取 HEIC 原始封面 + MOV 原始动态视频
4. 双文件上传至云存储
5. FFmpeg 转码为 H.264 60fps 壁纸视频
6. 预览并保存到相册 → 设置为动态壁纸

## 商业化

- 免费用户每日限制转换次数
- 付费用户无限转换、高质量预设
- 支持通过微信支付 / 激励视频广告变现
