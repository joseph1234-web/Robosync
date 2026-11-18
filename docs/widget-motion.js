import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';

// An old snapshot, a refresh, or a replay of the same sample stays still.
export function sampleAdvanced(previous, next, now=Date.now()){
  return Number.isFinite(previous) && Number.isFinite(next) && next>previous &&
    next>0 && next<=now+2000 && now-next<=20000;
}
export function animateWidget(card, type){
  if(!card || document.hidden || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const icon=card.querySelector?.('.widget-icon');
  if(!icon?.animate || !icon.getClientRects().length)return;
  const bounds=icon.getBoundingClientRect();
  if(bounds.bottom<0 || bounds.top>globalThis.innerHeight)return;
  const kind=WIDGET_DESIGN.iconMotion[type];
  const accent={sweep:'rotate(-15deg)',slide:'translateX(3px)',turn:'rotate(18deg)',pulse:'scale(1.15)'}[kind]||'scale(1.15)';
  const timing={duration:WIDGET_DESIGN.metrics.motionDurationMs,easing:'ease-in-out'};
  icon.animate([{transform:'none'},{transform:accent},{transform:'none'}],timing);
  const face=card.querySelector('.widget-reading, .widget-gauge, .widget-progress, .sensor-chart, .widget-led, .command-result');
  if(face?.animate)face.animate([{opacity:1},{opacity:0.78},{opacity:1}],timing);
}
