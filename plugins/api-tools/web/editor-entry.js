// 无论从行号栏还是接口树进入，都复用同一请求标签，不覆盖编辑中的参数。
async function openEndpoint(e){
 const key=[e.path,e.line,e.route.httpMethod,e.url].join('|'),find=()=>tabs.find(t=>t.sourceKey===key);
 let existing=find();if(existing){activate(existing);return}
 const r=await draftFrom(e);r.origin={id:routeIdentity(e),line:e.line};
 existing=find();if(existing)activate(existing);else openRequest(r,e.route.methodName,key);
}
function showScheduled(info){
 const setup=info.state==='setup';$('sourceChoices').hidden=true;status();
 $('scheduledTitle').textContent=(setup?'尚未连接 · ':'已提交一次 · ')+info.label;
 $('scheduledNote').textContent=setup
   ?'没有找到运行此任务的本地服务。首次使用，请在「设置 → 插件 → Neo API 工具」允许 java.agent，再用 Spring Boot 或 Application 配置重新启动服务。等应用就绪后再点闪电。'
   :'运行实例：'+info.process+'。执行结果请看该应用的控制台。';
 $('scheduledInfo').hidden=false;
}
async function fromEditor({path,target,scheduled}){
 if(scheduled){showScheduled(scheduled);return}
 $('scheduledInfo').hidden=true;
 const text=await rpc('editorSource',{path}),resolved=await fileEntries(path,text,new constants.ConstantPool(projectReader));
 // 用声明坐标区分重载和嵌套类，不按 URL 或方法名猜测。
 let choices=resolved.filter(e=>e.route.className===target.className);
 if(target.method!==null)choices=choices.filter(e=>e.route.methodName===target.method&&e.line===target.line);
 else if(choices.length){
   const cls=source.allClasses(choices[0].file).find(c=>c.name===target.className&&text.slice(0,c.nameStart).split('\n').length-1===target.classLine);
   const offsets=new Set(cls?.methods.map(m=>m.nameStart));choices=choices.filter(e=>offsets.has(e.route.offset));
 }
 tab('request');$('sourceChoices').hidden=true;
 if(!choices.length)throw Error('当前声明没有可打开的接口。若刚修改了源码，请点击更新后的闪电。');
 if(choices.length===1)return openEndpoint(choices[0]);
 const list=$('sourceList');list.replaceChildren();$('sourceTitle').textContent='选择接口 · '+[target.className,target.method].filter(Boolean).join('.');
 for(const e of choices){const b=button('',()=>openEndpoint(e),'route-open'),url=document.createElement('span'),method=document.createElement('small');
   url.textContent=e.url;method.textContent=e.route.methodName;b.append(methodBadge(e.route.httpMethod),url,method);list.append(b)}
 $('sourceChoices').hidden=false;list.firstElementChild.focus();
}
let delivery=Promise.resolve();
function drainEditorRequests(){
 delivery=delivery.then(async()=>{for(const item of await rpc('editorRequests')){
   try{await fromEditor(item)}catch(error){status(error.message,true)}
 }}).catch(error=>status(error.message,true));
}
document.getElementById('dismissSources').onclick=()=>document.getElementById('sourceChoices').hidden=true;
document.getElementById('dismissScheduled').onclick=()=>$('scheduledInfo').hidden=true;
