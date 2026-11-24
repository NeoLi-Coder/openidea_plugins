//! 功能模块共享的开关读取；持久化和设置作用域由 OpenIDEA 管理。

use openidea_plugin::{Error, host};

/// 每次执行时读取设置，开关保存后立即生效，无需重新加载插件。
pub(crate) fn require_enabled(key: &str, name: &str) -> Result<(), Error> {
    if host::setting_bool(key) == Some(true) {
        Ok(())
    } else {
        Err(format!("请在插件设置「Neo 编辑器工具」中启用「{name}」。").into())
    }
}
