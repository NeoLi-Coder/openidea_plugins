# 第三方代码

`vendor/openidea-plugin` 包含 OpenIDEA Rust 插件 SDK 的 `src`、`wit` 和 `Cargo.toml`，未经修改。

- 上游：https://github.com/l0ng-ai/openidea
- 发布标签：`v0.1.50`
- 提交：`83364c5423e3a541afcda84ee9e00ca03e7ec6dd`
- 插件 API：`1.14.0`
- 许可证：Apache-2.0，全文见 `LICENSE`；SDK 的版权归属见 `NOTICE`。

将 SDK 随源码保留，是为了锁定与本机 OpenIDEA 0.1.50 一致的接口，构建不依赖上游 main 分支变化。

本插件的功能实现为新编写，没有复制原 JetBrains 插件源码。
