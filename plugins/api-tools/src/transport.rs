//! 从结构化请求构建 curl 参数。粘贴的命令永远不交给 shell。
use openidea_plugin::{host,Error,Invocation};
use serde_json::{json,Value};
use crate::string;
fn field<'a>(r:&'a Value,k:&str)->&'a str{r[k].as_str().unwrap_or("")}
fn form_filename(path:&str)->String{format!("\"{}\"",path.replace('\\',"\\\\").replace('"',"\\\""))}
pub fn send(r:&Value,ctx:&Invocation)->Result<Value,Error>{
    let method=string(r,"method")?;
    let url=string(r,"url")?;
    if !url.to_ascii_lowercase().starts_with("http://") && !url.to_ascii_lowercase().starts_with("https://"){return Err("请输入 HTTP 或 HTTPS 地址。".into())}
    if method.is_empty() || !method.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){return Err("HTTP 方法无效。".into())}
    // -q 必须在首位，避免用户 curlrc 的输出/多请求选项改变工作台的结果。
    let mut c=host::Command::new("curl").args(["-q","--silent","--show-error","--globoff","--proto","=http,https","--proto-redir","=http,https"]);
    if method.eq_ignore_ascii_case("HEAD"){c=c.arg("--head")} else {c=c.args(["--request",method])}
    if r["follow"]==true{c=c.arg("--location")}
    if r["compressed"]==true{c=c.arg("--compressed")}
    if let Some(t)=r["timeout"].as_f64(){if t>0.0{c=c.args(["--max-time",&t.to_string()])}}
    for h in field(r,"headers").lines().map(str::trim).filter(|v|!v.is_empty()){
        // --header @file 会读文件，表头只能作为实际的 HTTP 标头传递。
        let name=h.split_once(':').map(|x|x.0).or_else(||h.strip_suffix(';')).ok_or("请求头格式应为 名称: 值")?;
        if name.is_empty()||!name.bytes().all(|b|b.is_ascii_alphanumeric()||b"!#$%&'*+-.^_`|~".contains(&b)){return Err("请求头名称无效。".into())}
        c=c.args(["--header",h]);
    }
    if !field(r,"basic").is_empty(){c=c.args(["--basic","--user",field(r,"basic")])}
    let mode=field(r,"mode");
    let mut stdin=None;
    match mode{
        "raw"|"form"=>{stdin=Some(field(r,"body"));c=c.args(["--data-binary","@-"]);},
        "multipart"=>{for row in r["parts"].as_array().ok_or("缺少表单字段")?{
            let n=string(row,"name")?; let v=string(row,"value")?;
            if n.contains(['=','\r','\n'])||n.is_empty(){return Err("表单字段名无效。".into())}
            if row["file"]==true{
                let mut part=format!("{n}=@{}",form_filename(v));
                if row["uploadToken"].is_string(){
                    let name=string(row,"pickedName")?;
                    if name.is_empty()||name.contains(['\r','\n','\0','/','\\']){return Err("上传文件名无效".into())}
                    part.push_str(&format!(";filename={}",form_filename(name)));
                }
                c=c.args(["--form",&part])
            }else{c=c.args(["--form-string",&format!("{n}={v}")])}
        }},
        "none"=>{},_=>return Err("未知请求体类型。".into())
    }
    let output_file=field(r,"output");
    // 独立的下载操作遇到 HTTP 4xx/5xx 时不把错误页当作附件保存。
    if r["download"]==true && !output_file.is_empty(){c=c.arg("--fail")}
    if !output_file.is_empty(){if output_file=="-"{return Err("请填写保存响应的文件路径。".into())} c=c.args(["--output",output_file]);}
    // 正文走 stdout（或目标文件），最后一跳的响应头和统计走 stderr；
    // 即使正文以 HTTP/ 开头或请求经过重定向，也不会被当作响应头。
    c=c.args(["--write-out","%{stderr}\nneo-response\t%{response_code}\t%{time_total}\t%{size_download}\n%{header_json}","--url",url]);
    let _task=host::begin_task("正在发送 HTTP 请求",true);
    let out=host::run_command(&c,ctx.project().as_ref(),stdin)?;
    let (diagnostics,meta)=out.stderr.split_once("\nneo-response\t").unwrap_or((&out.stderr,""));
    if out.status!=Some(0){return Err(format!("curl 退出状态 {:?}：{}",out.status,diagnostics.trim()).into())}
    let (stats,raw_headers)=meta.trim().split_once('\n').ok_or("无法读取响应头，请使用支持 header_json 的 curl（7.83 或更高）。")?;
    let stats:Vec<_>=stats.trim_end().split('\t').collect();
    if stats.len()!=3{return Err("无法读取 curl 响应状态。".into())}
    let values:std::collections::BTreeMap<String,Vec<String>>=serde_json::from_str(raw_headers.trim()).map_err(|_|Error::Invalid("curl 响应头格式无效。".into()))?;
    let headers:Vec<_>=values.into_iter().flat_map(|(name,vs)|vs.into_iter().map(move|v|format!("{name}: {v}"))).collect();
    let body=if method.eq_ignore_ascii_case("HEAD"){""}else{&out.stdout};
    Ok(json!({"status":stats[0],"seconds":stats[1],"bytes":stats[2],"headers":headers.join("\n"),"body":body,"output":output_file}))
}
