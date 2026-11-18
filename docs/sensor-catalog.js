// Stream templates describe data, not installed firmware drivers. All ranges
// below are classroom simulation defaults, never sensor specifications.
const numeric=(key,title,group,unit,min,max,examples,integer=false)=>({key,title,group,unit,min,max,examples,integer,value_type:'number',direction:'input'});
const digital=(key,title,group,examples)=>({key,title,group,examples,unit:'',value_type:'boolean',direction:'input'});
const textual=(key,title,group,examples,samples)=>({key,title,group,examples,samples,unit:'',value_type:'text',direction:'input'});
export const SENSOR_PRESETS=[
  numeric('temperature','Temperature','Environment','C',0,50,'ESP32: DHT11 / DHT22, DS18B20, BME280 / BME680, BMP180 / BMP388; thermistor'),
  numeric('humidity','Humidity','Environment','%',0,100,'ESP32: DHT11 / DHT22, BME280 / BME680'),
  numeric('pressure_hpa','Air pressure','Environment','hPa',950,1050,'ESP32: BMP180 / BMP280 / BMP388, BME280 / BME680'),
  numeric('light_raw','Light intensity · raw','Environment','raw',0,1023,'LDR / photoresistor, APDS9960',true),
  numeric('light_lux','Illuminance','Environment','lux',0,1000,'BH1750'),
  numeric('gas_raw','Gas sensor · raw','Environment','raw',0,1023,'MQ family; calibration required for concentration',true),
  numeric('sound_raw','Sound level · raw','Environment','raw',0,1023,'Microphone module; raw values are not decibels',true),
  digital('flame_detected','Flame detected','Environment','IR flame module'),
  numeric('soil_moisture','Soil moisture','Garden & water','%',0,100,'Capacitive / resistive soil probe; calibration required'),
  numeric('water_level','Water level','Garden & water','%',0,100,'Water level probe; calibration required'),
  numeric('rain_raw','Rain sensor · raw','Garden & water','raw',0,1023,'Rain detection board',true),
  numeric('flow_rate','Water flow','Garden & water','L/min',0,20,'Pulse flow meter; calibration required'),
  digital('water_leak','Water leak detected','Garden & water','Leak / water detection module'),
  digital('rain_detected','Rain detected','Garden & water','Digital rain module'),
  numeric('distance_cm','Distance','Motion & position','cm',2,200,'ESP32: HC-SR04 ultrasonic / time-of-flight module'),
  numeric('accel_x','Acceleration X','Motion & position','m/s²',-10,10,'MPU6050 / accelerometer'),
  numeric('accel_y','Acceleration Y','Motion & position','m/s²',-10,10,'MPU6050 / accelerometer'),
  numeric('accel_z','Acceleration Z','Motion & position','m/s²',-10,10,'MPU6050 / accelerometer'),
  numeric('gyro_z','Rotation rate Z','Motion & position','deg/s',-180,180,'Gyroscope module'),
  numeric('rotary_position','Rotary encoder position','Motion & position','steps',0,100,'Rotary encoder',true),
  digital('motion_detected','Motion detected','Motion & position','PIR motion module'),
  digital('tilt_detected','Tilt detected','Motion & position','Tilt switch'),
  digital('vibration_detected','Vibration detected','Motion & position','Vibration switch module'),
  digital('knock_detected','Knock detected','Motion & position','Knock sensor module'),
  digital('obstacle_detected','Obstacle detected','Detection & switches','IR obstacle module'),
  digital('line_detected','Line detected','Detection & switches','Line tracking module'),
  digital('light_barrier','Light barrier interrupted','Detection & switches','Photo-interrupter module'),
  digital('reed_closed','Magnetic reed closed','Detection & switches','ESP32: door contact / reed switch module'),
  digital('hall_detected','Magnetic field detected','Detection & switches','Digital Hall module'),
  digital('touch_detected','Touch detected','Detection & switches','Capacitive / metal touch module'),
  digital('button_pressed','Button pressed','Detection & switches','Push button module'),
  numeric('pot_raw','Potentiometer','User input','raw',0,4095,'Potentiometer; ADC scale depends on board',true),
  numeric('joystick_x','Joystick X','User input','raw',0,1023,'Analog joystick',true),
  numeric('joystick_y','Joystick Y','User input','raw',0,1023,'Analog joystick',true),
  digital('joystick_pressed','Joystick button','User input','Joystick push switch'),
  textual('ir_code','Infrared remote code','User input','IR receiver',['0x00FF30CF','0x00FF18E7','0x00FF7A85']),
  textual('rfid_uid','RFID tag ID','User input','ESP32: MFRC522 RFID reader',['DEMO-A1B2','DEMO-C3D4','DEMO-E5F6']),
  numeric('voltage','Voltage','Electrical','V',0,5,'Voltage monitor; suitable divider / isolation required'),
  numeric('current','Current','Electrical','A',0,2,'Current monitor; suitable hardware required'),
  numeric('battery_level','Battery level','Electrical','%',0,100,'Battery monitor; conversion depends on chemistry'),
  numeric('rssi','Signal strength','Electrical','dBm',-95,-35,'Wi-Fi firmware signal report'),
  textual('status_text','Device status message','Messages','Firmware / serial text',['Ready for experiment','Sampling sensor','Sample saved']),
  textual('serial_message','Serial message','Messages','Firmware text payload',['Hello from RoboSynct','Observation A','Observation B']),
  textual('color_name','Detected color','Messages','Color sensor classification',['Red','Green','Blue']),
  textual('gps_location','Location message','Messages','ESP32: NEO-6M / NEO-M8N GPS firmware text',['DEMO: point A','DEMO: point B','DEMO: point C']),
  numeric('thermocouple_c','Thermocouple temperature','Environment','C',20,200,'ESP32: Type-K with MAX6675 / MAX31855'),
  numeric('gas_resistance_kohm','Gas resistance','Environment','kΩ',10,300,'ESP32: BME680; resistance is not a calibrated air quality score'),
  numeric('altitude_m','Altitude estimate','Environment','m',0,500,'ESP32: BMP180 / BMP388, BME280, GPS; reference calibration required'),
  numeric('tds_ppm','Dissolved solids estimate','Garden & water','ppm',0,1000,'ESP32: TDS module; practice data, calibration required'),
  numeric('wind_speed','Wind speed','Environment','m/s',0,20,'ESP32: anemometer; conversion depends on sensor'),
  numeric('proximity_raw','Proximity · raw','Detection & switches','raw',0,255,'ESP32: APDS9960',true),
  numeric('color_red','Red channel · raw','Environment','raw',0,255,'ESP32: APDS9960 color module',true),
  numeric('color_green','Green channel · raw','Environment','raw',0,255,'ESP32: APDS9960 color module',true),
  numeric('color_blue','Blue channel · raw','Environment','raw',0,255,'ESP32: APDS9960 color module',true),
  textual('gesture','Detected gesture','User input','ESP32: APDS9960',['Left','Right','Up','Down','Near','Far']),
  numeric('gyro_x','Rotation rate X','Motion & position','deg/s',-180,180,'ESP32: MPU6050'),
  numeric('gyro_y','Rotation rate Y','Motion & position','deg/s',-180,180,'ESP32: MPU6050'),
  digital('radar_motion','Radar motion detected','Motion & position','ESP32: RCWL-0516'),
  numeric('load_mass_kg','Load cell mass','Electrical','kg',0,5,'ESP32: load cell with HX711; tare and calibration required'),
  numeric('gps_latitude','GPS latitude','Motion & position','deg',-90,90,'ESP32: NEO-6M / NEO-M8N; synthetic coordinates'),
  numeric('gps_longitude','GPS longitude','Motion & position','deg',-180,180,'ESP32: NEO-6M / NEO-M8N; synthetic coordinates'),
  numeric('gps_speed','GPS speed','Motion & position','km/h',0,60,'ESP32: NEO-6M / NEO-M8N'),
  numeric('gps_satellites','GPS satellite count','Motion & position','satellites',0,12,'ESP32: NEO-6M / NEO-M8N',true),
  textual('rtc_time','RTC time message','Messages','ESP32: DS1307 / DS3231; demonstration timestamps',['DEMO 2026-01-01T08:00:00Z','DEMO 2026-01-01T08:00:05Z','DEMO 2026-01-01T08:00:10Z'])
];

