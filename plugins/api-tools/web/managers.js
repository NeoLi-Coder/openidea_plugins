// 管理窗口使用项目状态的编辑副本；保存才提交，取消、Esc 和关闭都丢弃本次配置改动。
function setupManagers(openRequest){
 const win=$('manager'),titles={saved:'请求收藏',history:'请求历史',env:'环境管理',settings:'公共请求头'};
 let page='',environment='',envDrafts,activeDraft,services,choices;
 const setPairs=(id,label,kind,cb)=>{const el=$(id);el.setAttribute('aria-label',label);return pairEditor(el,kind,cb)};
 const globals=setPairs('globalPairs','公共请求头','header');
 function envData(){const raw=envDrafts.get(environment)||'',lines=raw?raw.split(/\r?\n/):[],index=baseLine(raw);
   return {lines,index,other:lines.filter((_,i)=>i!==index).join('\n'),base:index<0?'':lines[index].slice(lines[index].indexOf('=')+1)}}
 const extras=setPairs('envPairs','环境变量','env',value=>{const {lines,index}=envData(),next=value?value.split(/\r?\n/):[];
   if(index>=0)next.splice(index,0,lines[index]);envDrafts.set(environment,next.join('\n'))});
 function addressParts(){const value=$('baseUrl').value,m=value.match(/^(https?:\/\/(?:\[[^\]]+\]|[^:/?#@]+))(?::(\d+))?(\/[^?#]*)?$/i);
   $('addressParts').hidden=!!value&&!m;['host','port','contextPath'].forEach((k,i)=>$(k).value=m?.[i+1]||'')}
 function storeBase(value){const {index,lines}=envData();
   if(index>=0){if(value)lines[index]=lines[index].slice(0,lines[index].indexOf('=')+1)+value;else lines.splice(index,1)}
   else if(value)lines.unshift('baseUrl='+value);envDrafts.set(environment,lines.join('\n'))}
 $('baseUrl').oninput=()=>{storeBase($('baseUrl').value);addressParts()};
 for(const k of ['host','port','contextPath'])$(k).oninput=()=>{
   const host=$('host').value,port=$('port').value,path=$('contextPath').value;
   $('baseUrl').value=(host&&!host.includes('://')?'http://':'')+host+(port?':'+port:'')+(path&&!path.startsWith('/')?'/':'')+path;storeBase($('baseUrl').value)};
 function serviceRows(){
   const list=services.get(environment)||[],area=$('serviceRows');area.replaceChildren();$('servicesBox').hidden=!$('advancedEnv').checked||!environment;
   list.forEach((service,i)=>{const row=document.createElement('div');row.className='service-row';
     for(const [key,caption,hint] of [['project','项目','项目名'],['name','服务','服务名'],['host','Host','http://localhost'],['port','Port','8080'],['context','ContextPath','/api']]){
       const label=document.createElement('label'),input=document.createElement('input');label.textContent=caption;input.value=service[key]||'';input.placeholder=hint;input.oninput=()=>service[key]=input.value;label.append(input);row.append(label)}
     row.append(iconButton('remove','移除服务',()=>{list.splice(i,1);const n=choices.get(environment);if(n===i)choices.delete(environment);else if(n>i)choices.set(environment,n-1);serviceRows()}));area.append(row)})
 }
 $('advancedEnv').onchange=serviceRows;
 action('addService',()=>{const list=services.get(environment)||[];list.push({project:'',name:'',host:'',port:'',context:''});services.set(environment,list);serviceRows();$('serviceRows').lastElementChild.querySelector('input').focus()});
 function environments(){
   const area=$('envNames');area.replaceChildren();
   for(const name of envDrafts.keys()){const b=button(name,()=>{environment=name;environments()},'env-item');b.setAttribute('aria-current',name===environment);area.append(b)}
   $('deleteEnv').disabled=environment===LOCAL_ENV;$('deleteEnv').title=environment===LOCAL_ENV?'默认环境不能删除':'删除所选环境';
   serviceRows();const {base,other}=envData();$('baseUrl').value=base;
   $('baseUrl').placeholder=environment===LOCAL_ENV?LOCAL_URL:'沿用本地开发：'+(baseValue(envDrafts.get(LOCAL_ENV))||LOCAL_URL);
   addressParts();extras.set(other);
 }
 action('newEnv',async()=>{const name=(await promptText($('newEnv'),'新环境名称'))?.trim();if(!name)return;
   if(envDrafts.has(name))throw Error('已存在同名环境：'+name);
   environment=name;envDrafts.set(name,'');activeDraft=name;$('managerError').textContent='';environments()});
 action('deleteEnv',()=>{envDrafts.delete(environment);services.delete(environment);choices.delete(environment);if(activeDraft===environment)activeDraft=LOCAL_ENV;environment=activeDraft;environments()});
 function records(){
   const saved=page==='saved',data=saved?state.history.filter(item=>item.favorite):state.history,area=$(saved?'collection':'runs'),needle=$(page+'Filter').value.toLowerCase().trim(),folders=new Map();area.replaceChildren();
   for(const item of data){const favorite=item.favorite;
     if(![favorite?.folder,favorite?.name,favorite?.description,historyName(item),item.error,item.r.url,item.r.method].join(' ').toLowerCase().includes(needle))continue;
     let parent=area,name=saved?favorite.name:historyName(item);
     if(saved){const pos=name.lastIndexOf('/'),group=favorite.folder??(pos>0&&!name.includes('://')?name.slice(0,pos):'');if(group){if(favorite.folder===undefined)name=name.slice(pos+1);
       if(!folders.has(group)){const d=document.createElement('details'),s=document.createElement('summary');s.textContent=group;d.open=true;d.append(s);area.append(d);folders.set(group,d)}parent=folders.get(group)}}
     const line=document.createElement('div');line.className='record';const open=button('',()=>{win.close();openRequest(item.r,saved?name:'','',item)},'record-open');
     const heading=document.createElement('strong'),url=document.createElement('small');heading.textContent=name;url.textContent=[!saved&&favorite?'已收藏：'+favorite.name:'',favorite?.description,item.r.url,item.error].filter(Boolean).join(' · ');open.append(methodBadge(item.r.method),heading,url);
     line.append(open,iconButton('save',favorite?'编辑收藏':'收藏请求',()=>{win.close();editFavorite(item,$(page+'Btn'))}),iconButton('remove',saved?'取消收藏':favorite?'删除历史（同时取消收藏）':'删除历史',async()=>{
       if(saved)delete item.favorite;else state.history.splice(state.history.indexOf(item),1);
       historyChanged();await persist();
     }));parent.append(line)}
   if(!area.children.length){area.classList.add('is-empty');area.textContent=needle?'没有匹配的请求':saved?'还没有收藏的请求':'还没有发送记录'}else area.classList.remove('is-empty')
 }
 for(const k of ['saved','history'])$(k+'Filter').oninput=records;
 document.addEventListener('request-history-changed',()=>{if(win.open&&(page==='saved'||page==='history'))records()});
 function open(name){page=name;$('managerError').textContent='';$('managerTitle').textContent=titles[page];for(const k of Object.keys(titles))$(k).hidden=k!==page;
   $('configActions').hidden=!['env','settings'].includes(name);
   if(name==='env'){services=new Map(Object.entries(structuredClone(state.services||{})));choices=new Map(Object.entries(state.serviceChoices||{}));$('advancedEnv').checked=!!state.advancedEnv;envDrafts=new Map(Object.entries(state.envs));activeDraft=state.active;
     environment=activeDraft;environments()}
   else if(name==='settings')globals.set(state.headers||(!state.headersConfigured?'Accept: application/json':''));else{$(page+'Filter').value='';records()}
   showAnchoredDialog(win,$(name+'Btn'));if(name==='history'||name==='saved')$(page+'Filter').focus()}
 action('saveConfig',async()=>{
   if(page==='env'&&!baseValue(envDrafts.get(LOCAL_ENV))){environment=LOCAL_ENV;environments();$('baseUrl').focus();throw Error('请填写本地开发的服务地址')}
   // 环境配置只修改自己的字段，保留发送期间新加入的历史记录。
   const patch=page==='env'?{envs:Object.fromEntries(envDrafts),active:activeDraft,advancedEnv:$('advancedEnv').checked,services:Object.fromEntries(services),serviceChoices:Object.fromEntries(choices),envConfigured:true}:{headers:globals.get(),headersConfigured:true};
   const names=configNames(state,patch);await rpc('save',{state:{...state,...patch}});Object.assign(state,patch);syncEnv();win.close();status('配置已保存');await learnNames(names)});
 for(const id of ['managerClose','cancelConfig'])$(id).onclick=()=>win.close();
 for(const id of Object.keys(titles))action(id+'Btn',()=>open(id));
}
