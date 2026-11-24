// 同一个草稿同时支持逐行编辑和原文粘贴。未修改的字段保留原始字节表示，
// 不重排重复参数，也不把 flag、空值、已有转义或 curl 的 Header; 改成另一种请求。
const fieldFormats = {
  header: {lines:true, sep:':', glue:': ', join:'\n', placeholders:['Accept','application/json']},
  cookie: {lines:true, sep:'=', glue:'=', join:'; ', placeholders:['名称','值']},
  env:    {lines:true, sep:'=', glue:'=', join:'\n', placeholders:['变量名','变量值']},
  query:  {sep:'=', glue:'=', join:'&', placeholders:['page','1']},
  form:   {sep:'=', glue:'=', join:'&', placeholders:['字段名','字段值']}
};
function readCell(text,format){
  if(format.lines)return text;
  try{return decodeURIComponent(text.replace(/\+/g,' '))}catch{return text}
}
function writeCell(text,format){
  if(format.lines)return text;
  // 变量模板交给工作台在发送或导出时展开。
  return text.split(/(\{\{[^{}]+\}\})/g).map((v,i)=>i%2?v:encodeURIComponent(v)).join('');
}
function pairEditor(node,kind,onChange=()=>{}){
  const format=fieldFormats[kind], selectable=['header','query','form'].includes(kind)&&!!node.closest('.editor');
  node.classList.toggle('with-check',selectable);
  const heading=document.createElement('div');
  heading.className='pair-head';
  const checkAll=document.createElement('input');checkAll.type='checkbox';checkAll.title='全选 / 全不选';checkAll.setAttribute('aria-label',checkAll.title);
  if(selectable)heading.append(checkAll);
  for(const title of (selectable?['名称','值','说明']:['名称','值'])){const span=document.createElement('span');span.textContent=title;heading.append(span)}
  const rows=document.createElement('div'),raw=document.createElement('textarea'),actions=document.createElement('div');
  raw.rows=5;raw.spellcheck=false;raw.setAttribute('aria-label','批量编辑'+node.getAttribute('aria-label'));raw.hidden=true;
  raw.placeholder=format.placeholders.join(format.glue);
  actions.className='pair-actions';
  const makeButton=(name,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=fn;return b};
  let items=[],selected=null;
  const parse=text=>{
    if(!text)return [];
    return (kind==='cookie'?text.split(/;\s*/):format.lines?text.split(/\r?\n/):text.split('&')).map(original=>{
      const i=original.indexOf(format.sep);
      const key=i<0?original:original.slice(0,i);
      const literal=i<0?'':original.slice(i+1);
      const value=kind==='header'?literal.replace(/^ /,''):literal;
      return {key:readCell(key,format),value:readCell(value,format),source:original,rawKey:key,rawValue:literal,hasSep:i>=0};
    });
  };
  function literal(it){
      if(it.source!==undefined&&!it.keyEdited&&!it.valueEdited)return it.source;
      const k=it.keyEdited||it.source===undefined?writeCell(it.key,format):it.rawKey;
      if(it.source!==undefined&&!it.hasSep&&!it.valueEdited&&!format.lines)return k;
      if(!it.valueEdited&&it.hasSep)return k+format.sep+it.rawValue;
      return k+format.glue+writeCell(it.value,format);
  }
  const hasValue=it=>it.source!==undefined||it.key||it.value;
  function serialize(){return items.filter(it=>!it.off&&hasValue(it)).map(literal).join(format.join)}
  function sync(){raw.value=serialize();checkAll.checked=items.every(it=>!it.off);checkAll.indeterminate=!checkAll.checked&&items.some(it=>!it.off);onChange(raw.value)}
  function metadata(){return items.flatMap((it,i)=>it.off||it.description?[{i,...(it.off?{omitted:literal(it)}:{}),description:it.description||''}]:[])}
  function withMetadata(text,meta){const list=parse(text);for(const entry of meta||[]){
    if('omitted' in entry){const it=parse(entry.omitted)[0]||{key:'',value:''};Object.assign(it,{off:true,description:entry.description});list.splice(entry.i,0,it)}
    else if(list[entry.i])list[entry.i].description=entry.description}return list}
  checkAll.onchange=()=>{const off=!checkAll.checked;for(const it of items)it.off=off;paint();sync()};
  function addRow(it,focus=false){
    const row=document.createElement('div');row.className='pair';row.onfocusin=()=>{selected=it;for(const el of rows.children)el.toggleAttribute('data-selected',el===row)};
    const check=document.createElement('input');if(selectable){check.type='checkbox';check.checked=!it.off;check.setAttribute('aria-label','启用此行');row.classList.toggle('off',!!it.off);check.onchange=()=>{it.off=!check.checked;row.classList.toggle('off',it.off);sync()};row.append(check)}
    for(const [index,field] of ['key','value'].entries()){
      const input=document.createElement('input');
      input.placeholder=index&&it.key?'值':format.placeholders[index];input.setAttribute('aria-label',node.getAttribute('aria-label')+(index?'值':'名称'));
      input.value=it[field];input.spellcheck=false;input.autocomplete='off';
      input.oninput=()=>{it[field]=input.value;it[field+'Edited']=true;sync()};
      if(field==='value')input.onkeydown=e=>{
        if(e.key!=='Enter'||e.isComposing)return;
        e.preventDefault();
        if(row.nextElementSibling)row.nextElementSibling.querySelector('input:not([type=checkbox])').focus();else appendEmpty(true);
      };
      row.append(field==='key'?nameInput(input,kind):input);
    }
    if(selectable){const desc=document.createElement('input');desc.className='description';desc.value=it.description||'';desc.placeholder='说明';desc.setAttribute('aria-label','行说明');desc.oninput=()=>it.description=desc.value;row.append(desc)}
    const remove=makeButton('×',()=>{items.splice(items.indexOf(it),1);row.remove();sync();if(selected===it)selected=null;if(!items.length)appendEmpty()});
    remove.setAttribute('aria-label','移除此行');remove.title='移除此行';remove.className='remove';row.append(remove);rows.append(row);
    if(focus)row.querySelector('input:not([type=checkbox])').focus();
  }
  function appendEmpty(focus=false){const it={key:'',value:''};items.push(it);addRow(it,focus)}
  function paint(){selected=null;rows.replaceChildren();for(const it of items)addRow(it);if(!items.length)appendEmpty();checkAll.checked=items.every(it=>!it.off);checkAll.indeterminate=!checkAll.checked&&items.some(it=>!it.off)}
  const add=makeButton('＋ 添加一行',()=>appendEmpty(true));
  const toggle=makeButton('批量编辑',()=>{
    raw.hidden=!raw.hidden;
    rows.hidden=heading.hidden=add.hidden=duplicate.hidden=!raw.hidden;
    toggle.textContent=raw.hidden?'批量编辑':'逐行编辑';
    if(raw.hidden)paint();else raw.focus();
  });
  const duplicate=makeButton('复制行',()=>{if(!selected)return;const it={...selected};items.push(it);addRow(it,true);sync()});
  decorate(add,'add','添加一行');decorate(duplicate,'copy','复制所选行');
  actions.append(add,duplicate,toggle);node.append(actions,heading,rows,raw);
  function set(text,meta=metadata()){raw.value=text??'';items=withMetadata(raw.value,meta);if(raw.hidden)paint()}
  raw.oninput=()=>{items=withMetadata(raw.value,metadata());onChange(raw.value)};
  return {get:()=>raw.value,metadata,set};
}
// URL 本身始终可直接修改；逐行修改时仅替换查询串，不动路径和片段。
function splitAddress(url){
  const hash=url.indexOf('#'),head=hash<0?url:url.slice(0,hash),mark=head.indexOf('?');
  return {base:mark<0?head:head.slice(0,mark),query:mark<0?'':head.slice(mark+1),suffix:hash<0?'':url.slice(hash)};
}
function pathStart(base){
  const prefix=base.match(/^(?:[a-z][a-z\d+.-]*:\/\/[^/]*|\{\{[^{}]+\}\}(?=\/|$))/i);
  return prefix?prefix[0].length:0;
}
