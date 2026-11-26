import { arrangePhone,layoutV4 } from './studio-model.js?v=0.37.0';
import { phoneOrder } from './phone-layout.js?v=0.37.0';

// A projection of the same dashboard, never a copied dashboard or new widget ID.
export function editPhoneLayout(config,id,change){
  const next=layoutV4(config);
  if(id===null){if(typeof change.custom!=='boolean')throw Error('Choose shared or custom phone layout.');next.custom_phone_layout=change.custom;return next;}
  const item=next.widgets.find(w=>w.id===id);if(!item)throw Error('This widget is no longer in the draft.');
  let updated=next;
  if(change.before!==undefined||change.span!==undefined&&change.span!==0||change.visible!==undefined)updated=arrangePhone(next,id,change);
  if(change.span===0){const phone=updated.widgets.find(w=>w.id===id);phone.phone={...phone.phone};delete phone.phone.span;delete phone.phone.compact;updated.custom_phone_layout=true;}
  if(change.height!==undefined){const n=Number(change.height);if(!Number.isInteger(n)||n!==0&&(n<160||n>960))throw Error('Phone height must be Auto or 160–960 dp.');updated.widgets.find(w=>w.id===id).phone={...item.phone,...updated.widgets.find(w=>w.id===id).phone,height:n};updated.custom_phone_layout=true;}
  if(change.span!==undefined){const target=updated.widgets.find(w=>w.id===id);if(item.compact===undefined)delete target.compact;else target.compact=item.compact;target.phone={...target.phone,compact:change.span===4};if(change.span===0)delete target.phone.compact;}return updated;
}
export function mountPhoneLayoutEditor(root,config,{disabled=false,onChange,onEdit}={}){
  const signature=JSON.stringify([config,disabled]);if(root.dataset.signature===signature)return;const focused=root.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):null;const expanded=root.querySelector('details')?.open===true;root.dataset.signature=signature;root.replaceChildren();const custom=config.custom_phone_layout===true;
  const settings=document.createElement('details');settings.className='phone-layout-settings';settings.open=expanded;
  const title=document.createElement('summary');title.textContent='Phone layout settings';settings.append(title);root.append(settings);
  const mode=document.createElement('select');mode.setAttribute('aria-label','Phone layout mode');for(const [value,label]of [['shared','Use shared layout'],['custom','Customize phone layout']]){const option=document.createElement('option');option.value=value;option.textContent=label;mode.append(option);}mode.value=custom?'custom':'shared';mode.disabled=disabled;mode.addEventListener('change',()=>onChange(null,{custom:mode.value==='custom'}));settings.append(mode);
  const ordered=phoneOrder(config);
  for(let index=0;index<ordered.length;index++){
    const w=ordered[index],row=document.createElement('div');row.className='phone-editor-row';row.dataset.widgetId=w.id;
    const name=document.createElement('strong');name.textContent=w.title;row.append(name);
    const visible=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=!custom||w.phone?.visible!==false;toggle.disabled=disabled;toggle.setAttribute('aria-label','Show '+w.title+' on phone');toggle.addEventListener('change',()=>onChange(w.id,{visible:toggle.checked}));visible.append(toggle,document.createTextNode('Show'));row.append(visible);
    const span=document.createElement('select');span.setAttribute('aria-label',w.title+' phone width');for(const [value,label]of [[0,'Shared width'],[4,'Compact'],[6,'Half row'],[12,'Full row']]){const option=document.createElement('option');option.value=String(value);option.textContent=label;span.append(option);}span.value=String(custom?w.phone?.span||0:0);span.disabled=disabled;span.addEventListener('change',()=>{onChange(w.id,{span:Number(span.value)});});row.append(span);
    const height=document.createElement('select');height.setAttribute('aria-label',w.title+' minimum phone height');const heights=[0,160,200,240,320,400,480,640,960],current=custom?w.phone?.height||0:0;if(!heights.includes(current))heights.push(current);for(const n of heights.sort((a,b)=>a-b)){const option=document.createElement('option');option.value=String(n);option.textContent=n?n+' dp':'Auto height';height.append(option);}height.value=String(current);height.disabled=disabled;height.addEventListener('change',()=>onChange(w.id,{height:Number(height.value)}));row.append(height);
    const action=(label,fn,off=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled||off;b.setAttribute('aria-label',label+' '+w.title);b.addEventListener('click',fn);row.append(b);};
    action('Move up',()=>onChange(w.id,{before:ordered[index-1].id}),index===0);
    action('Move down',()=>onChange(w.id,{before:ordered[index+2]?.id||null}),index===ordered.length-1);
    action('Edit',()=>onEdit?.(w));settings.append(row);
  }
  if(focused)Array.from(root.querySelectorAll('[aria-label]')).find(e=>e.getAttribute('aria-label')===focused)?.focus({preventScroll:true});
}
