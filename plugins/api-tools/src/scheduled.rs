//! 在当前项目配对的本机 Spring 进程中触发已注册的任务；发现/展示与执行分开，不重试 POST。
use openidea_plugin::{host, Error, Invocation, PickItem};
use serde_json::{json, Value};
struct Target { port: u16, secret: String, job: String, process: String }

// WASM 运行在不同系统上；Windows 盘符和 UNC 路径按不区分大小写的目录边界比较。
fn inside_project(root: &str, path: &str) -> bool {
    if root.is_empty() || path.is_empty() {return false}
    let (mut root,mut path)=(root.replace('\\',"/"),path.replace('\\',"/"));
    if root.as_bytes().get(1)==Some(&b':') || root.starts_with("//") {
        root=root.to_lowercase(); path=path.to_lowercase();
    }
    let root=root.trim_end_matches('/');
    path==root || path.strip_prefix(root).is_some_and(|rest|rest.starts_with('/'))
}

fn local_curl(port: u16, path: &str) -> host::Command {
    let url = format!("http://127.0.0.1:{port}/{path}");
    host::Command::new("curl").args(["-q","--noproxy","*","--silent","--show-error","--proto","=http",
        "--connect-timeout","1","--max-time","3","--url",&url])
}

pub fn trigger(ctx: &Invocation, root: &str, target: &Value) -> Result<Value, Error> {
    let class=super::string(target,"className")?;
    let method=super::string(target,"method")?;
    let dir=host::fs::plugin_dir()?;
    let files=host::fs::read_dir(&dir)?;
    // 老版本已配对的 JVM 可以继续工作，不再生成或要求填写 VM 参数。
    let legacy=host::storage::get(&format!("scheduled-profile:{root}"))?.map(|id|format!("{id}-"));
    let mut targets=Vec::new();
    for file in files {
        let Some(name)=file.name.strip_suffix(".jobs") else {continue};
        let (session,auto)=if let Some(id)=name.strip_prefix("auto-"){(id,true)}
            else if let Some(id)=legacy.as_ref().and_then(|p|name.strip_prefix(p)){(id,false)}
            else{continue};
        let data=match host::fs::read_file(&format!("{dir}/{}",file.name)) {
            Ok(text)=>text,Err(Error::NotFound(_))=>continue,Err(e)=>return Err(e)
        };
        let mut lines=data.lines();
        let Some(port)=lines.next().and_then(|s|s.parse::<u16>().ok()) else{continue};
        let (Some(secret),Some(process))=(lines.next(),lines.next()) else{continue};
        let cwd_matches=auto && lines.next().is_some_and(|cwd|inside_project(root,cwd));
        let jobs:Vec<&str>=lines.filter_map(|line|{
            let mut parts=line.split('\t');let id=parts.next()?;
            (parts.next()==Some(class)&&parts.next()==Some(method)&&id.parse::<usize>().is_ok()
                && (!auto || cwd_matches || parts.next().is_some_and(|origin|inside_project(root,origin)))).then_some(id)
        }).collect();
        if jobs.is_empty(){continue}
        let probe=host::run_command(&local_curl(port,"session"),ctx.project().as_ref(),None)?;
        // 异常退出可能留下旧描述文件；只有当前进程回显相同 session 才可提交。
        if probe.status!=Some(0)||probe.stdout!=session{continue}
        for id in jobs{targets.push(Target{port,secret:secret.into(),job:id.into(),process:process.into()});}
    }
    let label=format!("{class}.{method}");
    if targets.is_empty(){return Ok(json!({"label":label,"state":"setup"}))}
    let index=if targets.len()==1{0}else{
        let items=targets.iter().enumerate().map(|(i,t)|PickItem::new(&i.to_string(),&format!("{} · 任务 {}",t.process,t.job))).collect::<Vec<_>>();
        let Some(choice)=host::pick("选择这次要触发的运行实例",&items)? else{return Ok(json!({"state":"cancelled"}))};
        choice.parse::<usize>().map_err(|_|Error::Invalid("未识别的实例".into()))?
    };
    let t=targets.get(index).ok_or("未识别的实例")?;
    let command=local_curl(t.port,&format!("run/{}",t.job)).args(["--data-binary","@-","--write-out","\n%{http_code}"]);
    let result=host::run_command(&command,ctx.project().as_ref(),Some(&t.secret))?;
    if result.status!=Some(0){return Err("没有收到应用确认。请检查应用控制台，本次不会自动重试。".into())}
    if result.stdout!="accepted\n202"{return Err(format!("应用未接受本次任务（HTTP {}）",result.stdout.lines().last().unwrap_or("?")).into())}
    Ok(json!({"label":label,"state":"accepted","process":t.process}))
}
