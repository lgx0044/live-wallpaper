// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "LivePhotoReader",
    platforms: [
        .iOS(.v14)
    ],
    products: [
        .library(
            name: "LivePhotoReader",
            type: .dynamic,
            targets: ["LivePhotoReader"]
        ),
    ],
    targets: [
        .target(
            name: "LivePhotoReader",
            dependencies: [],
            path: "LivePhotoReader",
            sources: [
                "LivePhotoReader.m",
                "LivePhotoReaderModule.m",
            ],
            publicHeadersPath: ".",
            cSettings: [
                .headerSearchPath("."),
            ],
            linkerSettings: [
                .linkedFramework("Photos"),
                .linkedFramework("WebKit"),
                .linkedFramework("UIKit"),
                .linkedFramework("Foundation"),
            ]
        )
    ]
)
