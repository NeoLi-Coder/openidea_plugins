//! 各功能测试共用的模拟宿主；仅编译进测试目标。

use openidea_plugin::mock::MockHost;

pub(crate) fn mock() -> MockHost {
    MockHost::install().with_capabilities(&["editor.read", "project.read", "clipboard", "process:code"])
}
