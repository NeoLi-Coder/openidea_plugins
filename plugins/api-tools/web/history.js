// 收藏只保存历史条目的名称、文件夹和说明，请求快照由历史统一持有。
function sameRequest(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function restoreHistory(){
 let changed=false;
 // 上次窗口关闭时仍在等待响应的请求，保留记录并如实显示结果未知。
 for(const item of state.history)if(item.startedAt&&!item.status&&!item.error&&!item.interrupted){item.interrupted=true;changed=true}
 const legacy=state.saved;if(!legacy)return changed;
 for(const saved of legacy){
   let item=state.history.find(item=>!item.favorite&&sameRequest(item.r,saved.r));
   // 旧收藏没有发送时间，不能把迁移时间当成实际发送时间。
   if(!item){item={r:saved.r,name:'旧收藏 · '+saved.name};state.history.push(item)}
   const pos=saved.name.lastIndexOf('/'),legacyFolder=saved.folder===undefined&&pos>0&&!saved.name.includes('://');
   item.favorite={name:legacyFolder?saved.name.slice(pos+1):saved.name,folder:legacyFolder?saved.name.slice(0,pos):saved.folder,description:saved.description};
 }
 delete state.saved;return true;
}
function saveFavorite(r,favorite,record){
 // 未发送草稿也作为历史条目保存；重复收藏同一条记录只修改收藏信息。
 if(!record||!state.history.includes(record)||!sameRequest(record.r,r)){record={r};state.history.unshift(record)}
 record.favorite=favorite;historyChanged();return record;
}
function historyName(item){
 if(!item.startedAt)return item.name||'未发送 · '+item.r.method+' '+item.r.url;
 const outcome=item.error?'发送失败':item.status?'HTTP '+item.status:item.interrupted?'结果未知':'发送中';
 return outcome+' · '+item.r.method+' '+item.r.url+' · '+new Date(item.startedAt).toLocaleString();
}
function historyChanged(){document.dispatchEvent(new Event('request-history-changed'))}
