// 只提交键名；识别方式与各编辑器一致，批量编辑也走同一条收录路径。
function savedNames(kind,text){
 const format=fieldFormats[kind],parts=(text||'').split(kind==='query'||kind==='form'?'&':kind==='cookie'?/;\s*/:/\r?\n/);
 return parts.flatMap(part=>{
   const i=part.indexOf(format.sep);
   if(i<0&&format.lines&&!(kind==='header'&&part.endsWith(';')))return [];
   const raw=i>=0?part.slice(0,i):kind==='header'?part.slice(0,-1):part;
   const name=format.lines?raw.trim():readCell(raw,format);return name.trim()?[name]:[];
 });
}
function requestNames(r){
 const headers=(r.headers||'').split(/\r?\n/);
 return {header:savedNames('header',r.headers),query:savedNames('query',splitAddress(r.url).query),
   form:r.mode==='form'?savedNames('form',r.body):r.mode==='multipart'?(r.parts||[]).map(p=>p.name).filter(Boolean):[],
   cookie:headers.filter(h=>/^cookie\s*:/i.test(h)).flatMap(h=>savedNames('cookie',h.slice(h.indexOf(':')+1)))};
}
function seedNames(project){
 const names={env:Object.values(project.envs).flatMap(text=>savedNames('env',text)),header:savedNames('header',project.headers)};
 for(const {r} of project.history)for(const [kind,keys] of Object.entries(requestNames(r)))(names[kind]??=[]).push(...keys);
 return Object.fromEntries(Object.entries(names).map(([k,v])=>[k,[...new Set(v)]]));
}
function configNames(state,patch){
 const added=(kind,text,old)=>{const key=s=>kind==='header'?s.toLowerCase():s,existing=new Set(savedNames(kind,old).map(key));
   return savedNames(kind,text).filter(s=>!existing.has(key(s)))};
 return patch.envs?{env:Object.entries(patch.envs).flatMap(([env,text])=>added('env',text,Object.hasOwn(state.envs,env)?state.envs[env]:''))}:
   {header:added('header',patch.headers,state.headers)};
}
const learnNames=names=>Object.values(names).some(list=>list.length)?rpc('nameChoices',{learn:names}):undefined;

// 同一时间只展示当前输入框的候选。每次展开都读取共享库，其他项目的改动无需重启。
let nextChoiceId=0;
function nameInput(input,kind){
 const cell=document.createElement('div'),toggle=document.createElement('button'),menu=document.createElement('div');
 cell.className='name-cell';toggle.type='button';toggle.textContent='▾';toggle.tabIndex=-1;toggle.className='choice-toggle';
 toggle.title='显示名称选项';toggle.setAttribute('aria-label',toggle.title);
 menu.className='name-menu';menu.popover='manual';menu.id='name-choices-'+(++nextChoiceId);menu.setAttribute('role','grid');menu.setAttribute('aria-label','共享名称选项');
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','grid');input.setAttribute('aria-controls',menu.id);input.setAttribute('aria-expanded','false');
 let generation=0,active=-1,available=[],shown=[],filter='',listening=false;
 const visible=()=>menu.matches(':popover-open');
 function place(){if(visible()){menu.style.width=Math.min(innerWidth-12,Math.max(176,cell.getBoundingClientRect().width))+'px';placeAtTrigger(menu,cell,210)}}
 function trackScroll(event){if(!menu.contains(event.target))place()}
 function close(){generation++;if(visible())menu.hidePopover();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;
   listening=false;window.removeEventListener('resize',place);window.removeEventListener('scroll',trackScroll,true)}
 function use(name){input.value=name;input.dispatchEvent(new Event('input',{bubbles:true}));close()}
 async function forget(name){
   const turn=generation,all=await rpc('nameChoices',{forget:{[kind]:[name]}});
   if(turn===generation){available=all[kind];render()}
 }
 function highlight(index){active=index;Array.from(menu.children).forEach((row,i)=>row.setAttribute('aria-selected',i===index));
   if(index<0){input.removeAttribute('aria-activedescendant');return}
   const row=menu.children[index];input.setAttribute('aria-activedescendant',row.id);row.scrollIntoView({block:'nearest'})}
 function render(){
   shown=available.filter(s=>s.toLowerCase().includes(filter.toLowerCase()));menu.replaceChildren();highlight(-1);
   if(!shown.length){if(visible())menu.hidePopover();input.setAttribute('aria-expanded','false');return}
   for(const [i,name] of shown.entries()){
     const row=document.createElement('div'),label=document.createElement('span'),tools=document.createElement('span'),del=document.createElement('button');
     row.setAttribute('role','row');row.id=menu.id+'-'+i;label.setAttribute('role','gridcell');tools.setAttribute('role','gridcell');label.textContent=name;label.title=name;
     del.type='button';del.tabIndex=-1;del.textContent='×';del.title='从共享选项中删除 '+name;del.setAttribute('aria-label',del.title);
     del.onclick=guard(e=>{e.stopPropagation();return forget(name)});row.onclick=e=>{if(!del.contains(e.target))use(name)};
     tools.append(del);row.append(label,tools);menu.append(row);
   }
   if(!visible())menu.showPopover();input.setAttribute('aria-expanded','true');place()
 }
 async function open(){
   const turn=++generation;listening=true;filter='';available=[];
   window.addEventListener('resize',place);window.addEventListener('scroll',trackScroll,true);
   const all=await rpc('nameChoices');if(turn===generation&&input===document.activeElement){available=all[kind];render()}
 }
 input.addEventListener('focus',guard(open));input.addEventListener('blur',close);
 input.addEventListener('click',()=>{if(!listening)guard(open)()});
 input.addEventListener('input',()=>{if(listening){filter=input.value;render()}});
 input.addEventListener('keydown',e=>{
   if(e.isComposing||e.ctrlKey||e.metaKey)return;
   if(e.key==='Escape'&&visible()){e.preventDefault();e.stopPropagation();close();return}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){
     if(!visible()){if(!listening){e.preventDefault();guard(open)()}return}
     e.preventDefault();highlight(active<0?(e.key==='ArrowDown'?0:shown.length-1):(active+(e.key==='ArrowDown'?1:-1)+shown.length)%shown.length);
   }else if(visible()&&active>=0){
     if(e.key==='Enter'){e.preventDefault();use(shown[active])}
     if(e.key==='Delete'&&e.shiftKey){e.preventDefault();guard(()=>forget(shown[active]))()}
   }
 });
 toggle.onmousedown=menu.onmousedown=e=>e.preventDefault();toggle.onclick=()=>{if(visible())close();else if(input===document.activeElement)guard(open)();else input.focus()};
 cell.append(input,toggle,menu);return cell;
}
