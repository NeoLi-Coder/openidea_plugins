OpenIDEA v0.1.50 (83364c5423e3a541afcda84ee9e00ca03e7ec6dd), Apache-2.0:
- vendor/openidea-plugin：插件 SDK。
- vendor/spring：src/features/http-client/spring 的源文件。本地修正了嵌套类型和多参数泛型返回值的方法声明解析，补充了 Spring 文件参数和下载提示的元数据。构建时仅保留可独立运行的解析部分；项目文件与工作台通过插件宿主通讯。
- 上游：https://github.com/l0ng-ai/openidea 。附带许可仅适用于相应第三方代码。不包含 IDEA 插件运行时代码。

界面图标：web/icons/ 中 environment.svg、globalSettings.svg 及其 _dark.svg 版本为本项目自绘；其余选自作者授权使用的本地 Restful Api Tool 251.2.45 包（icons/tool、icons/method/default）。保留图标内原有版权注释；标记为 JetBrains Apache-2.0 的图标按所附 LICENSE 使用。
