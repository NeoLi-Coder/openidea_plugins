// 将固定版本的上游 TS 转成沙箱内的普通 JS；不下载依赖。
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync, readdirSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
function moduleBody(name, deps) {
  let src=read('vendor/spring/'+name+'.ts');
  if(name==='constants') src=src.slice(0,src.indexOf('const projectFiles:'));
  const js=stripTypeScriptTypes(src,{mode:'transform'}).replace(/^import\s+[\s\S]*?from ["'][^"']+["'];?\s*$/gm,'');
  const names=[...js.matchAll(/\bexport (?:async )?(?:function|class|const) (\w+)/g)].map(m=>m[1]);
  return 'const '+name+'=(()=>{'+deps+'\n'+js.replace(/\bexport (?=(?:async )?(?:function|class|const) )/g,'').replace(/export\s*\{\s*\};?/g,'')+'\nreturn {'+names.join(',')+'};})();';
}
const scripts=[
 moduleBody('source',''), moduleBody('endpoints','const {allClasses,parseSource}=source;'),
 moduleBody('request','const {allClasses,parseSource}=source;'),
 moduleBody('constants','const {allClasses,parseSource}=source; const {Constants}=endpoints;'),
 ...['curl','environment','discovery','fields','dialogs','name-choices','file-picker','history','composer','managers','editor-entry','workbench'].map(s=>read('web/'+s+'.js'))
].join('\n');
new Function(scripts); // 在写入包之前发现脚本语法错误
mkdirSync('web/generated',{recursive:true});
// 图标包含本地参考包资源和自绘资源；以内联资源交付，兼容宿主 iframe 的 CSP 和主题切换。
const iconCSS=readdirSync('web/icons').map(file=>{
  const name=file.replace(/(_dark)?\.svg$/,''),dark=file.endsWith('_dark.svg');
  return (dark?'[data-theme=dark] ':'')+'[data-icon="'+name+'"]{--icon:url("data:image/svg+xml;base64,'+readFileSync('web/icons/'+file).toString('base64')+'")}';
}).join('\n');
const page=read('web/index.html').replace('/* WORKBENCH_STYLE */',()=>read('web/workbench.css')+'\n'+iconCSS);
writeFileSync('web/generated/workbench.html',page.replace('/* WORKBENCH */',()=>scripts.replace(/<\/script/gi,'<\\/script')));
