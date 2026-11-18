import { makeQrSvg } from './qr-code.js?v=0.36.1';
export function makeBoardSetup({tag,apPassword,homeSsid='',homePassword='',configureWifi=false},random=crypto){
  if(!/^[A-Za-z0-9_-]{1,16}$/.test(tag))throw new Error('Use a board label with 1–16 letters, numbers, hyphens or underscores.');
  if(!/^[A-Za-z0-9_-]{8,63}$/.test(apPassword))throw new Error('Board Wi-Fi password needs 8–63 letters, numbers, hyphens or underscores.');
  const bytes=text=>new TextEncoder().encode(text).length;
  if(configureWifi&&(bytes(homeSsid)<1||bytes(homeSsid)>32||bytes(homePassword)<8||bytes(homePassword)>63||/[\r\n\0]/.test(homeSsid+homePassword)))throw new Error('Use a 2.4 GHz WPA2 SSID (1–32 bytes) and password (8–63 bytes).');
  const setup=Array.from(random.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  const quoted=s=>JSON.stringify(s).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const header=['#pragma once','// PRIVATE: unique to this board. Keep out of shared repositories.','#define ROBOSYNCT_DEVICE_TAG '+quoted(tag),'#define ROBOSYNCT_SETUP_KEY_HEX '+quoted(setup),'#define ROBOSYNCT_AP_PASSWORD '+quoted(apPassword),'#define ROBOSYNCT_USE_CONFIGURED_WIFI '+(configureWifi?'1':'0'),'#define ROBOSYNCT_HOME_SSID '+quoted(configureWifi?homeSsid:''),'#define ROBOSYNCT_HOME_PASSWORD '+quoted(configureWifi?homePassword:''),''].join('\n');
  return {header,profile:{kind:'robosynct-board-setup',version:1,name:'RoboSynct-'+tag,setup,ap_password:apPassword}};
}
export function mountBoardSetup(){const $=id=>document.getElementById(id);if(!$('easy-setup-form'))return;if(!$('easy-tag').value)$('easy-tag').value='Pot_'+Array.from(crypto.getRandomValues(new Uint8Array(3)),x=>x.toString(16).padStart(2,'0')).join('');let current=null,headerUrl=null;
 const clear=()=>{current=null;$('easy-qr').replaceChildren();$('easy-output').hidden=true;if(headerUrl)URL.revokeObjectURL(headerUrl);headerUrl=null;$('easy-download').removeAttribute('href');};
 $('easy-setup-form').addEventListener('submit',event=>{event.preventDefault();clear();try{current=makeBoardSetup({tag:$('easy-tag').value.trim(),apPassword:$('easy-ap-password').value,homeSsid:$('easy-home-ssid').value,homePassword:$('easy-home-password').value,configureWifi:$('easy-configure-wifi').checked});const qr=makeQrSvg(JSON.stringify(current.profile));qr.setAttribute('aria-label','Private board enrollment QR. Scan once with RoboSynct Android.');$('easy-qr').append(qr);headerUrl=URL.createObjectURL(new Blob([current.header],{type:'text/plain;charset=utf-8'}));$('easy-download').href=headerUrl;$('easy-download').download='RoboSynctUserConfig.h';$('easy-output').hidden=false;$('easy-status').textContent='Private configuration ready. Download the header and keep this QR until the board is enrolled. Nothing was sent to a server.';}catch(error){$('easy-status').textContent=error.message;}});
 $('easy-clear').addEventListener('click',()=>{clear();$('easy-ap-password').value='';$('easy-home-password').value='';$('easy-status').textContent='Private configuration cleared from this page.';});
 $('easy-configure-wifi').addEventListener('change',()=>{$('easy-router-fields').hidden=!$('easy-configure-wifi').checked;});
 window.addEventListener('pagehide',()=>{if(headerUrl)URL.revokeObjectURL(headerUrl);current=null;});
}
if(typeof document!=='undefined')mountBoardSetup();
