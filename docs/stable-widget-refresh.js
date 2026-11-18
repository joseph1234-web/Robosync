// Refresh reading leaves in mounted cards, keeping focus, handlers and scroll roots.
// Binding metadata is separate from telemetry: a missing source must be remounted
// when its catalog arrives, while ordinary value updates keep the current DOM.
export function widgetSourceRevision(widget,channels,devices,projectId,refs=[widget.channel_id]){
 const device=devices.find(d=>d.id===widget.device_id&&d.project_id===projectId);
 return [device?[device.id,device.project_id,device.board_model,device.config?.mode]:null,
  [...new Set(refs.filter(Boolean))].map(id=>{const c=channels.find(c=>c.id===id&&(!device||c.device_id===device.id));return c?[c.id,c.device_id,c.title,c.direction,c.value_type,c.unit,c.config]:null;})];
}
export function patchWidgetReadingTree(current,next,focused=null){
 if(current===focused||focused&&current.contains?.(focused))return current;
 if(current.nodeType===3){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return current;}
 // A refresh carries the configured base size. Keep the mounted fit until its
 // text/width watcher recalculates, including when the reading is unchanged.
 const fitted=current.getAttribute?.('data-text-fit')==='true'&&next.getAttribute?.('data-text-fit')==='true'&&current.getAttribute?.('data-text-size')===next.getAttribute?.('data-text-size')?current.style?.fontSize:null;
 if(current.attributes&&next.attributes&&current.attributes[Symbol.iterator]){for(const a of Array.from(current.attributes))if(!next.hasAttribute(a.name))current.removeAttribute(a.name);for(const a of Array.from(next.attributes))if(current.getAttribute(a.name)!==a.value)current.setAttribute(a.name,a.value);}
 const a=Array.from(current.childNodes||current.children||[]),b=Array.from(next.childNodes||next.children||[]);
 if(!current.childNodes){current.textContent=next.textContent;current.className=next.className;if(next.style&&current.style)for(const k of Object.keys(next.style))if(typeof next.style[k]!=="function")current.style[k]=next.style[k];}
 if(fitted&&current.style.fontSize!==fitted)current.style.fontSize=fitted;
 for(let i=0;i<b.length;i++){const old=a[i],fresh=b[i];if(!old){if(current.appendChild)current.appendChild(fresh);else current.append(fresh);}else if(old.nodeType!==fresh.nodeType||(old.nodeName||old.tagName)!==(fresh.nodeName||fresh.tagName)){if(current.replaceChild)current.replaceChild(fresh,old);else {current.removeChild(old);current.insertBefore(fresh,current.children[i]||null);}}else patchWidgetReadingTree(old,fresh,focused);}
 while((current.childNodes||current.children).length>b.length)current.removeChild((current.childNodes||current.children)[(current.childNodes||current.children).length-1]);return current;
}
