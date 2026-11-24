// 活动环境始终有效；只修复缺失的默认项，不替换已有的服务地址、变量或当前选择。
const LOCAL_ENV='本地开发',LOCAL_URL='http://localhost:8080',BASE_TOKEN='{{baseUrl}}';
function baseLine(text){return text.split(/\r?\n/).findLastIndex(line=>line.includes('=')&&line.split('=')[0].trim()==='baseUrl')}
function baseValue(text){const lines=text.split(/\r?\n/),line=lines[baseLine(text)];return line?.slice(line.indexOf('=')+1).trim()||''}
function ensureEnvironment(s){
 const local=s.envs[LOCAL_ENV]||'';
 if(!baseValue(local)){
   const lines=local?local.split(/\r?\n/):[],i=baseLine(local);
   if(i<0)lines.unshift('baseUrl='+LOCAL_URL);else lines[i]='baseUrl='+LOCAL_URL;
   s.envs[LOCAL_ENV]=lines.join('\n');
 }
 if(!s.active||!Object.hasOwn(s.envs,s.active))s.active=LOCAL_ENV;
}
function environmentBase(){
 return (state.advancedEnv&&serviceAddress(chosenService()))||baseValue(state.envs[state.active]||'')||baseValue(state.envs[LOCAL_ENV]||'')||LOCAL_URL;
}
// 草稿记住的是前缀绑定；地址栏显示真实地址。外部导入的绝对 URL 不按字符串碰巧相同而绑定。
function usesBase(url){return /^\{\{baseUrl\}\}(?=$|[/?#])/.test(url)}
function visibleAddress(url){return usesBase(url)?environmentBase().replace(/\/+$/,'')+url.slice(BASE_TOKEN.length):url}
function newDraft(){return {...blankRequest(),url:BASE_TOKEN}}
