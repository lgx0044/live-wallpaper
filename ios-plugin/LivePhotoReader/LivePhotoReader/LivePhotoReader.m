//
//  LivePhotoReader.m
//  LivePhotoReader
//
//  核心实现：PHAsset → HEIC + MOV 双文件读取
//
//  权限要求：
//    Info.plist 需配置 NSPhotoLibraryUsageDescription
//

#import "LivePhotoReader.h"
#import <Photos/Photos.h>
#import <AVFoundation/AVFoundation.h>

@interface LivePhotoReader ()

@property (nonatomic, strong) PHImageManager *imageManager;
@property (nonatomic, strong) dispatch_queue_t ioQueue;
@property (nonatomic, strong) NSMutableSet<NSString *> *tempFiles;

@end

@implementation LivePhotoResult
@end

@implementation LivePhotoReader

+ (instancetype)sharedReader {
    static LivePhotoReader *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[LivePhotoReader alloc] initPrivate];
    });
    return instance;
}

- (instancetype)initPrivate {
    self = [super init];
    if (self) {
        _imageManager = [PHImageManager defaultManager];
        _ioQueue = dispatch_queue_create("com.wallive.livephotoreader.io", DISPATCH_QUEUE_CONCURRENT);
        _tempFiles = [NSMutableSet set];
    }
    return self;
}

- (instancetype)init {
    @throw [NSException exceptionWithName:@"Singleton" reason:@"Use +sharedReader" userInfo:nil];
    return nil;
}

#pragma mark - 检查权限

- (void)requestAuthorizationIfNeeded:(void(^)(BOOL granted))completion {
    PHAuthorizationStatus status = [PHPhotoLibrary authorizationStatusForAccessLevel:PHAccessLevelReadWrite];
    switch (status) {
        case PHAuthorizationStatusLimited:
        case PHAuthorizationStatusAuthorized:
            completion(YES);
            return;
        case PHAuthorizationStatusNotDetermined:
            [PHPhotoLibrary requestAuthorizationForAccessLevel:PHAccessLevelReadWrite handler:^(PHAuthorizationStatus s) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(s == PHAuthorizationStatusAuthorized || s == PHAuthorizationStatusLimited);
                });
            }];
            return;
        default:
            completion(NO);
            return;
    }
}

#pragma mark - 选取实况照片

- (void)pickLivePhotoFrom:(UIViewController *)viewController
               completion:(LivePhotoPickCompletion)completion {

    [self requestAuthorizationIfNeeded:^(BOOL granted) {
        if (!granted) {
            completion(nil, [NSError errorWithDomain:@"LivePhotoReader"
                                                code:-1
                                            userInfo:@{NSLocalizedDescriptionKey: @"相册访问权限被拒绝"}]);
            return;
        }

        // 使用 PHPicker（iOS 14+，支持 Live Photo 筛选）
        if (@available(iOS 14, *)) {
            [self presentPHPickerFrom:viewController completion:completion];
        } else {
            // iOS 13 及以下使用 UIImagePickerController
            [self presentImagePickerFrom:viewController completion:completion];
        }
    }];
}

#pragma mark - iOS 14+ PHPicker

- (void)presentPHPickerFrom:(UIViewController *)viewController
                 completion:(LivePhotoPickCompletion)completion API_AVAILABLE(ios(14)) {

    var config = [[PHPickerConfiguration alloc] init];
    config.preferredAssetRepresentationMode = PHPickerConfigurationAssetRepresentationModeCurrent;
    config.selectionLimit = 1;
    config.filter = [PHPickerFilter livePhotosFilter]; // 只筛选实况照片！

    PHPickerViewController *picker = [[PHPickerViewController alloc] initWithConfiguration:config];
    picker.delegate = (id<PHPickerViewControllerDelegate>)self;

    // 关联回调（通过 objc_setAssociatedObject）
    objc_setAssociatedObject(picker, @"completion", completion, OBJC_ASSOCIATION_COPY_NONATOMIC);

    [viewController presentViewController:picker animated:YES completion:nil];
}

#pragma mark - iOS 13 及以下 UIImagePickerController

