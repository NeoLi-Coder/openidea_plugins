# Neo 编辑器工具

一个 OpenIDEA 插件，合并 **Copy Path Line** 和 **OpenToVSCode** 的功能，分别手动启用。当前版本 **0.1.2**。

## 安装与开关

面向 **OpenIDEA 0.1.50 / 插件 API 1.14** 构建。

1. 打开「设置 → 插件 → 从磁盘安装」，选择本项目根目录（包含 `plugin.toml` 的文件夹）。如果使用 `.oiplugin` 文件，选择齿轮菜单中的「Install Plugin from Package File…」。
2. 这是本地未签名包。查看权限并允许安装。
3. 在插件设置「Neo 编辑器工具」中，勾选需要的功能：
   - **复制路径与行号 → 启用复制绝对路径**
   - **复制路径与行号 → 启用复制相对路径**
   - **外部编辑器 → 启用外部编辑器**

新安装时开关默认关闭，保存后下一次操作立即生效，无需重启或重载。升级时，原复制总开关的状态延续给相对路径，新增的绝对路径开关请单独勾选。关闭后命令入口仍保留，调用时提示启用，不复制、不启动程序。没有后台扫描或自动打开行为。

## 复制路径与行号

打开文件，放置光标或选择一段／多段代码，直接在右键一级菜单选择：

- **复制相对路径与行号**：`src\UserController.java#8`
- **复制绝对路径与行号**：`D:\项目\src\UserController.java#1-3,5-6,8-11`

四个编辑器右键入口直接展开，先显示两项复制操作，再显示两项外部编辑器操作，不再收纳到「Neo 编辑器工具」子菜单。当前 API 不支持自定义组标题、分隔线或插入锚点，所在菜单区段由宿主统一管理。

支持多光标、选区排序去重和相邻区间合并。选区结束在下一行行首时不计入该行。相对路径以当前项目根目录为基准；项目外文件使用绝对路径。与本机 IDEA 原版一致，Windows 路径使用 `\`，POSIX 路径使用 `/`；复制成功不弹通知。0.1.0 的 Windows 复制结果使用 `/`，本版已改为原版格式。

相对路径默认快捷键为 Windows/Linux `Ctrl+Shift+C`、macOS `Cmd+Shift+C`。若已被 IDE 占用，在「设置 → 快捷键」搜索「复制相对路径与行号」自行绑定。

## 在外部编辑器中打开

先在本插件的权限中，为 **`process:code`** 选择并授权目标编辑器的启动程序。`code` 是权限名称，不限制编辑器品牌；程序路径由宿主保存，不需要在插件设置里重复填写。

- Windows VS Code：`Code.exe`，或安装目录下的 `bin/code.cmd`。
- Windows VS Code Insiders：`Code - Insiders.exe`，或 `bin/code-insiders.cmd`。
- Cursor、Qoder 等兼容编辑器：对应的可执行程序或支持 `-g 文件:行:列` 的 CLI 启动器。
- macOS/Linux：对应的 `code` 或兼容 CLI。

当前 API 会等待启动程序退出：已运行的编辑器通常转交请求后退出；EXE 冷启动若持续运行，可能被宿主超时终止。遇到这种情况，在同一个 `process:code` 权限中改选对应 CLI 启动器。插件不修改已有授权，不添加 PowerShell 权限。程序更新后如提示授权失效，在插件权限中重新批准。

随后手动执行：

- 编辑器右键 → **在外部编辑器中打开当前文件**，或编辑器标题栏按钮、`Ctrl+Alt+V`：传递当前文件的行、列。
- 编辑器／项目树右键、「工具」菜单、主工具栏按钮，或 `Ctrl+Alt+Shift+V` → **在外部编辑器中打开当前项目**：同时传递项目目录和当前文件位置；没有打开文件时只打开目录。
- 也可在「查找操作」搜索以上命令，并在快捷键设置中为其绑定按键。

与已安装 OpenToVSCode 一样，使用 `-g 文件:行:列`，行列从 1 开始；参数逐项传递，空格、中文和 `&` 不作为 shell 命令解释。不再强制 `--reuse-window`，窗口行为交给目标编辑器设置。不自动保存当前文件，目标编辑器读取磁盘内容。仅使用复制功能时，可以不授予 `process:code`。

普通单光标直接使用其位置。API 1.14 不提供主光标索引或选区方向，有选区／多光标时仍使用第一选区末端，无法保证与 IDEA 主光标一致。两个入口共用同一定位实现。

启动参数会写入 OpenIDEA 日志，标记为「外部编辑器启动参数」，可用于区分没有取得当前文件与目标编辑器没有执行定位；日志不包含文件内容。

本次交付以本地 Windows 项目为验收范围。OpenIDEA 在远程项目中会在项目所在机器执行进程，不能用这些命令直接打开本机编辑器中的远程文件。

## 与本机 IDEA 插件的核对结果

行为基准为已安装的 `IDEAToVSCode/lib/instrumented-IDEAToVSCode-1.0.0.jar` 和 `copy-path-line-idea-plugin/lib/copy-path-line-idea-plugin-0.1.1.jar`，已读取 `META-INF/plugin.xml`，并通过 JDK `javap -c -p` 核对动作、配置、路径和启动类；未执行或修改这些插件。

| 原版行为 | 当前实现／差异 |
| --- | --- |
| 相对／绝对路径、`#` 行号、多光标区间合并、半开选区、成功静默 | 已实现，复制功能增加独立开关 |
| 相对路径先取文件所属内容根，再用项目根 | 当前 API 只提供项目根，多模块内容根尚不能对齐 |
| `OpenFileInVSCodeAction` 取主光标逻辑位置，`VSCodeLauncher` 传 `-g` | 普通单光标可定位；主光标和反向选区信息缺失 |
| `OpenProjectInVSCodeAction` 仅传项目目录 | 按用户要求增强为目录 + 当前文件定位 |
| 文件／项目快捷键，编辑器右键，项目主工具栏 | 已声明对应入口；另保留文件标题栏和项目树入口 |
| 复制菜单位于 Copy/Paste Special 下方 | OpenIDEA 菜单声明不支持该锚点；四项操作直接显示在右键一级菜单，复制操作在前、打开操作在后 |
| 可执行路径输入／文件选择 | 按用户确认改由宿主 `process:code` 权限页管理 |
| `ProcessBuilder.start()` 后立即返回 | 宿主只有等待完成或受管子进程接口，不能脱离 GUI 进程 |

