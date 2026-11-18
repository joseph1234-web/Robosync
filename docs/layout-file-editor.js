import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';
import { downloadLayout,readLayoutFile } from './layout-file.js?v=0.37.0';
const by=id=>document.getElementById(id),say=t=>by('status').textContent=t;
let doc=null,selected='',dirty=false,editing=false,openRequest=0;
for(let n=3;n<=12;n++)by('columns').add(new Option(n+' / 12',String(n)));
for(const k of ['inherit',...Object.keys(WIDGET_DESIGN.themes)])by('theme').add(new Option(k==='inherit'?'Dashboard theme':k[0].toUpperCase()+k.slice(1),k));
for(const k of ['',...Object.keys(WIDGET_DESIGN.icons)])by('icon').add(new Option(k?WIDGET_DESIGN.labels[k]:'Widget default',k));
function commit(){
 if(!editing)return true;
 if(!by('edit').reportValidity()||!by('title').value.trim()){say('Enter a card title.');return false;}
 const card=doc.cards.find(c=>c.id===selected);
 Object.assign(card,{title:by('title').value.trim(),columns:Number(by('columns').value),theme:by('theme').value,icon:by('icon').value});
 editing=false;dirty=true;return true;
}
function render(){
 const c=doc.cards.find(x=>x.id===selected);by('cards').replaceChildren();by('work').hidden=!c;by('download').disabled=!doc;
 for(const item of doc.cards){
  const li=document.createElement('li'),button=document.createElement('button');
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(icon.namespaceURI,'path');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');path.setAttribute('d',WIDGET_DESIGN.icons[item.icon||item.type]);icon.append(path);
  button.append(icon,document.createTextNode(item.title));button.setAttribute('aria-pressed',String(item.id===selected));
  button.onclick=()=>{if(commit()){selected=item.id;render();by('title').focus();}};li.append(button);by('cards').append(li);
 }
 if(c){for(const key of ['title','columns','theme','icon'])by(key).value=c[key];
 by('up').disabled=doc.cards[0]===c;by('down').disabled=doc.cards.at(-1)===c;}
}
by('file').onchange=async e=>{
 const file=e.target.files[0],token=++openRequest;e.target.value='';if(!file)return;
 if((dirty||editing)&&!confirm('Open another file and discard the current unsaved edits?'))return;
 try{const next=await readLayoutFile(file);if(token!==openRequest)return;doc=next;selected=doc.cards[0]?.id||'';dirty=false;editing=false;render();say(doc.cards.length+' cards · revision '+doc.revision);}catch(e){if(token===openRequest)say(e.message);}
};
by('edit').oninput=()=>editing=true;
by('edit').onsubmit=e=>{e.preventDefault();if(commit()){render();say('Edits applied to this file.');}};
for(const [id,step] of [['up',-1],['down',1]])by(id).onclick=()=>{if(!commit())return;const from=doc.cards.findIndex(c=>c.id===selected),to=from+step;if(to<0||to>=doc.cards.length)return;const [card]=doc.cards.splice(from,1);doc.cards.splice(to,0,card);dirty=true;render();say('Moved to position '+(to+1)+'.');};
by('download').onclick=()=>{if(!commit())return;try{downloadLayout(doc);dirty=false;render();say('Edited layout downloaded.');}catch(e){say(e.message);}};
addEventListener('beforeunload',e=>{if(dirty||editing){e.preventDefault();e.returnValue='';}});
