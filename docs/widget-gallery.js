import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';
import { renderWidgetScene } from './widget-visual.js?v=0.37.0';
const $=id=>document.getElementById(id);
function render(){document.documentElement.dataset.theme=$('theme').value;$('gallery').replaceChildren();for(const type of Object.keys(WIDGET_DESIGN.faces)){if(!type.includes($('search').value.toLowerCase().trim()))continue;const card=document.createElement('section');card.className='sample';const title=document.createElement('h2');title.textContent=WIDGET_DESIGN.labels[type];card.append(title,renderWidgetScene({type,title:WIDGET_DESIGN.labels[type],design:{color:$('accent').value}},$('theme').value,Number($('width').value)-28,Number($('scale').value),{unit:['camera','heading','note','divider'].includes(type)?'':'raw'}));$('gallery').append(card);}}
$('theme').addEventListener('input',()=>{$('accent').value=WIDGET_DESIGN.themes[$('theme').value].teal;});
for(const id of ['theme','width','scale','accent','search'])$(id).addEventListener('input',render);render();
