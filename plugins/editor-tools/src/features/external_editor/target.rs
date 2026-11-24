//! 将宿主的编辑器上下文转换为外部编辑器定位目标，隔离宿主 API 差异。

use openidea_plugin::{Error, Invocation, Position};

pub(super) struct FileTarget {
    pub path: String,
    pub position: Position,
}

impl FileTarget {
    pub fn current(ctx: &Invocation) -> Result<Option<Self>, Error> {
        let Some(editor) = ctx.editor() else { return Ok(None) };
        let selections = editor.selections()?;
        // API 1.14 只传递按文档顺序排列的 from/to，没有主光标索引或 anchor/head。
        // 保留现有的第一选区末端语义；不能把它描述为反向选区的真实光标。
        let position = selections.first().ok_or("无法获取当前光标位置。")?.end;
        Ok(Some(Self { path: editor.path(), position }))
    }
}