// One module may expose several streams. Adding the profile reuses existing keys;
// it does not install a library, pair hardware, or infer GPIO wiring.
export const ESP32_MODULES=[
  {key:'ds18b20',title:'DS18B20',group:'ESP32 · environment',streams:['temperature']},
  {key:'thermocouple',title:'Type-K + MAX6675 / MAX31855',group:'ESP32 · environment',streams:['thermocouple_c']},
  {key:'dht',title:'DHT11 / DHT22',group:'ESP32 · environment',streams:['temperature','humidity']},
  {key:'bme280',title:'BME280',group:'ESP32 · environment',streams:['temperature','humidity','pressure_hpa']},
  {key:'bme680',title:'BME680',group:'ESP32 · environment',streams:['temperature','humidity','pressure_hpa','gas_resistance_kohm']},
  {key:'bmp388',title:'BMP388',group:'ESP32 · environment',streams:['temperature','pressure_hpa','altitude_m']},
  {key:'bmp180',title:'BMP180',group:'ESP32 · environment',streams:['temperature','pressure_hpa','altitude_m']},
  {key:'bh1750',title:'BH1750',group:'ESP32 · environment',streams:['light_lux']},
  {key:'tds',title:'TDS module',group:'ESP32 · environment',streams:['tds_ppm']},
  {key:'anemometer',title:'Anemometer',group:'ESP32 · environment',streams:['wind_speed']},
  {key:'apds9960',title:'APDS9960',group:'ESP32 · environment',streams:['proximity_raw','light_raw','color_red','color_green','color_blue','gesture']},
  {key:'pir',title:'PIR motion',group:'ESP32 · motion & position',streams:['motion_detected']},
  {key:'door',title:'Door / reed switch',group:'ESP32 · motion & position',streams:['reed_closed']},
  {key:'hcsr04',title:'HC-SR04 ultrasonic',group:'ESP32 · motion & position',streams:['distance_cm']},
  {key:'mpu6050',title:'MPU6050',group:'ESP32 · motion & position',streams:['accel_x','accel_y','accel_z','gyro_x','gyro_y','gyro_z','temperature']},
  {key:'rcwl0516',title:'RCWL-0516 radar motion',group:'ESP32 · motion & position',streams:['radar_motion']},
  {key:'neo6m',title:'NEO-6M GPS',group:'ESP32 · motion & position',streams:['gps_latitude','gps_longitude','altitude_m','gps_speed','gps_satellites']},
  {key:'neom8n',title:'NEO-M8N GPS',group:'ESP32 · motion & position',streams:['gps_latitude','gps_longitude','altitude_m','gps_speed','gps_satellites']},
  {key:'hx711',title:'Load cell + HX711',group:'ESP32 · other sensors',streams:['load_mass_kg']},
  {key:'mfrc522',title:'MFRC522 RFID',group:'ESP32 · other sensors',streams:['rfid_uid']},
  {key:'ds1307',title:'DS1307 RTC',group:'ESP32 · other sensors',streams:['rtc_time']},
  {key:'ds3231',title:'DS3231 RTC',group:'ESP32 · other sensors',streams:['rtc_time']}
];

