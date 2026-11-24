// File 只留在打开的标签中。宿主的消息接口传输文本，按块交付，不把文件内容放入项目存储。
const pickedLimit=16*1024*1024;
const hexBytes=Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0'));
async function sendWithFiles(request,files,onDispatch){
 const started=[];
 try {
   for(const [token,file] of files){
     started.push(token);let offset=0;
     do{
       const bytes=new Uint8Array(await file.slice(offset,offset+192*1024).arrayBuffer());
       await rpc('uploadChunk',{token,size:file.size,offset,hex:Array.from(bytes,b=>hexBytes[b]).join('')});offset+=bytes.length;
     }while(offset<file.size);
   }
   onDispatch();
   const result=await rpc('send',{request});started.length=0;return result;
 }finally{for(const token of started)await rpc('releaseUpload',{token})}
}
