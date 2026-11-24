//! 跨功能入口、默认开关和权限隔离的集成检查。

use super::*;
use crate::test_support::mock;
use openidea_plugin::{ProcessOutput, mock::MockHost};

#[test]
fn both_features_start_disabled_without_side_effects() {
    let host = mock();
    host.set_project_root(Some("D:/项目"));
    host.open_editor("D:/项目/a.java", "java", "hello", &[(0, 0, 0, 0)]);
    for command in ["copy-relative", "copy-absolute", "open-file", "open-project"] {
        assert!(EditorTools.run_command(command, &host.invocation(), None).is_err());
    }
    assert_eq!(host.clipboard(), None);
    assert!(host.process_runs().is_empty());
}

#[test]
fn missing_process_permission_does_not_affect_copy() {
    let host = MockHost::install().with_capabilities(&["editor.read", "project.read", "clipboard"]);
    host.set_project_root(Some("D:/项目"));
    host.set_setting("copyPathEnabled", "true");
    host.set_setting("externalEditorEnabled", "true");
    host.open_editor("D:/项目/a.java", "java", "a", &[(0, 0, 0, 0)]);
    EditorTools.run_command("copy-relative", &host.invocation(), None).unwrap();
    assert!(matches!(EditorTools.run_command("open-file", &host.invocation(), None), Err(Error::Denied(_))));
    assert_eq!(host.clipboard().as_deref(), Some("a.java#1"));
}

#[test]
fn missing_editor_project_and_failed_launch_are_reported() {
    let host = mock();
    host.set_setting("copyPathEnabled", "true");
    host.set_setting("externalEditorEnabled", "true");
    assert!(EditorTools.run_command("copy-relative", &host.invocation(), None).is_err());
    host.set_project_root(None);
    assert!(EditorTools.run_command("open-project", &host.invocation(), None).is_err());
    host.set_project_root(Some("D:/项目"));
    host.on_process("code", |_, _| Ok(ProcessOutput { status: Some(3), stdout: String::new(), stderr: "launcher failure".into() }));
    let error = EditorTools.run_command("open-project", &host.invocation(), None).unwrap_err();
    assert!(error.to_string().contains("launcher failure"));
}
