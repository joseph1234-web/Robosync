export const THEME_IDS=['mint','midnight','ocean','violet','sunrise','contrast'];
export const THEME_NAMES={mint:'Mint',midnight:'Midnight',ocean:'Ocean',violet:'Violet',sunrise:'Sunrise',contrast:'High contrast'};
export function applySurfaceTheme(element,id){if(THEME_IDS.includes(id))element.setAttribute('data-theme',id);else element.removeAttribute('data-theme');}
export function createThemes(){
  const $=id=>document.getElementById(id),key='robosynct.theme.v1';let chosen='mint';
  try{const saved=localStorage.getItem(key);if(THEME_IDS.includes(saved)||saved==='system')chosen=saved;}catch{}
  function apply(id,persist=true){
    if(!THEME_IDS.includes(id)&&id!=='system')return;chosen=id;const resolved=id==='system'?(window.matchMedia?.('(prefers-color-scheme: dark)').matches?'midnight':'mint'):id;
    applySurfaceTheme(document.documentElement,resolved);document.documentElement.style.colorScheme=resolved==='midnight'?'dark':'light';
    if(persist)try{localStorage.setItem(key,id);}catch{}
    $('theme-current-label').textContent=id==='system'?'Following your device appearance':THEME_NAMES[id]+' theme applied to this website';
    for(const button of $('theme-options').children)button.setAttribute('aria-pressed',String(button.getAttribute('data-theme-choice')===id));
  }
  for(const id of [...THEME_IDS,'system']){
    const button=document.createElement('button');button.type='button';button.className='theme-choice';button.setAttribute('data-theme-choice',id);button.setAttribute('aria-label','Use '+(THEME_NAMES[id]||'device')+' theme');
    const preview=document.createElement('div');preview.className='theme-choice-preview';applySurfaceTheme(preview,id==='system'?'mint':id);
    const rail=document.createElement('i'),card=document.createElement('span'),bar=document.createElement('b');rail.className='theme-preview-rail';card.className='theme-preview-card';bar.className='theme-preview-bar';card.append(bar);preview.append(rail,card);
    const label=document.createElement('strong');label.textContent=THEME_NAMES[id]||'Follow device';button.append(preview,label);button.addEventListener('click',()=>apply(id));$('theme-options').append(button);
  }
  for(const id of ['theme-button','login-theme-button'])$(id).addEventListener('click',()=>$('theme-dialog').showModal());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(chosen==='system')apply('system',false);});apply(chosen,false);
  return {apply,current:()=>chosen};
}
