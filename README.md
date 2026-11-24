# OpenIDEA 插件
每个插件单独安装、升级和授权。源码在同一个 Cargo workspace 中维护，使用 OpenIDEA 0.1.50 / API 1.14。

| 插件 | 功能 | 从磁盘安装时选择的文件夹 |
| --- | --- | --- |
| [Neo 编辑器工具](plugins/editor-tools/README.md) | 复制路径与行号、跳转到外部编辑器 | `plugins/editor-tools` |
| [Neo API 工具](plugins/api-tools/README.md) | 接口浏览、请求编辑与 cURL 调试 | `plugins/api-tools` |

在仓库根目录运行：

```powershell
./build.ps1 -Plugin editor-tools
./build.ps1 -Plugin api-tools
./build.ps1                       # 构建全部
```

构建需要 Rust 和 `wasm32-wasip2`；API 模块还需支持 `stripTypeScriptTypes` 的 Node.js（已用 22.23），以及用于构建内嵌定时任务组件的 JDK 和 Maven。根目录的 `vendor/openidea-plugin`、`Cargo.lock` 和构建脚本共用，插件 ID、版本、权限与资源均在各模块内维护。

打包结果在 `release/`。OpenIDEA 的 **Install Plugin from Package File…** 选择单个 `.oiplugin`；**Install Plugin from Disk…** 选择上表对应的模块目录。
