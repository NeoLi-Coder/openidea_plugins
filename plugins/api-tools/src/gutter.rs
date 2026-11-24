//! 编辑器侧只识别声明行。映射路径、常量、参数和正文仍由工作台原有解析器生成。
use openidea_plugin::language_features::{Document, GutterAction, LanguageFeatures};
use serde_json::json;

struct Token<'a> { text: &'a str, line: u32 }

// 注解实参可能跨行，注释、字符串和文本块中的括号及 @Mapping 不属于声明。
fn tokens(src: &str,kotlin:bool) -> Vec<Token<'_>> {
    let b=src.as_bytes();
    let (mut i,mut line)=(0,0);
    let mut out=Vec::new();
    while i<b.len() {
        let start=i;
        let mut keep=false;
        match b[i] {
            c if c.is_ascii_whitespace()=>{i+=1;}
            b'/' if b.get(i+1)==Some(&b'/')=>{i+=2;while i<b.len()&&b[i]!=b'\n'{i+=1}}
            b'/' if b.get(i+1)==Some(&b'*')=>{
                i+=2;let mut depth=1;
                while i<b.len()&&depth>0 {
                    if b[i..].starts_with(b"*/"){depth-=1;i+=2}
                    else if kotlin&&b[i..].starts_with(b"/*"){depth+=1;i+=2}
                    else{i+=1}
                }
            }
            q @ (b'"'|b'\'')=>{
                let triple=b[i..].starts_with(b"\"\"\"");i+=if triple{3}else{1};
                while i<b.len(){
                    if triple&&b[i..].starts_with(b"\"\"\""){i+=3;break}
                    if !triple&&b[i]==q{i+=1;break}
                    if b[i]==b'\\'&&i+1<b.len(){i+=2}else{i+=1}
                }
            }
            c if word(c)=>{i+=1;while i<b.len()&&word(b[i]){i+=1}keep=true;}
            _=>{i+=1;keep=true;}
        }
        if keep{out.push(Token{text:&src[start..i],line})}
        line+=b[start..i].iter().filter(|&&c|c==b'\n').count() as u32;
    }
    out
}
fn word(c:u8)->bool {c.is_ascii_alphanumeric()||c==b'_'||c==b'$'||c>=128}
fn after_args(t:&[Token],mut i:usize)->usize{
    let mut level=0;
    while i<t.len(){match t[i].text{"("=>level+=1,")"=>level-=1,_=>{}}i+=1;if level==0{break}}
    i
}
#[derive(Default)]
struct Flags {spring:bool, resource:bool, mapping:bool, verb:bool, scheduled:bool}
struct Owner<'a>{name:&'a str,line:u32,spring:bool,resource:bool,marked:bool}

fn marker(owner:&Owner,method:Option<&Token>)->GutterAction{
    let line=method.map_or(owner.line,|m|m.line);
    let tooltip=match method{Some(m)=>format!("在 API 工作台打开 {}.{}",owner.name,m.text),None=>format!("查看 {} 的接口",owner.name)};
    GutterAction{line,icon:Some("icons/lightning.svg".into()),tooltip,command:"open-endpoint".into(),
        argument:Some(json!({"className":owner.name,"classLine":owner.line,"method":method.map(|m|m.text),"line":line}).to_string())}
}
impl LanguageFeatures for super::ApiTools{
    fn gutter_actions(&mut self,doc:&Document)->Vec<GutterAction>{
        if !doc.text.contains("Controller")&&!doc.text.contains("Path")&&!doc.text.contains("Schedule"){return vec![]}
        let t=tokens(&doc.text,doc.language=="kotlin");let at=|i:usize|t.get(i).map_or("",|v|v.text);
        let mut out=Vec::new();let mut scopes:Vec<Option<Owner>>=Vec::new();
        let mut owner=None;let mut flags=Flags::default();let mut i=0;let mut package=String::new();
        while i<t.len(){
            match at(i){
                "package"=>{i+=1;package=at(i).to_owned();while at(i+1)=="."{i+=2;package.push('.');package.push_str(at(i))}}
                "@"=>{
                    i+=1;while at(i+1)=="."{i+=2}
                    match at(i){"Controller"|"RestController"=>flags.spring=true,"Path"=>flags.resource=true,
                        "RequestMapping"|"GetMapping"|"PostMapping"|"PutMapping"|"DeleteMapping"|"PatchMapping"=>flags.mapping=true,
                        "GET"|"POST"|"PUT"|"DELETE"|"PATCH"|"HEAD"|"OPTIONS"=>flags.verb=true,
                        "Scheduled"|"Schedules"=>flags.scheduled=true,_=>{}}
                    i+=1;if at(i)=="("{i=after_args(&t,i)}continue;
                }
                "class"|"interface"|"object"|"record" if i+1<t.len()&&word(t[i+1].text.as_bytes()[0])=>{
                    let name=&t[i+1];owner=Some(Owner{name:name.text,line:name.line,spring:flags.spring,resource:flags.resource,marked:false});
                    flags=Flags::default();
                }
                "{"=>{scopes.push(owner.take());flags=Flags::default()}
                "}"=>{scopes.pop();owner=None;flags=Flags::default()}
                ";"|"="=>{flags=Flags::default()}
                "("=>{
                    if owner.is_none()&&i>0&&word(t[i-1].text.as_bytes()[0]){
                        if flags.scheduled&&at(i+1)==")"&&matches!(scopes.last(),Some(Some(_))){
                            let nested=scopes.iter().flatten().map(|cls|cls.name).collect::<Vec<_>>().join("$");
                            let class=if package.is_empty(){nested}else{format!("{package}.{nested}")};
                            let method=&t[i-1];
                            out.push(GutterAction{line:method.line,icon:Some("icons/lightning.svg".into()),tooltip:format!("立即执行一次定时任务：{}",method.text),
                                command:"run-scheduled".into(),argument:Some(json!({"className":class,"method":method.text}).to_string())});
                        }
                        if let Some(Some(cls))=scopes.last_mut(){
                            if (cls.spring&&flags.mapping)||(cls.resource&&flags.verb){
                                if !cls.marked{out.push(marker(cls,None));cls.marked=true}
                                out.push(marker(cls,Some(&t[i-1])));
                            }
                        }
                    }
                    flags=Flags::default();i=after_args(&t,i);continue;
                }
                _=>{}
            }
            i+=1;
        }
        out
    }
}
