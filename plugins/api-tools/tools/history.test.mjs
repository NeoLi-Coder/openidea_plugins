import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

// 只替代 DOM 和宿主 RPC，发送、收藏与管理窗口使用实际工作台脚本。
class Element {
 constructor(){this.children=[];this.value='';this.title='';this.textContent='';this.checked=false;this.open=false;this.dataset={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){},contains(){return false}};this.nodes=new Map()}
 setAttribute(){} removeAttribute(){} focus(){} select(){}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector)}
 querySelectorAll(){return []}
 close(){this.open=false}
}
function runtime({send=async()=>({status:'200',seconds:'0.01',bytes:'2',body:'ok'}),download='/tmp/response',materialize}={}){
 const elements=new Map(),listeners=new Map(),snapshots=[],calls=[];
 const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)};
 const state={history:[],envs:{},headers:''};
 const context=vm.createContext({state,console,Date,Event,crypto:webcrypto,structuredClone,Map,Set,WeakMap,Uint8Array,ready:true,
   $,document:{createElement:()=>new Element(),addEventListener(type,fn){listeners.set(type,fn)},dispatchEvent(event){listeners.get(event.type)?.()}},
   verbs:['GET','POST'],options(){},guard:fn=>fn,status(){},onTitle(){},
   pairEditor(){let value='';return {set(v){value=v||''},get:()=>value,metadata:()=>[]}},
   splitAddress(url){return {base:url,query:'',suffix:''}},pathStart:()=>0,usesBase:()=>false,visibleAddress:v=>v,
   materialize:materialize||structuredClone,chooseDownload:async()=>download,
   requestNames:()=>({}),learnNames:async()=>{},
   persist:async()=>{snapshots.push(structuredClone(state))},
   rpc:async(op,fields)=>{calls.push({op,...fields});if(op==='send')return send(fields.request,state)},
   showAnchoredDialog(el){el.open=true},methodBadge:()=>new Element(),
   action(id,fn){$(id).onclick=fn},
   button(label,fn){const el=new Element();el.textContent=label;el.onclick=fn;return el},
   iconButton(icon,label,fn){const el=new Element();el.title=label;el.onclick=fn;return el}
 });
 $('editor').content={firstElementChild:{cloneNode:()=>new Element()}};
 for(const name of ['curl','file-picker','history','composer','managers'])vm.runInContext(readFileSync(new URL('../web/'+name+'.js',import.meta.url),'utf8'),context,{filename:name+'.js'});
 function composer(record=null){const draft=record?.r||{...vm.runInContext('blankRequest()',context),url:'http://localhost/test'};return context.createComposer(draft,()=>{},record)}
 const click=(composer,id)=>composer.node.querySelector('[data-id="'+id+'"]').onclick();
 return {context,state,snapshots,calls,$,composer,click};
}

test('提交发送时立即持久化；完成后更新同一条记录，重复发送分别留档',async()=>{
 let complete;const run=runtime({send:()=>new Promise(resolve=>complete=resolve)}),tab=run.composer();
 const pending=run.click(tab,'send');
 assert.equal(run.state.history.length,1);assert.equal(run.snapshots.length,1);
 const first=run.state.history[0];assert.match(run.context.historyName(first),/^发送中/);
 complete({status:'200',seconds:'0.01',bytes:'2',body:'ok'});await pending;
 assert.equal(first.status,'200');assert.equal(run.snapshots.at(-1).history[0].status,'200');
 const again=run.click(tab,'send');complete({status:'500',seconds:'0.01',bytes:'2',body:'no'});await again;
 assert.equal(run.state.history.length,2);assert.equal(run.state.history[1],first);assert.equal(run.state.history[0].status,'500');
});

for(const message of ['连接失败','请求超时','用户取消'])test(message+'仍保留发送历史和错误详情',async()=>{
 const run=runtime({send:async()=>{throw Error(message)}}),tab=run.composer();
 await assert.rejects(run.click(tab,'send'),new RegExp(message));
 assert.equal(run.state.history.length,1);assert.equal(run.state.history[0].error,message);
 assert.equal(run.snapshots.at(-1).history[0].error,message);
 assert.equal(tab.node.querySelector('[data-id="send"]').disabled,false);
});

