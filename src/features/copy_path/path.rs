//! 对齐原插件 PathResolver 的路径语义；WASI 的 Path 不识别 Windows 盘符。

pub(super) fn reference_path(path: &str, root: Option<&str>) -> String {
    let path = path.replace('\\', "/");
    let windows = path.as_bytes().get(1) == Some(&b':') || path.starts_with("//");
    let display = |path: String| if windows { path.replace('/', "\\") } else { path };
    let Some(root) = root else { return display(path) };
    let path = normalize(&path);
    let root = normalize(&root.replace('\\', "/"));
    let prefix = format!("{}/", root.trim_end_matches('/'));
    let matches = path.get(..prefix.len()).is_some_and(|head| {
        if windows {
            head.to_lowercase() == prefix.to_lowercase()
        } else {
            head == prefix
        }
    });
    // 不产生越过内容根的 ../ 路径；项目外文件仍用绝对路径。
    display(if matches { path[prefix.len()..].to_owned() } else { path })
}

/// 原插件相对路径先做词法 normalize，不解析符号链接。
fn normalize(path: &str) -> String {
    let unc = path.starts_with("//");
    let rooted = path.starts_with('/');
    let drive = path.as_bytes().get(1) == Some(&b':');
    // UNC 的服务器／共享名和盘符都不参与 .. 折叠。
    let floor = if unc { 2 } else if drive { 1 } else { 0 };
    let mut parts = Vec::new();
    for part in path.split('/').filter(|part| !part.is_empty() && *part != ".") {
        if part == ".." {
            if parts.len() > floor {
                parts.pop();
            }
        } else {
            parts.push(part);
        }
    }
    let prefix = if unc { "//" } else if rooted { "/" } else { "" };
    format!("{prefix}{}", parts.join("/"))
}
