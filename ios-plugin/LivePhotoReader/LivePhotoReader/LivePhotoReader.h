//
//  LivePhotoReader.h
//  LivePhotoReader
//
//  iOS 原生插件 — 读取 iPhone 实况照片（Live Photo）的完整双文件
//
//  通过 PHAsset 框架获取原始 HEIC 封面 + MOV 动态视频
//  绕过 wx.chooseMedia 的降采样限制，保留完整画质
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

/// 实况照片双文件结果
@interface LivePhotoResult : NSObject

/// HEIC/JPEG 封面图的临时文件路径
@property (nonatomic, copy) NSString *imagePath;

/// MOV 动态视频的临时文件路径
@property (nonatomic, copy) NSString *videoPath;

/// 文件大小（字节）
@property (nonatomic, assign) NSUInteger imageSize;
@property (nonatomic, assign) NSUInteger videoSize;

@end

/// 插件回调
typedef void(^LivePhotoPickCompletion)(LivePhotoResult *_Nullable result, NSError *_Nullable error);
typedef void(^LivePhotoReadCompletion)(LivePhotoResult *_Nullable result, NSError *_Nullable error);

/// LivePhotoReader 主接口
@interface LivePhotoReader : NSObject

/// 单例
+ (instancetype)sharedReader;

/// 弹出相册选择器让用户选择实况照片
/// @param viewController 当前展示的 UIViewController
/// @param completion     返回 HEIC + MOV 双文件路径
- (void)pickLivePhotoFrom:(UIViewController *)viewController
               completion:(LivePhotoPickCompletion)completion;

/// 直接通过 PHAsset localIdentifier 读取实况照片
/// @param localIdentifier PHAsset 的本地标识符
/// @param completion      返回双文件路径
- (void)readLivePhotoWithIdentifier:(NSString *)localIdentifier
                         completion:(LivePhotoReadCompletion)completion;

/// 检查资源是否为实况照片
+ (BOOL)isLivePhotoAsset:(PHAsset *)asset;

/// 清理临时文件
- (void)cleanupTempFiles;

@end

NS_ASSUME_NONNULL_END
