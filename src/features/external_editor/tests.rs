use crate::{EditorTools, test_support::mock};
use openidea_plugin::{Plugin, ProcessOutput};

#[test]
fn external_file_arguments_preserve_path_and_utf16_column() {
    let host = mock();
    host.set_project_root(Some("D:/项目 A"));
    host.set_setting("externalEditorEnabled", "true");
    host.open_editor("D:/项目 A/a & b.java", "java", "中文😀abcdef", &[(0, 4, 0, 4)]);
    host.on_process("code", |_, _| Ok(ProcessOutput { status: Some(0), stdout: String::new(), stderr: String::new() }));
    EditorTools.run_command("open-file", &host.invocation(), None).unwrap();
    let runs = host.process_runs();
    assert_eq!(runs[0].program, "code");
    assert_eq!(runs[0].args, ["-g", "D:/项目 A/a & b.java:1:5"]);
    assert_eq!(runs[0].cwd.as_deref(), Some("D:/项目 A"));
    assert!(runs[0].env.is_empty());
    assert_eq!(host.clipboard(), None);
}

#[test]
fn open_project_does_not_need_an_editor_and_switch_applies_immediately() {
    let host = mock();
    host.set_project_root(Some("D:/项目 A"));
    host.set_setting("externalEditorEnabled", "true");
    host.on_process("code", |_, _| Ok(ProcessOutput { status: Some(0), stdout: String::new(), stderr: String::new() }));
    EditorTools.run_command("open-project", &host.invocation(), None).unwrap();
    assert_eq!(host.process_runs()[0].args, ["D:/项目 A"]);
    host.set_setting("externalEditorEnabled", "false");
    assert!(EditorTools.run_command("open-project", &host.invocation(), None).is_err());
    assert_eq!(host.process_runs().len(), 1);
}

#[test]
fn project_and_file_entries_use_the_same_current_position() {
    let host = mock();
    host.set_project_root(Some(r"D:\项目 A"));
    host.set_setting("externalEditorEnabled", "true");
    host.open_editor(r"D:\项目 A\a & b.java", "java", "a\nb\n中文😀abcdef", &[(2, 4, 2, 4)]);
    host.on_process("code", |_, _| Ok(ProcessOutput { status: Some(0), stdout: String::new(), stderr: String::new() }));
    EditorTools.run_command("open-file", &host.invocation(), None).unwrap();
    EditorTools.run_command("open-project", &host.invocation(), None).unwrap();
    let runs = host.process_runs();
    assert_eq!(runs[0].args, ["-g", r"D:\项目 A\a & b.java:3:5"]);
    assert_eq!(runs[1].args, [r"D:\项目 A", "-g", r"D:\项目 A\a & b.java:3:5"]);
    assert_eq!(runs[1].cwd.as_deref(), Some(r"D:\项目 A"));
    assert!(runs.iter().all(|run| run.program == "code" && run.env.is_empty()));

    // 下一次操作重新读取当前文件及位置，不能复用上一次的编辑器快照。
    host.open_editor(r"D:\项目 A\next.java", "java", "next", &[(0, 2, 0, 2)]);
    EditorTools.run_command("open-project", &host.invocation(), None).unwrap();
    assert_eq!(host.process_runs()[2].args, [r"D:\项目 A", "-g", r"D:\项目 A\next.java:1:3"]);
}
