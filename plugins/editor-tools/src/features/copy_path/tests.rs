use super::*;
use crate::{EditorTools, test_support::mock};
use openidea_plugin::{Plugin, Position, mock::MockHost};

fn selection(first: u32, column: u32, last: u32, end_column: u32) -> Range {
    Range::new(Position::new(first, column), Position::new(last, end_column))
}

#[test]
fn single_caret_and_half_open_selection() {
    assert_eq!(line_ranges(&[selection(7, 3, 7, 3)]).unwrap(), "8");
    assert_eq!(line_ranges(&[selection(0, 0, 3, 0)]).unwrap(), "1-3");
    assert_eq!(line_ranges(&[selection(0, 0, 3, 1)]).unwrap(), "1-4");
}

#[test]
fn merges_overlapping_adjacent_and_duplicate_ranges() {
    let ranges = [selection(7, 0, 11, 0), selection(4, 0, 6, 0), selection(0, 0, 2, 0), selection(2, 0, 2, 1), selection(0, 0, 1, 0)];
    assert_eq!(line_ranges(&ranges).unwrap(), "1-3,5-6,8-11");
}

#[test]
fn reverse_selection_and_empty_selection_list() {
    assert_eq!(line_ranges(&[selection(3, 0, 0, 2)]).unwrap(), "1-3");
    assert!(line_ranges(&[]).is_err());
}

#[test]
fn windows_relative_path_is_component_bounded_and_case_insensitive() {
    assert_eq!(reference_path(r"D:\Work\项目 A\src\测试.java", Some("d:/work/项目 A/")), r"src\测试.java");
    assert_eq!(reference_path(r"D:\Workspace2\a.java", Some(r"D:\Workspace")), r"D:\Workspace2\a.java");
    assert_eq!(reference_path(r"E:\Work\a.java", Some(r"D:\Work")), r"E:\Work\a.java");
    assert_eq!(reference_path(r"\\SERVER\share\项目\a.java", Some(r"\\server\share\项目")), "a.java");
    assert_eq!(reference_path(r"D:\Work\src\..\a.java", Some(r"D:\Work\.")), "a.java");
    assert_eq!(reference_path(r"D:\Work\..\Other\a.java", Some(r"D:\Work")), r"D:\Other\a.java");
    assert_eq!(reference_path("D:/Work/a.java", None), r"D:\Work\a.java");
}

#[test]
fn posix_paths_remain_case_sensitive_and_root_works() {
    assert_eq!(reference_path("/work/a.rs", Some("/")), "work/a.rs");
    assert_eq!(reference_path("/Work/a.rs", Some("/work")), "/Work/a.rs");
    assert_eq!(reference_path("/work/a.rs", None), "/work/a.rs");
}

#[test]
fn copy_commands_use_current_settings_and_do_not_start_processes() {
    let host = mock();
    host.set_project_root(Some("D:/项目"));
    host.set_setting("copyPathEnabled", "true");
    host.open_editor("D:/项目/a.java", "java", "a\nb\nc\n", &[(0, 0, 2, 0)]);
    assert_eq!(EditorTools.run_command("copy-relative", &host.invocation(), None).unwrap(), None);
    assert_eq!(host.clipboard().as_deref(), Some("a.java#1-2"));
    assert!(EditorTools.run_command("copy-absolute", &host.invocation(), None).is_err());
    host.set_setting("copyAbsolutePathEnabled", "true");
    EditorTools.run_command("copy-absolute", &host.invocation(), None).unwrap();
    assert_eq!(host.clipboard().as_deref(), Some(r"D:\项目\a.java#1-2"));
    host.set_setting("copyPathEnabled", "false");
    assert!(EditorTools.run_command("copy-relative", &host.invocation(), None).is_err());
    EditorTools.run_command("copy-absolute", &host.invocation(), None).unwrap();
    host.set_setting("copyAbsolutePathEnabled", "false");
    assert!(EditorTools.run_command("copy-absolute", &host.invocation(), None).is_err());
    assert_eq!(host.clipboard().as_deref(), Some(r"D:\项目\a.java#1-2"));
    assert!(host.process_runs().is_empty());
    assert!(host.notifications().is_empty());
}

#[test]
fn clipboard_permission_failure_is_not_reported_as_success() {
    let host = MockHost::install().with_capabilities(&["editor.read", "project.read"]);
    host.set_setting("copyAbsolutePathEnabled", "true");
    host.open_editor("D:/a.java", "java", "a", &[(0, 0, 0, 0)]);
    assert!(matches!(EditorTools.run_command("copy-absolute", &host.invocation(), None), Err(Error::Denied(_))));
}
