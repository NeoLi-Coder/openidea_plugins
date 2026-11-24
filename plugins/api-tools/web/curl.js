// cURL 是交换格式，不是脚本。只接受可以表示为单个 HTTP 请求的选项。
const blankRequest=()=>({method:'GET',url:'',headers:'',mode:'none',body:'',parts:[],basic:'',follow:false,compressed:false,timeout:0});
function shellWords(text) {
  const out=[]; let word='',q='',started=false;
  text=text.trim().replace(/\\\r?\n|\^\r?\n/g,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(!q && /\s/.test(c)){if(started){out.push(word);word='';started=false}continue}
    started=true;
    if(!q && (c==="'"||c==='"')){q=c;continue}
    if(q && c===q){q='';continue}
    if(q!=="'" && c==='\\' && (!q || /["\\$\x60]/.test(text[i+1]||''))){if(++i===text.length)throw Error('命令以未完成的转义结尾');word+=text[i];continue}
    if(!q && '|;&<>'.includes(c))throw Error('请只粘贴单个 cURL 请求，不要包含管道、重定向或第二条命令');
    if(q!=="'" && (c==='\x60'||(c==='$'&&/[\w{'(]/.test(text[i+1]||''))))throw Error('请先把 shell 变量或表达式替换为实际值');
    word+=c;
  }
  if(q)throw Error('引号未闭合');
  if(started)out.push(word);
  return out;
}
function importCurl(text) {
  const argv=shellWords(text), r=blankRequest(),headers=[],data=[];let explicit=false,hasUrl=false;
  if(!/^curl(?:\.exe)?$/i.test(argv.shift()||''))throw Error('命令须以 curl 或 curl.exe 开头');
  function setUrl(s){if(hasUrl)throw Error('每次只能导入一个请求地址');hasUrl=true;r.url=s}
  for(let i=0;i<argv.length;i++){
    let a=argv[i],attached=null;
    if(a.startsWith('--') && a.includes('=')){const k=a.indexOf('=');attached=a.slice(k+1);a=a.slice(0,k)}
    else if(/^-[XHFdubm].+/.test(a)){attached=a.slice(2);a=a.slice(0,2)}
    const value=()=>{if(attached!==null)return attached;if(++i>=argv.length)throw Error(a+' 缺少值');return argv[i]};
    switch(a){
    case '--url':setUrl(value());break;
    case '-X':case '--request':r.method=value();explicit=true;break;
    case '-I':case '--head':r.method='HEAD';explicit=true;break;
    case '-H':case '--header':{const h=value();if(h.startsWith('@')||/[\r\n]/.test(h))throw Error('请粘贴实际请求头');headers.push(h);break}
    case '-b':case '--cookie':{const v=value();if(!v.includes('='))throw Error('Cookie 文件请换成明确的键值');headers.push('Cookie: '+v);break}
    case '-u':case '--user':r.basic=value();break;
    case '-A':case '--user-agent':headers.push('User-Agent: '+value());break;
    case '-e':case '--referer':headers.push('Referer: '+value());break;
    case '--json':case '-d':case '--data':case '--data-binary':case '--data-raw':case '--data-ascii':{
      const s=value();if(a!=='--data-raw' && s.startsWith('@'))throw Error('原始数据文件引用不能直接转成文本；请填写正文或选用文件表单');
      data.push(s);if(a==='--json')headers.push('Content-Type: application/json','Accept: application/json');break}
    case '-F':case '--form':case '--form-string':{const s=value(),k=s.indexOf('=');if(k<1)throw Error('表单格式为 name=value');
      let v=s.slice(k+1),file=a!=='--form-string'&&v.startsWith('@');
      const quotedFile=/^@"(?:[^"\\]|\\.)*"$/.test(v);
      if(a!=='--form-string' && (v.startsWith('<')||(!file&&v.includes(';'))||file&&!quotedFile&&/[;,]/.test(v)))throw Error('复合文件表单参数尚不能导入：'+s);
      if(file){v=v.slice(1);if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1).replace(/\\(["\\])/g,'$1')}
      r.parts.push({name:s.slice(0,k),value:v,file});break}
    case '--compressed':r.compressed=true;break;
    case '-L':case '--location':r.follow=true;break;
    case '-m':case '--max-time':{r.timeout=Number(value());if(!Number.isFinite(r.timeout)||r.timeout<0)throw Error('超时时间无效');break}
    case '--basic':case '-s':case '--silent':case '-S':case '--show-error':case '-sS':case '--globoff':case '-g':break;
    default:if(a.startsWith('-'))throw Error('尚不支持导入选项 '+a+'，原请求未改变');setUrl(a)
    }
  }
  if(!hasUrl)throw Error('没有请求地址');
  if(data.length&&r.parts.length)throw Error('一个请求不能同时使用普通正文和 multipart');
  if(data.length){r.body=data.join('&');r.mode=headers.some(h=>/^content-type:\s*(?!application\/x-www-form-urlencoded)/i.test(h.trim().replace(/:\s*/,':')))?'raw':'form'}
  if(r.parts.length)r.mode='multipart';
  if(!explicit&&r.mode!=='none')r.method='POST';
  r.headers=headers.join('\n');return r;
}
function exportCurl(r){
  const quote=s=>"'"+String(s).replaceAll("'","'\\''")+"'";
  const a=['curl','--globoff',r.method==='HEAD'?'--head':'-X',...(r.method==='HEAD'?[]:[quote(r.method)]),quote(r.url)];
  if(r.follow)a.push('--location');if(r.compressed)a.push('--compressed');if(r.timeout)a.push('--max-time',quote(r.timeout));
  for(const h of r.headers.split(/\r?\n/).filter(Boolean))a.push('-H',quote(h));
  if(r.basic)a.push('--user',quote(r.basic));
  if(r.mode==='raw'||r.mode==='form')a.push('--data-raw',quote(r.body));
  if(r.mode==='multipart')for(const p of r.parts)a.push(p.file?'--form':'--form-string',quote(p.name+'='+(p.file?'@"'+p.value.replace(/(["\\])/g,'\\$1')+'"':p.value)));
  return a.join(' ');
}
