import { qrcode } from './vendor/qrcode.js';
export function makeQrMatrix(text){
  if(typeof text!=='string'||!text||text.length>2048)throw new Error('The connection link is too long.');
  const code=qrcode(0,'M');code.addData(text,'Byte');code.make();const count=code.getModuleCount();return Array.from({length:count},(_,y)=>Array.from({length:count},(_,x)=>code.isDark(y,x)));
}
export function makeQrSvg(text){
  const matrix=makeQrMatrix(text),size=matrix.length+8,ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${size} ${size}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','RoboSynct Android connection QR. Expires in five minutes.');svg.setAttribute('shape-rendering','crispEdges');
  const background=document.createElementNS(ns,'rect');background.setAttribute('width',String(size));background.setAttribute('height',String(size));background.setAttribute('fill','#ffffff');svg.append(background);const path=document.createElementNS(ns,'path');let d='';
  for(let y=0;y<matrix.length;y++)for(let x=0;x<matrix.length;x++)if(matrix[y][x])d+=`M${x+4} ${y+4}h1v1h-1z`;
  path.setAttribute('d',d);path.setAttribute('fill','#000000');svg.append(path);return svg;
}
export function makePairingLink(origin,requestId,inviteToken){
  if(!/^[0-9a-f-]{36}$/i.test(requestId)||!/^[a-f0-9]{64}$/.test(inviteToken))throw new Error('Invalid pairing link.');
  const url=new URL('/android-connect.html',origin);if(url.protocol!=='https:')throw new Error('Use the published HTTPS website for pairing.');url.hash=new URLSearchParams({v:'1',request:requestId,invite:inviteToken}).toString();return url.href;
}
export function pairingSecret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
