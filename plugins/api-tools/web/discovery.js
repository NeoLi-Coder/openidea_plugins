// 使用固定版 OpenIDEA 解析器，保留同一路径在不同模块/HTTP 方法下的所有候选。
const ann=(list,name)=>list.find(a=>a.name===name);
function jaxrs(file,resolve){
  const constantsOfFile=new endpoints.Constants(file,resolve);
  const value=(a)=>constantsOfFile.string(a?.args.get('value'));
  const result=[];
  for(const cls of source.allClasses(file)){
    const base=value(ann(cls.annotations,'Path'));if(base==null)continue;
    for(const m of cls.methods){
      const verb=m.annotations.find(a=>/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/.test(a.name));if(!verb)continue;
      const a=ann(m.annotations,'Path'),sub=a?value(a):'';if(sub==null)continue;
      const query=[],headers=[];let bodyType=null;
      for(const p of m.params){
        const q=value(ann(p.annotations,'QueryParam')),h=value(ann(p.annotations,'HeaderParam'));
        if(q!=null)query.push({name:q,value:value(ann(p.annotations,'DefaultValue'))});
        else if(h!=null)headers.push({name:h,value:'{{'+h+'}}'});
        else if(!p.annotations.length)bodyType=p.type;
      }
      result.push({className:cls.name,methodName:m.name,offset:m.nameStart,httpMethod:verb.name,
        paths:[endpoints.joinPaths(base,sub)],query,headers,bodyType,consumes:null,produces:null})
    }
  }return result;
}
const projectReader={read:path=>rpc('read',{path}),filesNamed:name=>rpc('named',{name})};
// 全项目索引和编辑器单文件入口共用同一份解析结果。列号使用 JS / 宿主约定的 UTF-16。
async function fileEntries(path,text,pool){
  const file=source.parseSource(text);await pool.load([file]);const resolve=pool.resolverFor(file);
  const routes=endpoints.controllersOf(file,resolve).flatMap(c=>c.endpoints).concat(jaxrs(file,resolve));
  const normalized=path.replaceAll('\\','/'),module=normalized.includes('/src/main/')?normalized.split('/src/main/')[0].split('/').pop():file.packageName||'项目';
  return routes.flatMap(route=>{
    const lines=text.slice(0,route.offset).split('\n');
    // 下载提示只影响按钮优先级。文件名只作建议；仍由用户选择实际写入位置。
    if(route.servletResponse||route.produces){
      const declaration=route.range?text.slice(route.range.from,route.range.to):'';
      const filename=route.servletResponse&&declaration.match(/"([^"\\/\r\n]+\.(?:xlsx?|csv|pdf|zip|docx?))"/i)?.[1];
      if(filename||route.servletResponse&&/download|export|attachment|\.getOutputStream\s*\(/i.test(declaration)
          ||/octet-stream|spreadsheet|ms-excel|application\/(?:pdf|zip)/i.test(route.produces||''))route.downloadName=filename||route.methodName;
    }
    return route.paths.map(url=>({path,file,route,url,module,line:lines.length-1,col:lines.at(-1).length}));
  });
}
async function discover(progress){
  const {paths,limited}=await rpc('scan'), pool=new constants.ConstantPool(projectReader),entries=[];
  for(const [i,path] of paths.entries()){
    progress(i+1,paths.length);
    const text=await projectReader.read(path);if(text===null)continue;
    entries.push(...await fileEntries(path,text,pool));
  }
  return {entries,limited}
}
async function draftFrom(entry){
  const {route,file,path,url}=entry;
  const r=blankRequest(),lookup=route.bodyType?await request.bodyLookup(path,file,[route],projectReader):null;
  const block=request.renderRequest(route,{path:url,host:BASE_TOKEN,body:lookup?request.skeleton(route.bodyType,lookup):undefined});
  const lines=block.trimEnd().split('\n');const [method,...address]=lines[1].split(' ');
  const split=lines.indexOf('',2);
  r.method=method;r.url=address.join(' ');r.headers=lines.slice(2,split<0?undefined:split).join('\n');
  if(split>=0){r.body=lines.slice(split+1).join('\n');r.mode=/application\/x-www-form-urlencoded/i.test(r.headers)?'form':'raw'}
  if(route.parts?.length){
    r.mode='multipart';r.parts=structuredClone(route.parts);
    // 由 curl 根据表单内容生成带 boundary 的 Content-Type。
    r.headers=r.headers.split('\n').filter(h=>!/^Content-Type:\s*multipart\/form-data\b/i.test(h)).join('\n');
  }
  if(route.downloadName)r.downloadName=route.downloadName;
  return r;
}
