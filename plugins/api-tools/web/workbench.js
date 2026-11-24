const $=s=>document.getElementById(s), pending=new Map();
function rpc(op,fields={}){
 const id=Array.from(crypto.getRandomValues(new Uint32Array(4)),x=>x.toString(16).padStart(8,'0')).join('');return new Promise((resolve,reject)=>{
   pending.set(id,{resolve,reject,text:''});
   try{openidea.postMessage(JSON.stringify({op,id,...fields}))}catch(e){pending.delete(id);reject(e)}
 })
}
openidea.onMessage(raw=>{
 const m=JSON.parse(raw);if(m.op==='browse'){if(!ready)browseRoot=m.root;else if(m.root===root)tab('routes');return}
 if(m.op==='editorRequest'){if(ready&&m.root===root)drainEditorRequests();return}
 const p=pending.get(m.id);if(!p)return;
 p.text+=m.part;if(m.end){pending.delete(m.id);try{const r=JSON.parse(p.text);r.error?p.reject(Error(r.error)):p.resolve(r.value)}catch(e){p.reject(e)}}
});

let root='',ready=false,browseRoot=null,state={envs:{},active:'',headers:'',history:[]},entries=[],scanned=false,scanJob=null;
ensureEnvironment(state);
const verbs=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT'];
function status(message='',bad=false){const el=$('status');el.textContent=message;el.classList.toggle('bad',bad)}
function guard(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>{status(e.message,true);if($('manager').open){$('managerError').textContent=e.message}})}
function action(id,fn){$(id).onclick=guard(fn)}
function button(label,fn,cls=''){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=guard(fn);return b}
function decorate(b,icon,label){b.dataset.icon=icon;b.title=label;b.setAttribute('aria-label',label);b.textContent='';return b}
function iconButton(icon,label,fn){return decorate(button('',fn),icon,label)}
function methodBadge(method){const el=document.createElement('span');el.className='verb';el.textContent=method;if(verbs.includes(method)&&method!=='CONNECT'){el.dataset.icon=method;el.classList.add('badge-icon')}return el}
function options(el,values){el.replaceChildren(...values.map(x=>new Option(x,x)))}
for(const el of document.querySelectorAll('button[data-icon][title]'))el.setAttribute('aria-label',el.title);
// 插件沙箱允许原生 dialog，但禁止提交表单；按钮直接关闭，共用一个结果出口。
const dialog=$('dialog');
$('dialogOK').onclick=()=>dialog.close('ok');
$('dialogCancel').onclick=()=>dialog.close('cancel');
function promptText(trigger,title,value='',multiline=false){
 $('dialogTitle').textContent=title;
 const input=multiline?$('editText'):$('shortText');
 $('shortText').hidden=multiline;$('editText').hidden=!multiline;
 $('dialogTitle').htmlFor=input.id;
 input.value=value;
 dialog.returnValue='cancel'; // Esc 沿用取消语义，不复用上次确定的结果。
 return new Promise(resolve=>{
   dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'?input.value:null),{once:true});
   showAnchoredDialog(dialog,trigger);input.focus();if(!multiline)input.select();
 });
}
$('shortText').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();dialog.close('ok')}};

function persist(){return rpc('save',{state})}
function syncEnv(){options($('activeEnv'),Object.keys(state.envs));$('activeEnv').value=state.active;syncServices()}
$('activeEnv').onchange=guard(async()=>{state.active=$('activeEnv').value;syncServices();await persist()});
function tab(name){for(const b of document.querySelectorAll('[data-tab]')){const selected=b.dataset.tab===name;b.setAttribute('aria-current',selected);$(b.dataset.tab).hidden=!selected}
 if(name==='routes'){if(!scanned&&ready)refresh().catch(e=>status(e.message,true));$('filter').focus()}}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>tab(b.dataset.tab);
