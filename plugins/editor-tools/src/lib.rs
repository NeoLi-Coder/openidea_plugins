//! 插件入口：注册宿主接口并分发命令，具体功能由各自模块负责。

mod features;
mod settings;

use openidea_plugin::{Error, Event, Invocation, LogLevel, Plugin, host, register_plugin};

#[derive(Default)]
pub struct EditorTools;

impl Plugin for EditorTools {
    fn handle_events(&mut self, events: &[Event], _ctx: &Invocation) {
        // 设置事件带有窗口作用域，避免项目级开关覆盖其他窗口的菜单状态。
        if events.iter().any(|event| matches!(event, Event::Other { kind, .. } if kind == "settings-changed")) {
            if let Err(error) = settings::sync_menu_context() {
                host::log(LogLevel::Error, &format!("更新右键菜单显示状态失败：{error}"));
            }
        }
    }

    fn run_command(
        &mut self,
        id: &str,
        ctx: &Invocation,
        _arg: Option<&str>,
    ) -> Result<Option<String>, Error> {
        match id {
            "copy-relative" => features::copy_path::copy_relative(ctx)?,
            "copy-absolute" => features::copy_path::copy_absolute(ctx)?,
            "open-file" => features::external_editor::open_file(ctx)?,
            "open-project" => features::external_editor::open_project(ctx)?,
            _ => return Err(Error::NotFound(format!("未知命令：{id}"))),
        }
        // 成功后保持安静；宿主负责展示真实错误。
        Ok(None)
    }
}

register_plugin!(EditorTools);

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;
