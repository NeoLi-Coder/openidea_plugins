// 每个标签独占一套编辑控件和响应。切换只改变可见性；异步回包不会写到别的标签。
function createComposer(r, onTitle, historyRecord=null){
 const node=$('editor').content.firstElementChild.cloneNode(true),q=id=>node.querySelector('[data-id="'+id+'"]');
 const all=sel=>Array.from(node.querySelectorAll(sel));
 const pairs=(id,label,kind,change)=>{q(id).setAttribute('aria-label',label);return pairEditor(q(id),kind,change)};
 const method=q('method'),url=q('url'),body=q('body'),auth=q('auth'),paths=new Map(Object.entries(r.pathValues||{}));
 let address=r.url,shownBase='';
 function renderAddress(){shownBase=usesBase(address)?visibleAddress(BASE_TOKEN):'';url.value=visibleAddress(address)}
 options(method,verbs.includes(r.method)?verbs:[...verbs,r.method]);method.value=r.method;renderAddress();
 method.onchange=()=>onTitle();const query=pairs('queryPairs','查询参数','query',value=>{const {base,suffix}=splitAddress(address);address=base+(value?'?'+value:'')+suffix;renderAddress();onTitle()});
 const headers=pairs('headerPairs','请求头','header'),form=pairs('formPairs','表单字段','form',value=>body.value=value);
 headers.set(r.headers,r.rows?.headers);query.set(splitAddress(r.url).query,r.rows?.query);form.set(r.body,r.rows?.form);
 function pathFields(){
   const {base}=splitAddress(address),names=new Set(Array.from(base.slice(pathStart(base)).matchAll(/\{\{([^{}]+)\}\}/g),m=>m[1].trim()));
   q('paths').hidden=!names.size;q('pathRows').replaceChildren();
   for(const k of paths.keys())if(!names.has(k))paths.delete(k);
   for(const k of names){const label=document.createElement('label'),input=document.createElement('input');label.textContent=k;input.placeholder='填值或使用环境变量';input.value=paths.get(k)||'';
     input.oninput=()=>input.value?paths.set(k,input.value):paths.delete(k);label.append(input);q('pathRows').append(label)}
 }
 url.oninput=()=>{const typed=url.value,suffix=typed.slice(shownBase.length);
   address=shownBase&&typed.startsWith(shownBase)&&(!suffix||/^[/?#]/.test(suffix))?BASE_TOKEN+suffix:typed;
   if(!usesBase(address))shownBase='';
   query.set(splitAddress(address).query);pathFields();onTitle()};
 url.onblur=()=>{renderAddress();onTitle()};pathFields();
 // Cookies 是请求头的另一种编辑视图，不重写其他头，也不合并导入的多条 Cookie。
 function cookies(){
   const lines=headers.get()?headers.get().split(/\r?\n/):[],area=q('cookieRows');area.replaceChildren();
   const indices=lines.flatMap((v,i)=>/^cookie\s*:/i.test(v)?[i]:[]);if(!indices.length)indices.push(lines.length);
   for(const i of indices){const el=document.createElement('div');el.setAttribute('aria-label','Cookie');area.append(el);
     const prefix=lines[i]?.match(/^cookie\s*:\s*/i)?.[0]||'Cookie: ';
     const table=pairEditor(el,'cookie',value=>{lines[i]=value?prefix+value:null;headers.set(lines.filter(v=>v!==null).join('\n'))});
     table.set(lines[i]?.slice(prefix.length)||'')}
 }
 auth.value=r.basic?'Basic':r.bearer?'Bearer':'无';const basic=r.basic||'',colon=basic.indexOf(':');
 q('basicUser').value=colon<0?basic:basic.slice(0,colon);q('basicPassword').value=colon<0?'':basic.slice(colon+1);q('credential').value=r.bearer||'';
 auth.onchange=()=>{q('basicFields').hidden=auth.value!=='Basic';q('bearerField').hidden=auth.value!=='Bearer'};auth.onchange();
 q('timeout').value=r.timeout??0;q('follow').checked=!!r.follow;q('compressed').checked=!!r.compressed;
 const parts=structuredClone(r.parts||[]),picked=new WeakMap();let mode=r.mode;body.value=r.body||'';
 function partRow(p){const row=document.createElement('div');row.className='part';const n=document.createElement('input'),v=document.createElement('input'),type=document.createElement('select');
   options(type,['文本','文件']);type.value=p.file?'文件':'文本';type.setAttribute('aria-label','字段类型');n.placeholder='名称';n.setAttribute('aria-label','字段名称');n.value=p.name;v.value=p.value;
   const chooser=document.createElement('input'),browse=document.createElement('button'),field=document.createElement('div');
   chooser.type='file';chooser.multiple=!!p.multiple;chooser.hidden=true;browse.type='button';browse.textContent='选择文件';browse.onclick=()=>chooser.click();
   field.className='file-value';field.append(v,browse,chooser);
   function display(){const file=picked.get(p);v.value=file?file.name:p.value;
     v.placeholder=p.file?(p.pickedName?'重新选择：'+p.pickedName:'也可粘贴完整路径'):'值';v.title=file?.name||v.placeholder;
     v.setAttribute('aria-label',p.file?'文件名称或完整路径':'值');browse.hidden=!p.file}
   function updateValue(){picked.delete(p);delete p.pickedName;p.value=v.value;display();if(p.file&&p.value.trim())status()}
   function selectFile(part,file){picked.set(part,file);part.value='';part.pickedName=file.name}
   chooser.onchange=guard(()=>{const files=Array.from(chooser.files);chooser.value='';if(!files.length)return;
     if(files.some(f=>f.size>pickedLimit))throw Error('选择文件支持单个 16 MiB 以内的附件；较大文件请粘贴完整路径发送。');
     selectFile(p,files[0]);display();status();
     for(const file of files.slice(1)){const next={...p};selectFile(next,file);parts.push(next);partRow(next)}
   });
   type.onchange=()=>{p.file=type.value==='文件';if(!p.file&&p.pickedName){picked.delete(p);delete p.pickedName;p.value=''}display()};display();n.oninput=()=>p.name=n.value;v.oninput=updateValue;
   // 资源管理器「复制文件地址」可能带双引号，多选时每行一个；集合参数按同名字段发送。
   v.onpaste=e=>{if(!p.file)return;const raw=e.clipboardData?.getData('text/plain');if(!raw)return;
     const paths=raw.trim().split(/\r?\n/).map(line=>line.trim().replace(/^"(.*)"$/,'$1'));
     if(!paths.every(path=>/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(path))||paths.length>1&&!p.multiple)return;
     e.preventDefault();v.value=paths[0];updateValue();for(const value of paths.slice(1)){const next={...p,value};parts.push(next);partRow(next)}};
   row.append(nameInput(n,'form'),type,field,iconButton('remove','移除字段',()=>{parts.splice(parts.indexOf(p),1);row.remove()}));q('parts').append(row);return n}
 parts.forEach(partRow);q('addPart').onclick=()=>{const p={name:'',value:'',file:false};parts.push(p);partRow(p).focus()};
 function setMode(name){mode=name;for(const b of all('[data-mode]'))b.setAttribute('aria-pressed',b.dataset.mode===name);
   body.hidden=name!=='raw';q('multipart').hidden=name!=='multipart';q('formPairs').hidden=name!=='form';if(name==='form')form.set(body.value)}
 for(const b of all('[data-mode]'))b.onclick=()=>setMode(b.dataset.mode);setMode(mode);
 function pane(name){for(const b of all('[data-pane]'))b.setAttribute('aria-current',b.dataset.pane===name);
   for(const p of all('[data-panel]'))p.hidden=p.dataset.panel!==name;if(name==='cookies')cookies()}
 for(const b of all('[data-pane]'))b.onclick=()=>pane(b.dataset.pane);
 pane(mode==='multipart'||mode!=='none'&&q('paths').hidden&&!splitAddress(url.value).query?'body':'params');
 function draft(){const d=Object.assign(blankRequest(),{method:method.value,url:address.trim(),mode,body:body.value,headers:headers.get(),parts:structuredClone(parts),
   timeout:Number(q('timeout').value),follow:q('follow').checked,compressed:q('compressed').checked});
   const rows={query:query.metadata(),headers:headers.metadata(),form:form.metadata()};if(Object.values(rows).some(a=>a.length))d.rows=rows;
   if(paths.size)d.pathValues=Object.fromEntries(paths);if(auth.value==='Bearer')d.bearer=q('credential').value;
   if(auth.value==='Basic'){const u=q('basicUser').value,p=q('basicPassword').value;if(u||p||basic===':')d.basic=p||basic.includes(':')?u+':'+p:u}
   if(r.origin)d.origin=r.origin;
   if(r.downloadName)d.downloadName=r.downloadName;
   return d}
 let detail='body',response=null,doing=false;
 function showView(name){for(const b of all('[data-view]')){const active=b.dataset.view===name;b.setAttribute('aria-current',active);q(b.dataset.view).hidden=!active}}
 for(const b of all('[data-view]'))b.onclick=()=>showView(b.dataset.view);showView('result');
 function showDetail(name){detail=name;for(const b of all('[data-detail]'))b.setAttribute('aria-pressed',b.dataset.detail===detail);
   const val=name==='head'?response.headers:response.output?'已写入 '+response.output:response.body;q('response').textContent=val??'';
   q('pretty').hidden=name!=='body'||!!response.output||!response.body}
 for(const b of all('[data-detail]'))b.onclick=()=>showDetail(b.dataset.detail);
 q('pretty').onclick=()=>{try{q('response').textContent=JSON.stringify(JSON.parse(q('response').textContent),null,2)}catch{status('当前响应正文不是有效的 JSON',true)}};
 q('wrap').onclick=()=>{q('response').classList.toggle('nowrap');q('wrap').setAttribute('aria-pressed',!q('response').classList.contains('nowrap'))};
 q('copy').onclick=guard(()=>rpc('copy',{text:q('response').textContent}));
 function log(s){q('console').textContent+=(q('console').textContent?'\n':'')+new Date().toLocaleTimeString()+'   '+s;q('console').scrollTop=q('console').scrollHeight}
 const download=q('download'),sendButton=q('send'),primary=r.downloadName?download:sendButton;
 download.classList.toggle('primary',!!r.downloadName);sendButton.classList.toggle('primary',!r.downloadName);primary.title+=' (Ctrl+Enter)';
 async function send(wantFile){if(doing)return;if(!ready)throw Error('请先打开项目');
   const original=draft(),outgoing=structuredClone(original),files=new Map();
   if(mode==='multipart')parts.forEach((part,i)=>{if(!part.pickedName)return;
     const file=picked.get(part);if(!file)throw Error('请重新选择附件：'+part.pickedName);
     const token=Array.from(crypto.getRandomValues(new Uint32Array(4)),v=>v.toString(16).padStart(8,'0')).join('');
     outgoing.parts[i].uploadToken=token;files.set(token,file)});
   const request=materialize(outgoing);request.output=q('output').value.trim();
   if(wantFile||request.output){const path=await chooseDownload(wantFile?download:sendButton,request.output,r.downloadName||'响应文件');if(!path)return;request.output=path;request.download=wantFile}
   doing=true;download.disabled=sendButton.disabled=true;q('metrics').textContent='等待响应…';q('metrics').removeAttribute('data-tone');
   q('empty').hidden=false;q('empty').textContent='等待服务器响应…';q('received').hidden=true;log('发送 '+original.method+' 请求');
   let record=null,failure=null;
   try{
     response=await sendWithFiles(request,files,()=>{
       // 附件准备完毕、提交发送时立即留档；失败或取消也更新同一条历史。
       record=historyRecord&&!historyRecord.startedAt&&!historyRecord.name&&state.history.includes(historyRecord)&&sameRequest(historyRecord.r,original)?historyRecord:{r:original};
       record.startedAt=new Date().toISOString();historyRecord=record;
       const index=state.history.indexOf(record);if(index>=0)state.history.splice(index,1);
       state.history.unshift(record);historyChanged();
       persist().catch(e=>status('历史保存失败：'+e.message,true));
     });
     record.status=response.status;
     const metrics='HTTP '+response.status+' · '+Number(response.seconds)+' s · '+response.bytes+' B';
     q('metrics').textContent=metrics;q('metrics').dataset.tone=Number(response.status)>=400?'error':'ok';log(metrics);
     q('empty').hidden=true;q('received').hidden=false;showDetail('body');
   }catch(e){failure=e;if(record)record.error=e.message;q('metrics').textContent='发送失败';q('metrics').dataset.tone='error';q('empty').textContent=e.message;log('请求失败，请在响应面板查看详情')}
   finally{doing=false;download.disabled=sendButton.disabled=false}
   if(record){historyChanged();await persist();await learnNames(requestNames(original))}
   if(failure)throw failure;
 }
 sendButton.onclick=guard(()=>send(false));download.onclick=guard(()=>send(true));node.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();primary.click()}};
 const split=node.querySelector('.split'),divider=node.querySelector('.divider');let pct=54;
 function size(n){pct=Math.max(14,Math.min(86,n));split.style.setProperty('--share',pct+'%');divider.setAttribute('aria-valuenow',Math.round(pct))}
 size(pct);divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);e.preventDefault()};
 divider.onpointermove=e=>{if(divider.hasPointerCapture(e.pointerId)){const box=split.getBoundingClientRect();size(100*(e.clientY-box.top)/box.height)}};
 divider.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();size(pct+(e.key==='ArrowUp'?-4:4))}};
 q('fold').onclick=()=>{const collapsed=split.classList.toggle('folded');q('fold').textContent=collapsed?'⌄':'⌃';q('fold').title=collapsed?'展开请求区':'折叠请求区'};
 return {node,draft,url,method,get historyRecord(){return historyRecord},set historyRecord(value){historyRecord=value},refreshAddress(){renderAddress();onTitle()}};
}
