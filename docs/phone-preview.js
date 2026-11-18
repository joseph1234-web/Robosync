import { renderWidgetScene,applyWidgetAppearance } from './widget-visual.js?v=0.37.0';
/** Inert shared preview card. No auth, radio, media or command transport is created. */
export function phonePreviewCard(w,p,{theme='mint',scale=1,channel=null,className=''}={}){
 const card=document.createElement('article');card.className=className+' phone-layout-card';card.setAttribute('data-widget-id',w.id);card.dataset.widgetId=w.id;card.id='preview-'+w.id;
 card.style.setProperty('--phone-column',String(p.column+1));card.style.setProperty('--phone-row',String(p.row+1));card.style.setProperty('--phone-cols',String(p.span));card.style.setProperty('--widget-cols',String(p.span));
 if(p.height){card.classList.add('sized-widget');card.style.setProperty('--widget-height',p.height+'px');}
 applyWidgetAppearance(card,w,theme);card.append(renderWidgetScene(w,theme,Math.max(120,p.cardWidth-2),scale,channel||{}));
 if(channel){const binding=document.createElement('p');binding.className='card-binding';binding.textContent=channel.title+(channel.config?.virtual_pin?' · '+channel.config.virtual_pin:'');card.append(binding);}return card;
}