原版 `defaultToProject` 勾选项只有保存／读取，没有动作读取它，因此在已装 1.0.0 中不影响两个入口。本插件不添加无效开关。原版两个动作也没有显式保存文件。

当前包不包含 OpenIDEA 宿主补丁。完整复刻仍需要宿主提供主光标、选区方向、内容根以及独立启动进程的接口。

## 工程结构与扩展

保持一个 crate、一个安装包，按功能组织模块：

```text
src/
├─ lib.rs                       # 插件注册与命令分发
├─ settings.rs                  # 公共开关读取
├─ features/
│  ├─ mod.rs                    # 功能模块声明
│  ├─ copy_path/
│  │  ├─ mod.rs                 # 路径、行号、剪贴板
│  │  ├─ path.rs                # Windows／POSIX 路径语义
│  │  └─ tests.rs               # 本功能测试
│  └─ external_editor/
│     ├─ mod.rs                 # 文件／项目参数和授权程序启动
│     ├─ target.rs              # 当前文件定位，隔离宿主 API 差异
│     └─ tests.rs               # 本功能测试
├─ test_support.rs              # 测试共用的模拟宿主
└─ tests.rs                     # 命令入口和跨功能权限隔离测试
plugin.toml                     # 命令、菜单、快捷键和权限
settings.schema.json            # 设置页面字段和默认值
vendor/openidea-plugin/         # 固定版本的上游 SDK
build.ps1                       # 测试、编译和打包
```

新增功能时，在 `src/features/<功能名>/` 中实现并维护本模块测试，在 `features/mod.rs` 声明模块、`lib.rs` 注册命令分支，并在 `plugin.toml`、`settings.schema.json` 声明入口和独立开关。功能之间不互相调用；仅在出现实际复用时提取公共代码。上游 SDK 与业务代码分开维护。

## 构建

需要 Rust stable、Windows MSVC 构建工具以及 `wasm32-wasip2` target：

```powershell
rustup target add wasm32-wasip2
./build.ps1
```

`build.ps1` 优先使用当前项目 `.tools` 中的工具链，否则使用 PATH 中的 Cargo；执行测试、WASM 构建和未签名 ZIP 打包。已完成当前源码测试时可用 `./build.ps1 -SkipTests` 只构建打包。

SDK 随源码锁定在 `vendor/openidea-plugin`，来源见 `THIRD_PARTY_NOTICES.md`。`Cargo.lock` 锁定第三方依赖。此脚本不安装插件、不修改 IDE 设置。

测试使用 SDK 模拟宿主，覆盖行号、路径、开关、权限和 CLI 参数。实际 IDE 安装、菜单、系统剪贴板及外部编辑器跳转由用户验收；模拟宿主不代表已做桌面实测。
