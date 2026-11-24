// 定位使用工作台 iframe 的坐标。嵌套窗口以自己的按钮为锚点，不以外层窗口为锚点。
function placeAtTrigger(win, trigger, heightLimit=Infinity){
 const gap=4,edge=6;
   const anchor=trigger.getBoundingClientRect();
   const below=innerHeight-anchor.bottom-gap-edge,above=anchor.top-gap-edge;
   win.style.maxHeight='';
   const box=win.getBoundingClientRect();
   const up=box.height>below&&above>below;
   win.style.left=Math.max(edge,Math.min(anchor.left,innerWidth-edge-box.width))+'px';
   win.style.top=up?'auto':anchor.bottom+gap+'px';
   win.style.bottom=up?innerHeight-anchor.top+gap+'px':'auto';
   win.style.maxHeight=Math.min(heightLimit,Math.max(0,up?above:below))+'px';
}
function showAnchoredDialog(win, trigger){
 const place=()=>placeAtTrigger(win,trigger);
 win.showModal();
 place();
 window.addEventListener('resize',place);
 win.addEventListener('close',()=>window.removeEventListener('resize',place),{once:true});
}
function chooseDownload(trigger,previous,suggestion){
 const win=$('downloadDialog'),field=$('downloadPath'),ok=$('downloadOK');
 field.value=previous;field.placeholder='完整路径，例如 D:\\下载\\'+suggestion;
 const validate=()=>{ok.disabled=!field.value.trim()||/[\\/]$/.test(field.value.trim())};
 field.oninput=validate;validate();win.returnValue='cancel';
 $('downloadFolder').onclick=guard(async()=>{const dir=await rpc('downloadFolder');if(!dir||!win.open)return;
   const name=field.value.trim().split(/[\\/]/).pop()||suggestion;
   field.value=dir.replace(/[\\/]+$/,'')+(dir.includes('\\')?'\\':'/')+name;validate();field.focus();field.setSelectionRange(field.value.length-name.length,field.value.length)});
 ok.onclick=()=>win.close('ok');$('downloadCancel').onclick=()=>win.close('cancel');
 field.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&!ok.disabled)ok.click()};
 return new Promise(resolve=>{win.addEventListener('close',()=>resolve(win.returnValue==='ok'?field.value.trim():null),{once:true});
   showAnchoredDialog(win,trigger);field.focus()});
}
