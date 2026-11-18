import { ioBoardKey,ioPin,validateStreamSet } from './stream-contract.js?v=0.36.1';
/** Existing owned streams only; presets never create streams or send commands. */
export function outputSetupPresets(device,channels){
 const own=channels.filter(c=>c.device_id===device.id&&c.direction==='output');
 const rgb=own.find(c=>c.config?.io?.driver==='rgb'),relay=own.find(c=>c.config?.io?.driver==='digital'&&c.config.io.purpose==='relay'),led=own.find(c=>c.config?.io?.driver==='digital'&&c.config.io.purpose==='led');
 const result=[{id:'custom',label:'Choose outputs individually',selected:[]}];
 if(relay)result.push({id:'relay',label:'Relay only',selected:[relay.id]});
 if(rgb)result.push({id:'rgb',label:'RGB LED only',selected:[rgb.id]});
 if(rgb&&relay)result.push({id:'rgb-relay',label:'RGB + Relay',selected:[rgb.id,relay.id]});
 if(rgb&&relay&&led)result.push({id:'rgb-relay-led',label:'RGB + Relay + LED',selected:[rgb.id,relay.id,led.id]});
 return result;
}
/** Private header text only. The caller separately issues a scoped owner credential. */
export function outputSetupConfig(device,channels,selected,id,secret){
 if(!['esp32-devkit-v1','esp32-s3-devkitc-1','esp32-c3-devkitm-1'].includes(ioBoardKey(device.board_model)))throw Error('Choose a supported ESP32 signal profile.');
 if(!Array.isArray(selected)||selected.length<1||selected.length>3||new Set(selected).size!==selected.length)throw Error('Choose one to three distinct existing output streams.');
 const chosen=selected.map(id=>channels.find(c=>c.id===id&&c.device_id===device.id));
 if(chosen.some(c=>!c||c.direction!=='output'||!['digital','pwm','servo','rgb','thermostat'].includes(c.config?.io?.driver))||chosen.slice(1).some(c=>!['digital','pwm','servo'].includes(c.config.io.driver)))throw Error('Choose a LED/relay, PWM, servo, RGB or thermostat primary; extras use digital/PWM/servo.');
 validateStreamSet(channels.filter(c=>c.device_id===device.id),device);
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f]{64}$/i.test(secret))throw Error('A reviewed control credential is required.');
 const primary=chosen[0],io=primary.config.io,lines=['#pragma once','// RoboSynct I/O 1.6.0 · private owner opt-in · no motor/car integration.','#define RS_OUTPUT_ENABLED 1','#define RS_OUTPUT_PIN '+ioPin(primary.config.physical_pin),'#define RS_OUTPUT_PWM '+(io.driver==='pwm'?1:0),'#define RS_OUTPUT_SERVO '+(io.driver==='servo'?1:0),'#define RS_OUTPUT_ACTIVE_LOW '+(io.active_low===true?1:0),'#define RS_OUTPUT_RGB '+(io.driver==='rgb'?1:0),'#define RS_THERMOSTAT_ENABLED '+(io.driver==='thermostat'?1:0)];
 if(io.driver==='rgb')lines.push('#define RS_RGB_GREEN_PIN '+io.rgb_pins[1],'#define RS_RGB_BLUE_PIN '+io.rgb_pins[2]);
 for(let n=1;n<=2;n++){const c=chosen[n];lines.push('#define RS_OUTPUT'+(n+1)+'_ENABLED '+(c?1:0));if(c)lines.push('#define RS_OUTPUT'+(n+1)+'_SERVO '+(c.config.io.driver==='servo'?1:0),'#define RS_OUTPUT'+(n+1)+'_ACTIVE_LOW '+(c.config.io.active_low===true?1:0),'#define RS_OUTPUT'+(n+1)+'_PIN '+ioPin(c.config.physical_pin),'#define RS_OUTPUT'+(n+1)+'_PWM '+(c.config.io.driver==='pwm'?1:0));}
 lines.push('#define RS_CONTROL_ID '+JSON.stringify(id),'#define RS_CONTROL_TOKEN '+JSON.stringify(secret),'// Keep router/TLS configuration in RoboSynctCloudConfig.h. Never put these keys in a dashboard.');
 if(io.driver==='thermostat')lines.push('// RoboSynctSensorConfig.h must enable the separate temperature reader matching '+io.measurement_key+'.');
 return lines.join('\n')+'\n';
}
