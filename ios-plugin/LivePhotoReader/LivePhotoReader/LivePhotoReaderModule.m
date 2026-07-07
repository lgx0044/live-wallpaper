//
//  LivePhotoReaderModule.m
//  LivePhotoReader
//
//  小程序插件桥接实现
//
//  通过自定义 scheme 或 WKScriptMessageHandler 实现 JS ↔ Native 通信
//  小程序插件使用 WKWebView 作为宿主，通过 messageHandler 接收原生回调
//

#import "LivePhotoReaderModule.h"
#import "LivePhotoReader.h"
#import <WebKit/WebKit.h>

@interface LivePhotoReaderModule () <WKScriptMessageHandler>

@property (nonatomic, weak) WKWebView *webView;
@property (nonatomic, strong) NSMutableDictionary<NSString *, void(^)(id, NSError *)> *pendingCallbacks;

@end

@implementation LivePhotoReaderModule

- (instancetype)init {
    self = [super init];
    if (self) {
        _pendingCallbacks = [NSMutableDictionary dictionary];
    }
    return self;
}

- (void)bindWebView:(WKWebView *)webview {
    self.webView = webview;

    // 注册 JS → Native 消息处理器
    [webview.configuration.userContentController addScriptMessageHandler:self
                                                                    name:@"LivePhotoReader"];
}

#pragma mark - WKScriptMessageHandler

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {

    if (![message.name isEqualToString:@"LivePhotoReader"]) return;

    NSDictionary *body = (NSDictionary *)message.body;
    NSString *method = body[@"method"];
    NSDictionary *params = body[@"params"];
    NSString *callbackId = body[@"callbackId"];

    [self handleJSCall:method params:params callbackId:callbackId];
}

#pragma mark - 处理 JS 调用

- (void)handleJSCall:(NSString *)method
              params:(NSDictionary *)params
           callbackId:(NSString *)callbackId {

    if ([method isEqualToString:@"chooseLivePhoto"]) {
        [self handleChooseLivePhoto:params callbackId:callbackId];
    } else if ([method isEqualToString:@"checkAvailability"]) {
        [self handleCheckAvailability:params callbackId:callbackId];
    } else if ([method isEqualToString:@"cleanup"]) {
        [self handleCleanup:params callbackId:callbackId];
    }
}

#pragma mark - 选择实况照片

- (void)handleChooseLivePhoto:(NSDictionary *)params
                   callbackId:(NSString *)callbackId {

    dispatch_async(dispatch_get_main_queue(), ^{
        // 获取当前最顶层的 ViewController
        UIViewController *topVC = [self topViewController];

        if (!topVC) {
            [self sendErrorToJS:callbackId message:@"无法获取当前视图控制器"];
            return;
        }

        [[LivePhotoReader sharedReader] pickLivePhotoFrom:topVC completion:^(LivePhotoResult *result, NSError *error) {
            if (error) {
                [self sendErrorToJS:callbackId message:error.localizedDescription];
                return;
            }

            if (!result) {
                [self sendSuccessToJS:callbackId data:@{}]; // 用户取消
                return;
            }

            // 返回双文件路径给 JS 层
            NSDictionary *data = @{
                @"imagePath": result.imagePath ?: @"",
                @"videoPath": result.videoPath ?: @"",
                @"imageSize": @(result.imageSize),
                @"videoSize": @(result.videoSize),
            };

            [self sendSuccessToJS:callbackId data:data];
        }];
    });
}

- (void)handleCheckAvailability:(NSDictionary *)params
                     callbackId:(NSString *)callbackId {
    // 检查是否支持 Live Photo 读取
    BOOL available = NO;
    if (@available(iOS 14, *)) {
        available = YES;
    }
    [self sendSuccessToJS:callbackId data:@{@"available": @(available)}];
}

- (void)handleCleanup:(NSDictionary *)params
           callbackId:(NSString *)callbackId {
    [[LivePhotoReader sharedReader] cleanupTempFiles];
    [self sendSuccessToJS:callbackId data:@{}];
}

#pragma mark - JS 回调

- (void)sendSuccessToJS:(NSString *)callbackId data:(NSDictionary *)data {
    if (!callbackId || !self.webView) return;

    NSString *jsonData = [self jsonStringFromDict:data];
    NSString *js = [NSString stringWithFormat:@"window.__livePhotoReaderCallback && window.__livePhotoReaderCallback('%@', null, %@)",
                    callbackId, jsonData];

    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:js completionHandler:nil];
    });
}

- (void)sendErrorToJS:(NSString *)callbackId message:(NSString *)message {
    if (!callbackId || !self.webView) return;

    NSString *js = [NSString stringWithFormat:@"window.__livePhotoReaderCallback && window.__livePhotoReaderCallback('%@', '%@', null)",
                    callbackId, [self escapeJSString:message]];

    dispatch_async(dispatch_get_main_queue(), ^{
        [self.webView evaluateJavaScript:js completionHandler:nil];
    });
}

#pragma mark - 工具

- (NSString *)jsonStringFromDict:(NSDictionary *)dict {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&error];
    if (error) return @"{}";
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

- (NSString *)escapeJSString:(NSString *)str {
    return [str stringByReplacingOccurrencesOfString:@"'" withString:@"\\'"];
}

- (UIViewController *)topViewController {
    UIViewController *top = [UIApplication sharedApplication].keyWindow.rootViewController;
    while (top.presentedViewController) {
        top = top.presentedViewController;
    }
    return top;
}

#pragma mark - 插件协议

- (void)chooseLivePhoto:(NSDictionary *)params
        successCallback:(NSString *)successCallback
           failCallback:(NSString *)failCallback {

    [self handleChooseLivePhoto:params callbackId:successCallback];
}

@end
