// A portable layout carries only the presentation fields listed here.
import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const format='robosynct-layout';
const fields=['id','type','title','columns','theme','icon'];
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).length===keys.length&&keys.every(k=>Object.hasOwn(obj,k));

export function validateLayoutFile(file){
  if(!exact(file,['format','version','project','revision','cards'])||file.format!==format||file.version!==1||
      (typeof file.project!=='string'||!uuid.test(file.project))||!Number.isSafeInteger(file.revision)||file.revision<0||!Array.isArray(file.cards)||file.cards.length>24)
    throw Error('Choose a version 1 RoboSynct layout file.');
  const ids=new Set();
  for(const c of file.cards){
    if(!exact(c,fields)||typeof c.id!=='string'||!uuid.test(c.id)||ids.has(c.id)||typeof c.type!=='string'||!Object.hasOwn(WIDGET_DESIGN.labels,c.type)||
        typeof c.title!=='string'||!c.title.trim()||c.title.length>120||
        !Number.isInteger(c.columns)||c.columns<3||c.columns>12||
        typeof c.theme!=='string'||!(c.theme==='inherit'||Object.hasOwn(WIDGET_DESIGN.themes,c.theme))||
        typeof c.icon!=='string'||!(c.icon===''||Object.hasOwn(WIDGET_DESIGN.icons,c.icon)))throw Error('A card contains invalid or unsupported settings.');
    ids.add(c.id);
  }
  return file;
}
export function exportLayout(project,revision,config){
  return validateLayoutFile({format,version:1,project,revision,cards:config.widgets.map(w=>({
    id:w.id,type:w.type,title:w.title,columns:w.size?.columns??(w.width==='full'?12:6),
    theme:w.theme||'inherit',icon:w.design?.icon||''
  }))});
}
export function importLayout(project,revision,config,file){
  validateLayoutFile(file);
  if(file.project!==project)throw Error('This layout belongs to a different project.');
  if(file.revision!==revision)throw Error('The dashboard revision changed. Export a fresh layout before merging edits.');
  const original=exportLayout(project,revision,config).cards;
  const byId=new Map(config.widgets.map((w,i)=>[w.id,{w,card:original[i]}]));
  if(original.length!==file.cards.length||file.cards.some(c=>byId.get(c.id)?.card.type!==c.type))
    throw Error('The card list changed. Export a fresh layout before merging edits.');
  const changes=[],widgets=file.cards.map((c,i)=>{
    const {w,card}=byId.get(c.id),next={...w},changed=[];
    if(original[i].id!==c.id)changed.push('order');
    if(c.title!==card.title){next.title=c.title;changed.push('title');}
    if(c.columns!==card.columns){next.size={height:0,...w.size,columns:c.columns};next.width=c.columns===12?'full':'half';changed.push('width');}
    if(c.theme!==card.theme){if(c.theme==='inherit')delete next.theme;else next.theme=c.theme;changed.push('theme');}
    if(c.icon!==card.icon){next.design={...w.design};if(c.icon)next.design.icon=c.icon;else delete next.design.icon;changed.push('icon');}
    if(changed.length)changes.push(c.title+' · '+changed.join(', '));
    return next;
  });
  return {config:{...config,widgets},changes};
}
export async function readLayoutFile(file){
  if(!file||file.size>65536)throw Error('Choose a layout file up to 64 KB.');
  let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error('This file does not contain a readable layout.');}
  return validateLayoutFile(parsed);
}
export function downloadLayout(file){
  validateLayoutFile(file);
  const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='RoboSynct-layout-'+file.project.slice(0,8)+'-r'+file.revision+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
