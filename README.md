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

## 发布 Release

先更新对应插件的 `plugin.toml`、`Cargo.toml`、根目录 `Cargo.lock` 及使用说明中的版本，提交后推送版本标签。两个插件分别使用 `api-tools-v版本号` 和 `editor-tools-v版本号`：

```powershell
git tag -a api-tools-v0.1.18 -m "Neo API 工具 0.1.18"
git push origin main api-tools-v0.1.18
```

[publish 工作流](https://github.com/NeoLi-Coder/openidea_plugins/actions/workflows/publish.yml) 会检出该标签，运行 `build.ps1` 的既有测试与构建，并将对应的 `.oiplugin` 上传到 GitHub Release。工作流使用 GitHub 提供的 `GITHUB_TOKEN` 和 `contents: write` 权限，无需配置个人令牌。API 工具的 Release 说明会提示首次允许 `ide.commands`。

标签已存在时，在 Actions → publish → Run workflow 中选择 `main`，填写已有标签（例如 `api-tools-v0.1.18`）即可补发；构建源码仍取自该标签。首次为已有标签补上工作流时，也使用此入口。