test('下载失败同样留档，取消路径选择和校验失败不产生发送记录',async()=>{
 const failed=runtime({send:async()=>{throw Error('下载失败')}});
 await assert.rejects(failed.click(failed.composer(),'download'),/下载失败/);
 assert.equal(failed.calls[0].request.download,true);assert.equal(failed.state.history[0].error,'下载失败');
 const cancelled=runtime({download:null});await cancelled.click(cancelled.composer(),'download');
 assert.equal(cancelled.state.history.length,0);assert.equal(cancelled.calls.length,0);
 const invalid=runtime({materialize(){throw Error('地址无效')}});
 await assert.rejects(invalid.click(invalid.composer(),'send'),/地址无效/);assert.equal(invalid.state.history.length,0);
});

test('附件准备失败不进入发送；准备成功后才创建发送记录',async()=>{
 const run=runtime(),file={size:1,slice:()=>({arrayBuffer:async()=>new Uint8Array([1]).buffer})};let dispatched=false;
 run.context.rpc=async op=>{if(op==='uploadChunk')throw Error('附件失败')};
 await assert.rejects(run.context.sendWithFiles({},new Map([['file',file]]),()=>{dispatched=true}),/附件失败/);
 assert.equal(dispatched,false);
 const order=[];run.context.rpc=async op=>{order.push(op)};
 await run.context.sendWithFiles({},new Map([['file',file]]),()=>order.push('history'));
 assert.deepEqual(order,['uploadChunk','history','send']);
});

test('草稿收藏进入历史，重复收藏不复制；发送时更新未发送条目并保留收藏',async()=>{
 const run=runtime(),tab=run.composer(),r=tab.draft();
 const record=run.context.saveFavorite(r,{name:'草稿',folder:'接口'},null);tab.historyRecord=record;
 assert.match(run.context.historyName(record),/^未发送/);
 run.context.saveFavorite(r,{name:'改名',folder:'接口'},record);assert.equal(run.state.history.length,1);
 await run.click(tab,'send');assert.equal(run.state.history.length,1);assert.equal(record.status,'200');assert.equal(record.favorite.name,'改名');
 tab.url.value='http://localhost/changed';tab.url.oninput();
 const changed=run.context.saveFavorite(tab.draft(),{name:'改动后的草稿'},record);
 assert.equal(run.state.history.length,2);assert.notEqual(changed,record);assert.equal(record.r.url,r.url);
});

test('旧收藏并入对应历史、保留独立收藏和旧文件夹，重复加载不重复迁移',()=>{
 const run=runtime(),r=run.composer().draft(),existing={name:'200 · GET',r};run.state.history.push(existing);
 run.state.saved=[{name:'目录/已有',r},{name:'另一收藏',folder:'分组',description:'说明',r},{name:'独立',r:{...r,url:'http://localhost/old'}}];
 assert.equal(run.context.restoreHistory(),true);assert.equal(run.state.history.length,3);assert.equal(run.state.saved,undefined);
 assert.equal(existing.favorite.name,'已有');assert.equal(existing.favorite.folder,'目录');
 assert.equal(run.state.history[1].favorite.description,'说明');assert.match(run.context.historyName(run.state.history[2]),/^旧收藏/);
 assert.equal(run.context.restoreHistory(),false);assert.equal(run.state.history.length,3);
});

test('重新打开后未完成的发送显示结果未知，不误报成功或继续发送中',()=>{
 const run=runtime();run.state.history.push({r:run.composer().draft(),startedAt:new Date().toISOString()});
 assert.equal(run.context.restoreHistory(),true);assert.match(run.context.historyName(run.state.history[0]),/^结果未知/);
});

test('收藏列表是历史子集：取消收藏保留历史，删除历史同时移除收藏',async()=>{
 const run=runtime(),record=run.context.saveFavorite(run.composer().draft(),{name:'收藏'},null);
 run.context.setupManagers(()=>{});run.$('savedBtn').onclick();
 assert.equal(run.$('collection').children.length,1);
 await run.$('collection').children[0].children.at(-1).onclick();
 assert.equal(run.state.history.length,1);assert.equal(record.favorite,undefined);assert.equal(run.$('collection').children.length,0);
 run.context.saveFavorite(record.r,{name:'再次收藏'},record);run.$('historyBtn').onclick();
 const remove=run.$('runs').children[0].children.at(-1);assert.match(remove.title,/同时取消收藏/);await remove.onclick();
 assert.equal(run.state.history.length,0);run.$('savedBtn').onclick();assert.equal(run.$('collection').children.length,0);
});