- (void)presentImagePickerFrom:(UIViewController *)viewController
                    completion:(LivePhotoPickCompletion)completion {

    UIImagePickerController *picker = [[UIImagePickerController alloc] init];
    picker.sourceType = UIImagePickerControllerSourceTypePhotoLibrary;
    picker.mediaTypes = @[@"public.image", @"public.movie"];
    picker.delegate = (id<UIImagePickerControllerDelegate>)self;

    objc_setAssociatedObject(picker, @"completion", completion, OBJC_ASSOCIATION_COPY_NONATOMIC);

    // 注意：UIImagePickerController 不支持仅筛选 Live Photo
    // 用户需要手动选择实况照片
    [viewController presentViewController:picker animated:YES completion:nil];
}

#pragma mark - PHPickerViewControllerDelegate

- (void)picker:(PHPickerViewController *)picker didFinishPicking:(NSArray<PHPickerResult *> *)results API_AVAILABLE(ios(14)) {
    LivePhotoPickCompletion completion = objc_getAssociatedObject(picker, @"completion");

    [picker dismissViewControllerAnimated:YES completion:nil];

    if (!results || results.count == 0) {
        if (completion) completion(nil, nil); // 用户取消
        return;
    }

    PHPickerResult *result = results.firstObject;
    NSItemProvider *provider = result.itemProvider;

    // 获取 localIdentifier 用于后续 PHAsset 读取
    NSString *localIdentifier = [result.assetIdentifier componentsSeparatedByString:@"/"].firstObject;

    if (!localIdentifier) {
        // 降级：尝试从 provider 读取
        [self readFromItemProvider:provider completion:completion];
        return;
    }

    // 通过 PHAsset 读取完整双文件
    [self readLivePhotoWithIdentifier:localIdentifier completion:^(LivePhotoResult *r, NSError *e) {
        if (completion) completion(r, e);
    }];
}

#pragma mark - 从 NSItemProvider 降级读取

- (void)readFromItemProvider:(NSItemProvider *)provider
                  completion:(LivePhotoPickCompletion)completion {

    // 尝试读取 Live Photo
    if ([provider canLoadObjectOfClass:[PHLivePhoto class]]) {
        [provider loadObjectOfClass:[PHLivePhoto class] completion:^(id<NSItemProviderReading>  _Nullable object, NSError * _Nullable error) {
            PHLivePhoto *livePhoto = (PHLivePhoto *)object;
            if (!livePhoto) {
                if (completion) completion(nil, error ?: [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"无法读取实况照片"}]);
                return;
            }

            // 从 PHLivePhoto 中提取资源文件
            [self extractFilesFromLivePhoto:livePhoto completion:completion];
        }];
    } else {
        if (completion) completion(nil, [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"所选不是实况照片"}]);
    }
}

#pragma mark - 通过 PHAsset localIdentifier 读取