export function makeStreamDefinition(key,custom){
  const preset=SENSOR_PRESETS.find(p=>p.key===key);
  if(key!=='custom'){
    if(!preset)throw new Error('Choose a sensor template.');
    return {channel_key:preset.key,title:preset.title,unit:preset.unit,value_type:preset.value_type,direction:preset.direction,config:{template:preset.key,simulation:true,...(preset.value_type==='number'?{min:preset.min,max:preset.max}:{}),...(preset.samples?{samples:preset.samples}:{}),...(preset.integer?{integer:true}:{})}};
  }
  const channel_key=String(custom?.key||'').trim(),title=String(custom?.title||'').trim(),unit=String(custom?.unit||'').trim(),value_type=custom?.value_type;
  if(!/^[a-z][a-z0-9_]{0,47}$/.test(channel_key))throw new Error('Use a stream key of 1–48 lowercase letters, numbers, or underscores, starting with a letter.');
  if(!title||title.length>120||unit.length>24||!['number','boolean','text'].includes(value_type))throw new Error('Enter a title (1–120 characters), a data type, and an optional unit (up to 24 characters).');
  const config={simulation:true};
  if(value_type==='number'){
    const min=Number(custom.min),max=Number(custom.max);
    if(String(custom.min).trim()===''||String(custom.max).trim()===''||!Number.isFinite(min)||!Number.isFinite(max)||min>=max||!Number.isFinite(max-min)||Math.max(Math.abs(min),Math.abs(max))>1e12)throw new Error('Enter a simulation minimum below its maximum, within ±1 trillion.');
    config.min=min;config.max=max;
  }else if(value_type==='text'){
    const samples=String(custom.samples||'Ready\nSampling\nComplete').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(!samples.length||samples.length>12||samples.some(s=>s.length>200))throw new Error('Enter 1–12 example text values, one per line, up to 200 characters each.');
    config.samples=samples;
  }
  return {channel_key,title,unit:value_type==='number'?unit:'',value_type,direction:'input',config};
}

