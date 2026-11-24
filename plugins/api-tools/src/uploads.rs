//! 系统文件选择器不给网页绝对路径。仅在发送时把选中文件分片送到宿主私有目录，
//! 每个在途附件占一个槽，curl 结束后清空，可供下一次发送复用。
use std::collections::BTreeMap;
use openidea_plugin::{host, Error, Invocation};
use serde_json::Value;
use crate::{string, transport};

const LIMIT: usize = 16 << 20; // OpenIDEA 1.14 fs.write-bytes 的单次写入上限
const PREFIX: &str = "neo-form-upload-";
#[derive(Default)]
pub struct Uploads { pending: BTreeMap<(String,String), File> }
struct File { slot: usize, size: usize, bytes: Vec<u8>, path: Option<String> }

pub fn recover(dir:&str)->Result<(),Error>{
    for f in host::fs::read_dir(dir)? {
        if f.name.strip_prefix(PREFIX).and_then(|s|s.strip_suffix(".tmp")).and_then(|n|n.parse::<usize>().ok()).is_some(){
            let path=format!("{dir}/{}",f.name);
            if host::fs::stat(&path)?.size>0 {host::fs::write_bytes(&path,&[])?}
        }
    }
    Ok(())
}
impl Uploads {
    pub fn chunk(&mut self,root:&str,m:&Value)->Result<(),Error>{
        let key=(root.to_owned(),string(m,"token")?.to_owned());
        let size=m["size"].as_u64().filter(|n|*n<=LIMIT as u64).ok_or("选择文件最多支持 16 MiB；较大文件请粘贴完整路径")? as usize;
        let offset=m["offset"].as_u64().ok_or("缺少附件偏移")?;
        let hex=string(m,"hex")?.as_bytes();
        if hex.len()%2!=0{return Err("附件分片无效".into())}
        if !self.pending.contains_key(&key){
            if offset!=0{return Err("附件未完整传入，请重新发送".into())}
            let slot=(0..).find(|i|self.pending.values().all(|f|f.slot!=*i)).unwrap();
            self.pending.insert(key.clone(),File{slot,size,bytes:Vec::new(),path:None});
        }
        let f=self.pending.get_mut(&key).unwrap();
        if f.path.is_some()||f.size!=size||offset!=f.bytes.len() as u64||hex.len()/2>size-f.bytes.len(){return Err("附件分片与当前文件不一致".into())}
        let digit=|b:u8|(b as char).to_digit(16).ok_or("无效的附件内容");
        for pair in hex.chunks_exact(2){f.bytes.push(((digit(pair[0])?<<4)|digit(pair[1])?) as u8)}
        Ok(())
    }
    pub fn release(&mut self,root:&str,token:&str)->Result<(),Error>{
        let key=(root.to_owned(),token.to_owned());
        if let Some(path)=self.pending.get(&key).and_then(|f|f.path.as_ref()){host::fs::write_bytes(path,&[])?}
        self.pending.remove(&key); Ok(())
    }
    pub fn send(&mut self,root:&str,req:&Value,ctx:&Invocation)->Result<Value,Error>{
        let mut r=req.clone();
        let mut used=Vec::new();
        let result=(||{
            if let Some(parts)=r["parts"].as_array_mut(){
                for p in parts {
                    if let Some(token)=p["uploadToken"].as_str(){
                        let f=self.pending.get_mut(&(root.to_owned(),token.to_owned())).ok_or("附件未就绪，请重新发送")?;
                        if f.bytes.len()!=f.size{return Err("附件尚未传输完整".into())}
                        used.push(token.to_owned());
                        let path=format!("{}/{PREFIX}{}.tmp",host::fs::plugin_dir()?,f.slot);
                        host::fs::write_bytes(&path,&f.bytes)?;f.path=Some(path.clone());f.bytes=Vec::new();
                        p["value"]=Value::String(path);
                    }
                }
            }
            transport::send(&r,ctx)
        })();
        for token in used { self.release(root,&token)?; }
        result
    }
}
