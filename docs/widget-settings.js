import { widgetTextValues,applyWidgetText } from './widget-text.js?v=0.36.1';
import { WIDGET_DESIGN } from './widget-design.js?v=0.37.0';

/** Display metadata only. Never changes stream values, bounds or output commands. */
export const NUMERIC_WIDGETS=['value','gauge','chart','progress','table','multi','bar','timeline','counter','tank','health','alarm','compass'];
export const AGGREGATIONS=[['latest','Latest reading'],['mean','Sample average'],['min','Minimum'],['max','Maximum']];
export const iconChoices=()=>[['','Use widget icon'],...Object.keys(WIDGET_DESIGN.icons).map(id=>[id,WIDGET_DESIGN.labels[id]||id])];
export function widgetIconId(w={}){return Object.hasOwn(WIDGET_DESIGN.icons,w.design?.icon)?w.design.icon:Object.hasOwn(WIDGET_DESIGN.icons,w.type)?w.type:'value';}
export function widgetSettingValues(w={}){const f=w.format?.version===1?w.format:{};return{icon:w.design?.icon||'',precision:Number.isInteger(f.precision)&&f.precision>=0&&f.precision<=6?String(f.precision):'',zeros:f.trailing_zeros===true,aggregation:w.aggregation||'latest',on_label:w.on_label??'On',off_label:w.off_label??'Off',...widgetTextValues(w)};}
export function applyWidgetSettings(next,values,original=next){
 const initial=widgetSettingValues(original);
 if(values.icon!==undefined&&values.icon!==initial.icon){if(values.icon&&!Object.hasOwn(WIDGET_DESIGN.icons,values.icon))throw Error('Choose an installed icon.');next.design={...next.design};if(values.icon)next.design.icon=values.icon;else delete next.design.icon;if(!Object.keys(next.design).length)delete next.design;}
 if(['precision','zeros'].some(k=>values[k]!==undefined&&values[k]!==initial[k])){
  if(original.format?.version!==undefined&&original.format.version!==1)throw Error('This number format needs a newer editor; its saved settings are retained.');
  const f={...original.format,version:1};
  if(values.precision!==undefined){if(values.precision!==''&&!/^[0-6]$/.test(String(values.precision)))throw Error('Choose stream decimals or 0–6 decimal places.');if(values.precision==='')delete f.precision;else f.precision=Number(values.precision);}
  if(values.zeros!==undefined){if(typeof values.zeros!=='boolean')throw Error('Choose whether to keep trailing zeros.');if(values.zeros)f.trailing_zeros=true;else delete f.trailing_zeros;}
  if(Object.keys(f).some(k=>k!=='version'))next.format=f;else delete next.format;
 }
 if(next.type==='value'&&values.aggregation!==undefined&&values.aggregation!==initial.aggregation){if(!AGGREGATIONS.some(([id])=>id===values.aggregation))throw Error('Choose a supported summary.');next.aggregation=values.aggregation;}
 if(['status','led'].includes(next.type))for(const key of ['on_label','off_label'])if(values[key]!==undefined&&values[key]!==initial[key]){if(typeof values[key]!=='string'||!values[key].trim()||values[key].trim().length>40)throw Error('Status labels must contain 1–40 characters.');next[key]=values[key].trim();}
 return applyWidgetText(next,values,original);
}
export function widgetNumber(value,channel={},w={},locale){
 if(!Number.isFinite(value))return '—';const f=w.format?.version===1?w.format:{},valid=p=>Number.isInteger(p)&&p>=0&&p<=6,p=valid(f.precision)?f.precision:valid(channel?.config?.io?.precision)?channel.config.io.precision:1;
 // Normalize rounded negative zero consistently with BigDecimal on Android.
 return (Math.abs(value)<.5*10**-p?0:value).toLocaleString(locale,{maximumFractionDigits:p,minimumFractionDigits:f.trailing_zeros===true?p:0});
}
