//! 名称库按插件而非按项目存储；这里只接收字段名称，不接收请求或环境值。
use openidea_plugin::{host, Error};
use serde_json::{json, Value};
use std::collections::BTreeMap;

const KEY: &str = "field-names:v1";
type Library = BTreeMap<String, BTreeMap<String, Option<String>>>;

pub fn update(msg: &Value) -> Result<Value, Error> {
    let stored = host::storage::get(KEY)?;
    let mut library: Library = match &stored {
        Some(raw) => serde_json::from_str(raw).map_err(|e| Error::Invalid(e.to_string()))?,
        None => BTreeMap::new(),
    };
    let before = library.clone();
    for kind in ["env", "header", "query", "form", "cookie"] {
        let entries = library.entry(kind.into()).or_default();
        let key = |s: &str| if kind == "header" { s.to_ascii_lowercase() } else { s.to_owned() };
        let defaults: &[&str] = match kind {
            "env" => &["baseUrl", "token"],
            "header" => &["Content-Type", "Accept", "Authorization", "Cookie", "User-Agent"],
            _ => &[],
        };
        for &s in defaults { entries.entry(key(s)).or_insert_with(|| Some(s.into())); }
        for op in ["seed", "learn", "forget"] {
            for name in msg[op][kind].as_array().into_iter().flatten().filter_map(Value::as_str) {
                if name.trim().is_empty() { continue; }
                match op {
                    // 打开旧项目时只补从未出现的名称；已删除的建议不会被旧数据恢复。
                    "seed" => { entries.entry(key(name)).or_insert_with(|| Some(name.into())); }
                    "learn" => { entries.insert(key(name), Some(name.into())); }
                    _ => { entries.insert(key(name), None); }
                }
            }
        }
    }
    if library != before { host::storage::set(KEY, &json!(library).to_string())?; }
    let visible: BTreeMap<_, Vec<_>> = library.iter().map(|(kind, items)|
        (kind, items.values().filter_map(Option::as_ref).collect())).collect();
    Ok(json!(visible))
}
