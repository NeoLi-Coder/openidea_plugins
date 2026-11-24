//! 工作台与宿主之间的桥。接口解析和编辑都在本地；只有 send 操作会发送请求。
mod transport;
mod uploads;
mod names;
mod gutter;
mod scheduled;
use openidea_plugin::{host, views::{Body,View,ViewEvent,Viewport,Views}, Error,Invocation,Plugin, TextQuery,register_plugin};
use serde_json::{json,Value};
use std::collections::{BTreeMap,BTreeSet};
const VIEW:&str="workspace";
#[derive(Default)]
struct ApiTools {
    uploads:uploads::Uploads,
    // 第一次点击时 iframe 可能还未加载，待工作台就绪后领取；不写项目配置。
    editor_requests:BTreeMap<String,Vec<Value>>,
}
impl Plugin for ApiTools {
    fn activate(&mut self,_:&openidea_plugin::Context)->Result<(),Error>{
        // 首次启动 JVM 前由宿主创建用户专属目录；Java 端不自行创建共享目录。
        uploads::recover(&host::fs::plugin_dir()?)
    }
    fn run_command(&mut self,id:&str,ctx:&Invocation,arg:Option<&str>)->Result<Option<String>,Error>{
        if id=="open-endpoint"||id=="run-scheduled" {
            let target:Value=serde_json::from_str(arg.ok_or("请点击接口声明行左侧的闪电。")?).map_err(|e|Error::Invalid(e.to_string()))?;
            let root=ctx.project().ok_or("请在项目窗口中使用 API 工具。")?.root()?;
            let path=ctx.editor().ok_or("没有关联的源码编辑器。")?.path();
            // 任务只在本次点击中执行，队列传递的是结果，重新打开面板不会补跑。
            let item=if id=="run-scheduled" {
                let info=scheduled::trigger(ctx,&root,&target)?;
                if info["state"]=="cancelled"{return Ok(None)}
                json!({"scheduled":info})
            }else{json!({"path":path,"target":target})};
            host::reveal_view(VIEW)?;
            self.editor_requests.entry(root.clone()).or_default().push(item);
            host::post_view_message(VIEW,&json!({"op":"editorRequest","root":root}).to_string())?;
            return Ok(None)
        }
        if id!="browse" {return Err(Error::NotFound(id.into()))}
        host::reveal_view(VIEW)?;
        if let Some(project)=ctx.project(){
            host::post_view_message(VIEW,&json!({"op":"browse","root":project.root()?}).to_string())?;
        }
        Ok(None)
    }
}
fn string<'a>(msg:&'a Value,key:&str)->Result<&'a str,Error>{
    msg[key].as_str().ok_or_else(||Error::Invalid(format!("缺少字段：{key}")))
}
fn dispatch(msg:&Value,ctx:&Invocation,plugin:&mut ApiTools)->Result<Value,Error>{
    let project=ctx.project().ok_or("请在项目窗口中使用 API 工具。")?;
    let root=project.root()?;
    let state_key=format!("workspace:{root}");
    match string(msg,"op")? {
        "init"=>Ok(json!({"root":root,"state":host::storage::get(&state_key)?})),
        "editorRequests"=>Ok(json!(plugin.editor_requests.remove(&root).unwrap_or_default())),
        "editorSource"=>Ok(json!(project.read_file(string(msg,"path")?)?)),
        "nameChoices"=>names::update(msg),
        "save"=>{host::storage::set(&state_key,&msg["state"].to_string())?; Ok(Value::Null)},
        "scan"=>{
            let found=project.search_text(&TextQuery{
                pattern:r"@([\w$.]+\.)?(RestController|Controller|Path)\b".into(), regex:true,case_sensitive:true,
                include:vec!["**/*.java".into(),"**/*.kt".into()],..Default::default()
            },10_000)?;
            let paths:BTreeSet<_>=found.matches.into_iter().map(|m|m.location.path).collect();
            Ok(json!({"paths":paths,"limited":found.limit_hit}))
        },
        "read"=>{let path=string(msg,"path")?;
            if !project.exists(path)?{return Ok(Value::Null)}
            Ok(json!(project.read_file(path)?))
        },
        "named"=>Ok(json!(project.find_files(&format!("**/{}",string(msg,"name")?),10_000)?)),
        "goto"=>{host::open_location(string(msg,"path")?,msg["line"].as_u64().unwrap_or(0) as u32,msg["col"].as_u64().unwrap_or(0) as u32)?; Ok(Value::Null)},
        "copy"=>{host::copy_to_clipboard(string(msg,"text")?)?; Ok(Value::Null)},
        "downloadFolder"=>Ok(json!(host::pick_directory("选择下载目录",None)?)),
        "uploadChunk"=>{plugin.uploads.chunk(&root,msg)?;Ok(Value::Null)},
        "releaseUpload"=>{plugin.uploads.release(&root,string(msg,"token")?)?;Ok(Value::Null)},
        "send"=>plugin.uploads.send(&root,&msg["request"],ctx),
        other=>Err(Error::Invalid(format!("未知工作台操作：{other}")))
    }
}
impl Views for ApiTools {
    fn render(&mut self,_:&str,_:Option<Viewport>,_:&Invocation)->Result<View,Error>{
        Ok(View::new(Body::Html(include_str!("../web/generated/workbench.html").into())))
    }
    fn handle(&mut self,_:&str,event:ViewEvent,ctx:&Invocation)->Result<(),Error>{
        let ViewEvent::Message(raw)=event else{return Ok(())};
        let msg:Value=serde_json::from_str(&raw).map_err(|e|Error::Invalid(e.to_string()))?;
        let result=match dispatch(&msg,ctx,self){Ok(v)=>json!({"value":v}),Err(e)=>json!({"error":e.to_string()})};
        // 宿主按视图广播；随机调用 ID 让多个窗口只接收自己的回复。大正文分片交付。
        let serialized=result.to_string();
        let mut start=0;
        while start<serialized.len(){
            let mut end=(start+512*1024).min(serialized.len());
            while !serialized.is_char_boundary(end){end-=1}
            host::post_view_message(VIEW,&json!({"id":msg["id"],"part":&serialized[start..end],"end":end==serialized.len()}).to_string())?;
            start=end;
        }
        Ok(())
    }
}
register_plugin!(ApiTools,views,language_features);
