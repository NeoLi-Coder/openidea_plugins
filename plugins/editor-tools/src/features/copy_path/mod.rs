//! Copy Path Line：编辑器上下文、路径格式化、行号合并和剪贴板写入。

use crate::settings;
use openidea_plugin::{Error, Invocation, Range, host};

mod path;
use path::reference_path;

pub(crate) fn copy_relative(ctx: &Invocation) -> Result<(), Error> {
    copy(ctx, true)
}

pub(crate) fn copy_absolute(ctx: &Invocation) -> Result<(), Error> {
    copy(ctx, false)
}

fn copy(ctx: &Invocation, relative: bool) -> Result<(), Error> {
    // 旧总开关的键保留给相对路径，延续用户此前勾选的状态；绝对路径单独控制。
    if relative {
        settings::require_enabled("copyPathEnabled", "复制相对路径")?;
    } else {
        settings::require_enabled("copyAbsolutePathEnabled", "复制绝对路径")?;
    }
    let editor = ctx.editor().ok_or("请先打开一个文件。")?;
    let path = editor.path();
    let root = if relative {
        ctx.project().map(|project| project.root()).transpose()?
    } else {
        None
    };
    let reference = path_reference(&path, root.as_deref(), &editor.selections()?)?;
    host::copy_to_clipboard(&reference)
}

/// 编辑器选区为半开区间；末端恰好落在下一行第 0 列时不计入该行。
fn line_ranges(selections: &[Range]) -> Result<String, Error> {
    if selections.is_empty() {
        return Err("无法获取当前光标或选区。".into());
    }
    let mut lines: Vec<(u32, u32)> = selections
        .iter()
        .map(|selection| {
            let start = selection.start.min(selection.end);
            let end = selection.start.max(selection.end);
            let last = if end.line > start.line && end.character == 0 {
                end.line - 1
            } else {
                end.line
            };
            (start.line + 1, last + 1)
        })
        .collect();
    lines.sort_unstable();

    let mut merged: Vec<(u32, u32)> = Vec::new();
    for (start, end) in lines {
        if let Some(last) = merged.last_mut() {
            if start <= last.1 + 1 {
                last.1 = last.1.max(end);
                continue;
            }
        }
        merged.push((start, end));
    }
    Ok(merged
        .into_iter()
        .map(|(start, end)| {
            if start == end {
                start.to_string()
            } else {
                format!("{start}-{end}")
            }
        })
        .collect::<Vec<_>>()
        .join(","))
}

fn path_reference(path: &str, root: Option<&str>, selections: &[Range]) -> Result<String, Error> {
    Ok(format!("{}#{}", reference_path(path, root), line_ranges(selections)?))
}

#[cfg(test)]
mod tests;
