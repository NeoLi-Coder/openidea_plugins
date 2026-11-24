//! OpenToVSCode：提取当前文件／项目及位置，通过宿主已授权的程序打开。

use crate::settings;
use openidea_plugin::{Error, Invocation, Position, host};

mod target;
use target::FileTarget;

pub(crate) fn open_file(ctx: &Invocation) -> Result<(), Error> {
    settings::require_enabled("externalEditorEnabled", "外部编辑器")?;
    let target = FileTarget::current(ctx)?.ok_or("请先打开一个文件。")?;
    launch(ctx, &file_args(&target.path, target.position))
}

pub(crate) fn open_project(ctx: &Invocation) -> Result<(), Error> {
    settings::require_enabled("externalEditorEnabled", "外部编辑器")?;
    let project = ctx.project().ok_or("请先打开一个项目。")?;
    // 没有打开文件时仍可打开项目；有文件时，目录与定位参数在同一次启动中传递。
    let target = FileTarget::current(ctx)?;
    launch(ctx, &project_args(&project.root()?, target.as_ref()))
}

/// 参数逐项传递，不拼接 shell 命令；SDK 的行列均从 0 开始，CLI 从 1 开始。
fn file_args(path: &str, position: Position) -> Vec<String> {
    vec![
        "-g".into(),
        format!("{path}:{}:{}", position.line + 1, position.character + 1),
    ]
}

fn project_args(root: &str, target: Option<&FileTarget>) -> Vec<String> {
    let mut args = vec![root.into()];
    if let Some(target) = target {
        args.extend(file_args(&target.path, target.position));
    }
    args
}

fn launch(ctx: &Invocation, args: &[String]) -> Result<(), Error> {
    // 与 IDEA 原版一样逐项传参，不强制窗口复用，也不加 --wait。
    // code 是权限标识，不是固定的 VS Code 路径；可授权 Insiders、Cursor 等程序。
    // 当前宿主会等待进程退出，不能像原版 ProcessBuilder.start 一样脱离 GUI 进程。
    let _task = host::begin_task("正在打开外部编辑器", true);
    let command = host::Command::new("code").args(args);
    host::log(openidea_plugin::LogLevel::Info, &format!("外部编辑器启动参数：{:?}", command.args));
    let output = host::run_command(&command, ctx.project().as_ref(), None)?;
    if output.status != Some(0) {
        return Err(format!(
            "外部编辑器启动失败（退出状态 {:?}）：{}",
            output.status,
            output.stderr.trim()
        ).into());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