function availableServices(){return Object.hasOwn(state.services||{},state.active)?state.services[state.active]:[]}
function chosenService(){return availableServices()[state.serviceChoices?.[state.active]]}
function serviceAddress(s){return s?.host?(!s.host.includes('://')?'http://':'')+s.host+(s.port?':'+s.port:'')+(s.context&&!s.context.startsWith('/')?'/':'')+(s.context||''):''}
function syncServices(){
 const services=availableServices(),project=$('serviceProject'),info=$('serviceInfo'),chosen=chosenService();$('serviceBar').hidden=!state.advancedEnv||!state.active;
 const projects=[...new Set(services.map(s=>s.project))];project.replaceChildren(new Option('默认地址',''),...projects.map((v,i)=>new Option(v||'未命名项目',String(i))));
 project.value=chosen?String(projects.indexOf(chosen.project)):'';const matches=services.map((s,i)=>({s,i})).filter(x=>chosen&&x.s.project===chosen.project);
 info.replaceChildren(...(matches.length?matches.map(({s,i})=>new Option(s.name||serviceAddress(s)||'未命名服务',String(i))):[new Option('—','')]));info.disabled=!matches.length;if(chosen)info.value=String(services.indexOf(chosen));
 project.onchange=guard(async()=>{const i=project.value===''?-1:services.findIndex(s=>s.project===projects[Number(project.value)]);await selectService(i)});
 info.onchange=guard(()=>selectService(Number(info.value)));
 for(const t of tabs)t.refreshAddress();
}
async function selectService(i){const choices=new Map(Object.entries(state.serviceChoices||{}));if(i<0)choices.delete(state.active);else choices.set(state.active,i);state.serviceChoices=Object.fromEntries(choices);syncServices();await persist()}
function vars(){const result=new Map();for(const line of (state.envs[state.active]||'').split(/\r?\n/)){if(!line.trim())continue;const i=line.indexOf('=');if(i<1)throw Error('环境变量须写成 名称=值');result.set(line.slice(0,i).trim(),line.slice(i+1))}result.set('baseUrl',environmentBase());return result}
function materialize(raw){
 const map=vars(),expand=s=>String(s).replace(/\{\{([^{}]+)\}\}/g,(_,k)=>{if(!map.has(k.trim()))throw Error('请填写参数或设置环境变量：'+k);return map.get(k.trim())});
 const r=structuredClone(raw);delete r.rows;delete r.origin;
 // 单次填写的路径值只作用于该 URL 的路径，不改环境、查询串及同名请求头变量。
 const {base}=splitAddress(r.url),start=pathStart(base);
 r.url=base.slice(0,start)+base.slice(start).replace(/\{\{([^{}]+)\}\}/g,(token,name)=>
   Object.hasOwn(r.pathValues||{},name.trim())?encodeURIComponent(r.pathValues[name.trim()]):token)+r.url.slice(base.length);
 r.url=visibleAddress(r.url);
 for(const k of ['url','headers','basic','body'])r[k]=expand(r[k]||'');
 if(r.mode==='multipart')r.parts=r.parts.filter(p=>!(p.file&&p.optional&&!p.pickedName&&!p.value.trim()));
 for(const p of r.parts){p.name=expand(p.name);p.value=p.file&&p.pickedName?p.pickedName:expand(p.value);
   if(r.mode==='multipart'&&p.file&&!p.value.trim())throw Error('请在「正文 → form-data」填写 '+p.name+' 的文件路径')}
 r.headers=[expand(state.headers),r.headers,r.bearer?'Authorization: Bearer '+expand(r.bearer):''].filter(Boolean).join('\n');
 if(!/^https?:\/\//i.test(r.url))throw Error('请填写完整的 HTTP(S) 地址或设置 baseUrl');
 return r;
}
async function refresh(){
 if(scanJob)return scanJob;
 $('refresh').disabled=true;
 scanJob=(async()=>{const data=await discover((i,n)=>status('正在读取接口文件 '+i+' / '+n));entries=data.entries;scanned=true;renderTree();status(entries.length+' 个接口'+(data.limited?'；宿主搜索已达上限，结果不完整':''))})();
 try{return await scanJob}finally{scanJob=null;$('refresh').disabled=false}
}

let selected=null;const tabs=[];let count=0;
function activate(t){status();selected=t;for(const other of tabs){const active=t===other;other.node.hidden=!active;other.tab.setAttribute('aria-selected',active);other.tab.parentNode.classList.toggle('current',active)}
 $('sourceChoices').hidden=true;$('scheduledInfo').hidden=true;
 $('saveBtn').disabled=$('exportBtn').disabled=!t;
 $('locateSource').disabled=$('locateTree').disabled=!t?.origin;
 tab('request');t?.tab.scrollIntoView({block:'nearest',inline:'nearest'})}
function openRequest(r,title='',sourceKey='',record=null){
 const outer=document.createElement('div'),tag=button('',()=>activate(t),'request-tab'),caption=document.createElement('span'),serial=++count;
 const identity=()=>{const addr=t.url.value.trim().split(/[?#]/)[0].replace(/\/$/,'');caption.textContent=title||(t.url.value!==visibleAddress(BASE_TOKEN)&&addr.split('/').pop())||'未命名 '+serial;tag.title=t.method.value+' '+(t.url.value||caption.textContent);tag.replaceChildren(methodBadge(t.method.value),caption)};
 const t=createComposer(r,identity,record);Object.assign(t,{tab:tag,sourceKey,origin:r.origin});tag.setAttribute('role','tab');outer.className='tab-unit';identity();
 const close=button('×',()=>{const index=tabs.indexOf(t);tabs.splice(index,1);outer.remove();t.node.remove();if(t===selected)activate(tabs[Math.min(index,tabs.length-1)]??null)},'tab-close');
 close.title='关闭请求标签';close.setAttribute('aria-label',close.title);outer.append(tag,close);$('tabs').append(outer);$('editors').append(t.node);tabs.push(t);activate(t);return t}
function treeGroup(parent,text,icon,expanded){const group=document.createElement('details'),label=document.createElement('summary'),glyph=document.createElement('i');glyph.dataset.icon=icon;label.append(glyph,document.createTextNode(text));group.append(label);group.open=expanded;parent.append(group);return group}
// 记录声明身份，而不是从可编辑的请求 URL 反推方法；刷新后使用最新源码坐标。
function routeIdentity(e){return JSON.stringify([e.path,e.route.className,e.route.methodName,e.route.httpMethod,e.url])}
const treeButtons=new Map();
async function locateCurrent(inTree){
 const request=selected,origin=request.origin;
 if(!scanned||scanJob)await refresh();
 if(selected!==request)return;
 const matches=entries.filter(e=>routeIdentity(e)===origin.id);
 const entry=matches.length===1?matches[0]:matches.find(e=>e.line===origin.line);
 if(!entry)throw Error('当前接口已不在项目索引中，请刷新接口树后重新选择');
 if(!inTree)return rpc('goto',{path:entry.path,line:entry.line,col:entry.col});
 tab('routes');
 if(!treeButtons.has(entry)){
   const search=[entry.module,entry.route.className,entry.route.methodName,entry.url].join(' ').toLowerCase();
   if(!search.includes($('filter').value.trim().toLowerCase()))$('filter').value='';
   if($('verb').value!==entry.route.httpMethod)$('verb').value='全部';
   renderTree();
 }
 const target=treeButtons.get(entry);
 for(let group=target.closest('details');group;group=group.parentElement.closest('details'))group.open=true;
 target.focus();target.scrollIntoView({block:'nearest'});
}
action('locateSource',()=>locateCurrent(false));action('locateTree',()=>locateCurrent(true));
function renderTree(){
 const area=$('tree'),query=$('filter').value.toLowerCase().trim(),groups=new Map(),modules=new Map();area.replaceChildren();treeButtons.clear();
 for(const e of entries){if(![e.module,e.route.className,e.route.methodName,e.url].join(' ').toLowerCase().includes(query)||($('verb').value!=='全部'&&$('verb').value!==e.route.httpMethod))continue;
  const key=e.path+'::'+e.route.className;if(!modules.has(e.module))modules.set(e.module,treeGroup(area,e.module,'folder',true));if(!groups.has(key))groups.set(key,treeGroup(modules.get(e.module),e.route.className,'class',!!query));
  const row=document.createElement('div');row.className='route';
  const open=button('',()=>openEndpoint(e),'route-open');
  treeButtons.set(e,open);
  const path=document.createElement('span'),name=document.createElement('small');path.textContent=e.url;name.textContent=e.route.methodName;open.append(methodBadge(e.route.httpMethod),path,name);open.title=e.route.className+'.'+e.route.methodName;
  row.append(open,iconButton('locate','定位源码',()=>rpc('goto',{path:e.path,line:e.line,col:e.col})),iconButton('copy','复制接口路径',()=>rpc('copy',{text:e.url})));groups.get(key).append(row)
 }if(!area.children.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=entries.length?'没有匹配的接口':'当前项目未发现接口';area.append(empty)}
}
options($('verb'),['全部',...verbs]);$('filter').oninput=renderTree;$('verb').onchange=renderTree;action('refresh',refresh);
for(const [id,open] of [['expand',true],['collapse',false]])action(id,()=>{for(const d of $('tree').querySelectorAll('details'))d.open=open});
action('newBtn',()=>{openRequest(newDraft()).url.focus()});
const curlMenu=$('curlMenu'),curlMenuBtn=$('curlMenuBtn');
const placeCurlMenu=()=>placeAtTrigger(curlMenu,curlMenuBtn);
curlMenu.addEventListener('toggle',()=>{
 const open=curlMenu.matches(':popover-open');curlMenuBtn.setAttribute('aria-expanded',String(open));
 if(open){placeCurlMenu();window.addEventListener('resize',placeCurlMenu)}else window.removeEventListener('resize',placeCurlMenu);
});
// 菜单关闭后，以仍可见的工具栏入口定位导入弹窗，并作为焦点返回位置。
function closeCurlMenu(){curlMenu.hidePopover();curlMenuBtn.focus()}
action('importBtn',async()=>{closeCurlMenu();const text=await promptText(curlMenuBtn,'导入 cURL','',true);if(text){openRequest(importCurl(text));status('已导入到新标签')}});
action('exportBtn',async()=>{closeCurlMenu();const r=materialize(selected.draft());await rpc('copy',{text:exportCurl(r)});status(r.mode==='multipart'&&r.parts.some(p=>p.pickedName)?'已复制 cURL；选取的附件使用文件名，请在附件所在目录执行或补全路径。':'已复制 cURL')});
let favoriteDraft,favoriteRecord,favoriteComposer;
function favoritePage(base){$('favBase').hidden=!base;$('favRequest').hidden=base;$('baseInfo').setAttribute('aria-current',base);$('reqInfo').setAttribute('aria-current',!base)}
$('baseInfo').onclick=()=>favoritePage(true);$('reqInfo').onclick=()=>favoritePage(false);
function editFavorite(record,trigger,composer=null){
 favoriteComposer=composer;favoriteDraft=composer?composer.draft():record.r;
 favoriteRecord=record&&state.history.includes(record)&&sameRequest(record.r,favoriteDraft)?record:null;
 const favorite=favoriteRecord?.favorite,name=$('favoriteName');name.value=favorite?.name||composer?.tab.lastElementChild.textContent.trim()||favoriteDraft.url;
 favoritePage(true);$('favoriteDesc').value=favorite?.description||'';$('favoriteContext').textContent=favoriteRecord?historyName(favoriteRecord):'未发送';$('favoriteFolder').value=favorite?.folder||'';
 const folders=new Set(state.history.filter(x=>x.favorite).map(x=>x.favorite.folder).filter(Boolean));
 $('folders').replaceChildren(...Array.from(folders,v=>new Option(v)));$('favoritePreview').textContent=favoriteDraft.method+'  '+visibleAddress(favoriteDraft.url);showAnchoredDialog($('favorite'),trigger);name.focus();name.select();
}
action('saveBtn',()=>editFavorite(selected.historyRecord,$('saveBtn'),selected));
action('confirmFavorite',async()=>{
 const name=$('favoriteName').value.trim();if(!name){favoritePage(true);$('favoriteName').focus();return}
 const record=saveFavorite(favoriteDraft,{name,folder:$('favoriteFolder').value.trim(),description:$('favoriteDesc').value},favoriteRecord);
 if(favoriteComposer)favoriteComposer.historyRecord=record;
 $('favorite').close();await persist();await learnNames(requestNames(record.r));status('已收藏：'+name);
});
$('favoriteName').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing)$('confirmFavorite').click()};$('cancelFavorite').onclick=()=>$('favorite').close();
setupManagers(openRequest);
(async()=>{activate(null);status('读取项目…');const data=await rpc('init');root=data.root;$('project').textContent=root.split(/[\\/]/).pop();
 if(data.state)Object.assign(state,JSON.parse(data.state));const migrated=restoreHistory();ensureEnvironment(state);if(migrated)await persist();syncEnv();ready=true;status();drainEditorRequests();if(browseRoot===root||!$('routes').hidden)tab('routes');
 if(data.state)await rpc('nameChoices',{seed:seedNames(state)})})().catch(e=>status(e.message,true));