export function simulatedValue(channel,index=0){
  if(channel.value_type==='boolean')return {value_bool:Math.floor(index/3)%2===1};
  if(channel.value_type==='text'){
    const samples=channel.config?.samples||SENSOR_PRESETS.find(p=>p.key===channel.channel_key)?.samples||['Ready','Sampling','Complete'];
    const safe=(Array.isArray(samples)?samples:[]).filter(s=>typeof s==='string'&&s.length<=200);
    return {value_text:safe[index%Math.max(1,safe.length)]||'Sample '+(index+1)};
  }
  const preset=SENSOR_PRESETS.find(p=>p.key===channel.channel_key);
  const min=Number.isFinite(channel.config?.min)?channel.config.min:preset?.min??0;
  const max=Number.isFinite(channel.config?.max)?channel.config.max:preset?.max??100;
  const sane=min<max&&Number.isFinite(max-min)&&Math.max(Math.abs(min),Math.abs(max))<=1e12;
  const lo=sane?min:0,hi=sane?max:100;
  // Keep the original temperature demonstration crossing 32 C for existing rules.
  const original={temperature:[28,6],humidity:[65,8],soil_moisture:[48,8],pot_raw:[2048,1000]}[channel.channel_key];
  const base=original?.[0]??lo+(hi-lo)*.45,amplitude=original?.[1]??(hi-lo)*.3;
  const value=Math.max(lo,Math.min(hi,base+amplitude*Math.sin(index*Math.PI/11)));
  return {value_num:channel.config?.integer||preset?.integer?Math.round(value):Number(value.toFixed(3))};
}

export function streamValue(row,type){return type==='boolean'?row.value_bool:type==='text'?row.value_text:row.value_num;}
export function validStreamReadings(rows,type){
  return (Array.isArray(rows)?rows:[]).filter(r=>r&&!['bad','invalid','stale'].includes(r.quality)&&Number.isFinite(Date.parse(r.recorded_at))&&(type==='number'?typeof r.value_num==='number'&&Number.isFinite(r.value_num):type==='boolean'?typeof r.value_bool==='boolean':type==='text'&&typeof r.value_text==='string')).slice().sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)||String(a.id||'').localeCompare(String(b.id||'')));
}

export function displayStreamNumber(value,channel={}){const p=channel?.config?.io?.precision;return Number.isFinite(value)?(value===0?0:value).toLocaleString(undefined,{maximumFractionDigits:Number.isInteger(p)&&p>=0&&p<=6?p:1}):'—';}
