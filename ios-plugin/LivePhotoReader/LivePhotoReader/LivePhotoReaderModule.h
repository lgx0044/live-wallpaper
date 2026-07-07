//
//  LivePhotoReaderModule.h
//  LivePhotoReader
//
//  插件桥接模块 — 通过 WKWebView JS Bridge 与小程序通信
//
//  小程序端通过 wx.requirePlugin 加载后，
//  调用 plugin.chooseLivePhoto(success, fail) 触发原生选择
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <WebKit/WKWebView.h>

NS_ASSUME_NONNULL_BEGIN

/// 小程序插件桥接协议
@protocol LivePhotoReaderBridgeProtocol <NSObject>

/// 选择实况照片（小程序 JS 调用入口）
/// @param params 传入参数（保留扩展）
/// @param successCallback 成功回调 JS 函数名
/// @param failCallback 失败回调 JS 函数名
- (void)chooseLivePhoto:(NSDictionary *)params
        successCallback:(NSString *)successCallback
           failCallback:(NSString *)failCallback;

@end

/// 插件主模块（供小程序宿主调用）
@interface LivePhotoReaderModule : NSObject <LivePhotoReaderBridgeProtocol>

/// 通过 WKWebView 注入 JS 回调
/// @param webview 小程序的 WKWebView 实例
- (void)bindWebView:(WKWebView *)webview;

/// 处理来自 JS 层的调用
- (void)handleJSCall:(NSString *)method
              params:(NSDictionary *)params
           callbackId:(NSString *)callbackId;

@end

NS_ASSUME_NONNULL_END
