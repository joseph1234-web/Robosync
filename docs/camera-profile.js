export function cameraProfile(text){
  let p;try{if(typeof text!=='string'||text.length>2048)throw 0;p=JSON.parse(text);}catch{throw new Error('Use the private JSON configuration produced by your protected relay.');}
  const fail=()=>{throw new Error('Camera setup is invalid. Use a fresh protected relay configuration.');};
  if(!p||p.kind!=='robosynct-local-camera'||p.version!==1||typeof p.host!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(p.host))fail();
  const parts=p.host.split('.');if(parts.some(n=>Number(n)>255||n.length>1&&n.startsWith('0')))fail();const[a,b,,d]=parts.map(Number);if(!(a===10||a===172&&b>=16&&b<=31||a===192&&b===168)||d===0||d===255)fail();
  const path=p.path??'/stream',title=p.title??'Local camera';if(!Number.isInteger(p.port)||p.port<1||p.port>65535||typeof path!=='string'||!/^\/[A-Za-z0-9_./-]{0,180}$/.test(path)||path.includes('..')||typeof p.sha256!=='string'||!/^[0-9a-f]{64}$/.test(p.sha256)||typeof p.token!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(p.token)||typeof title!=='string'||title.length>80)fail();
  return{kind:p.kind,version:1,host:p.host,port:p.port,path,sha256:p.sha256,token:p.token,title};
}