- (void)readLivePhotoWithIdentifier:(NSString *)localIdentifier
                         completion:(LivePhotoReadCompletion)completion {

    if (!localIdentifier) {
        if (completion) completion(nil, [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"无效的标识符"}]);
        return;
    }

    PHFetchResult<PHAsset *> *assets = [PHAsset fetchAssetsWithLocalIdentifiers:@[localIdentifier] options:nil];
    PHAsset *asset = assets.firstObject;

    if (!asset) {
        if (completion) completion(nil, [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"未找到对应资源"}]);
        return;
    }

    if (![LivePhotoReader isLivePhotoAsset:asset]) {
        if (completion) completion(nil, [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"所选不是实况照片"}]);
        return;
    }

    // 获取 PHAssetResource 列表
    NSArray<PHAssetResource *> *resources = [PHAssetResource assetResourcesForAsset:asset];

    __block PHAssetResource *imageResource = nil;
    __block PHAssetResource *videoResource = nil;

    for (PHAssetResource *res in resources) {
        // PHAssetResourceTypePhoto = HEIC/JPEG 原始封面
        // PHAssetResourceTypeFullSizePairedVideo = 配对的 MOV 动态视频
        if (res.type == PHAssetResourceTypePhoto) {
            imageResource = res;
        } else if (res.type == PHAssetResourceTypeFullSizePairedVideo) {
            videoResource = res;
        }
    }

    if (!imageResource || !videoResource) {
        if (completion) completion(nil, [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"资源不完整，缺少封面或动态视频"}]);
        return;
    }

    // 写入临时文件
    LivePhotoResult *result = [[LivePhotoResult alloc] init];

    dispatch_group_t group = dispatch_group_create();
    __block NSError *writeError = nil;

    // 临时目录
    NSString *tmpDir = NSTemporaryDirectory();
    NSString *uuid = [[NSUUID UUID] UUIDString];
    NSString *imagePath = [tmpDir stringByAppendingPathComponent:[NSString stringWithFormat:@"%@_photo.heic", uuid]];
    NSString *videoPath = [tmpDir stringByAppendingPathComponent:[NSString stringWithFormat:@"%@_photo.mov", uuid]];

    result.imagePath = imagePath;
    result.videoPath = videoPath;

    // 写入 HEIC
    dispatch_group_enter(group);
    [PHAssetResourceManager.defaultManager writeDataForAssetResource:imageResource
                                                              toFile:[NSURL fileURLWithPath:imagePath]
                                                             options:nil
                                                   completionHandler:^(NSError * _Nullable e) {
        if (e) writeError = e;
        NSNumber *fileSize = [NSFileManager.defaultManager attributesOfItemAtPath:imagePath error:nil][NSFileSize];
        result.imageSize = fileSize.unsignedIntegerValue;
        dispatch_group_leave(group);
    }];

    // 写入 MOV
    dispatch_group_enter(group);
    [PHAssetResourceManager.defaultManager writeDataForAssetResource:videoResource
                                                              toFile:[NSURL fileURLWithPath:videoPath]
                                                             options:nil
                                                   completionHandler:^(NSError * _Nullable e) {
        if (e) writeError = e;
        NSNumber *fileSize = [NSFileManager.defaultManager attributesOfItemAtPath:videoPath error:nil][NSFileSize];
        result.videoSize = fileSize.unsignedIntegerValue;
        dispatch_group_leave(group);
    }];

    // 记录临时文件便于清理
    [self.tempFiles addObject:imagePath];
    [self.tempFiles addObject:videoPath];

    dispatch_group_notify(group, dispatch_get_main_queue(), ^{
        if (writeError) {
            if (completion) completion(nil, writeError);
        } else {
            if (completion) completion(result, nil);
        }
    });
}

#pragma mark - 从 PHLivePhoto 提取文件（降级方案）

- (void)extractFilesFromLivePhoto:(PHLivePhoto *)livePhoto
                       completion:(LivePhotoPickCompletion)completion {

    // PHLivePhoto 不直接暴露文件路径，需要用 PHAssetResource 走
    // 这个路径通常在 picker 已获取 localIdentifier 的情况下不触发
    // 这里保留占位，实际生产应走 PHAsset 读取

    if (completion) completion(nil, [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"请使用 PHPicker 选择实况照片"}]);
}

#pragma mark - 工具方法

+ (BOOL)isLivePhotoAsset:(PHAsset *)asset {
    return (asset.mediaSubtypes & PHAssetMediaSubtypePhotoLive) != 0;
}

- (void)cleanupTempFiles {
    for (NSString *path in self.tempFiles) {
        [NSFileManager.defaultManager removeItemAtPath:path error:nil];
    }
    [self.tempFiles removeAllObjects];
}

#pragma mark - UIImagePickerControllerDelegate (iOS 13 及以下)

- (void)imagePickerController:(UIImagePickerController *)picker
didFinishPickingMediaWithInfo:(NSDictionary<UIImagePickerControllerInfoKey,id> *)info {

    LivePhotoPickCompletion completion = objc_getAssociatedObject(picker, @"completion");
    [picker dismissViewControllerAnimated:YES completion:nil];

    // UIImagePickerController 对 Live Photo 支持有限
    // 提示用户升级 iOS 版本
    if (completion) {
        NSError *err = [NSError errorWithDomain:@"LivePhotoReader" code:-1 userInfo:@{NSLocalizedDescriptionKey: @"请升级至 iOS 14+ 以支持实况照片读取"}];
        completion(nil, err);
    }
}

- (void)imagePickerControllerDidCancel:(UIImagePickerController *)picker {
    LivePhotoPickCompletion completion = objc_getAssociatedObject(picker, @"completion");
    [picker dismissViewControllerAnimated:YES completion:nil];
    if (completion) completion(nil, nil);
}

@end
