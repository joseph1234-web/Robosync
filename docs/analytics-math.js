export function stableMean(values){
  if(!values.length)return null;const scale=Math.max(...values.map(n=>Math.abs(n)));if(scale===0)return 0;
  const normalized=values.reduce((sum,n)=>sum+n/scale/values.length,0);return Math.max(-1,Math.min(1,normalized))*scale;
}
export function numericReadings(rows){return rows.filter(r=>typeof r.value_num==='number'&&Number.isFinite(r.value_num)&&!['bad','invalid','stale'].includes(r.quality)&&Number.isFinite(Date.parse(r.recorded_at))).slice().sort((a,b)=>Date.parse(a.recorded_at)-Date.parse(b.recorded_at)||String(a.id).localeCompare(String(b.id)));}
export function summarizeAnalytics(rows,intervalSeconds=60){
  if(!Number.isFinite(intervalSeconds)||intervalSeconds<=0)throw new Error('Expected interval must be positive.');
  const valid=numericReadings(rows),values=valid.map(r=>r.value_num),sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  let gaps=0,missing=0;const times=[...new Set(valid.map(r=>Date.parse(r.recorded_at)))];
  for(let i=1;i<times.length;i++){const delta=(times[i]-times[i-1])/1000;if(delta>intervalSeconds*1.5){gaps++;missing+=Math.max(0,Math.round(delta/intervalSeconds)-1);}}
  return {records:rows.length,count:valid.length,excluded:rows.length-valid.length,estimated:valid.filter(r=>r.quality==='estimated').length,min:sorted.length?sorted[0]:null,max:sorted.length?sorted.at(-1):null,mean:stableMean(values),median:sorted.length?(sorted.length%2?sorted[middle]:sorted[middle-1]/2+sorted[middle]/2):null,latest:values.length?values.at(-1):null,first:valid[0]?.recorded_at||null,last:valid.at(-1)?.recorded_at||null,gaps,missing};
}
export function bucketAnalytics(rows,requestedSeconds=60,target=240){
  const valid=numericReadings(rows);if(!valid.length)return {seconds:requestedSeconds,buckets:[]};
  const first=Date.parse(valid[0].recorded_at),last=Date.parse(valid.at(-1).recorded_at);
  const seconds=Math.max(requestedSeconds,Math.ceil((last-first)/1000/target/60)*60||60),ms=seconds*1000,buckets=new Map();
  for(const row of valid){const time=Math.floor(Date.parse(row.recorded_at)/ms)*ms;if(!buckets.has(time))buckets.set(time,[]);buckets.get(time).push(row.value_num);}
  return {seconds,buckets:[...buckets].map(([time,values])=>({time,count:values.length,min:Math.min(...values),max:Math.max(...values),mean:stableMean(values)}))};
}
export function analyticsCsvCell(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function analyticsReadingsCsv(results){
  const fields=['device','stream','unit','value','recorded_at_utc','received_at_utc','quality','device_mode'],out=[fields.map(analyticsCsvCell).join(',')];
  const rows=results.flatMap(result=>(result.rows||[]).map(row=>({row,source:result.source}))).sort((a,b)=>String(a.row.recorded_at).localeCompare(String(b.row.recorded_at))||String(a.row.id).localeCompare(String(b.row.id)));
  for(const {row,source}of rows)out.push([analyticsCsvCell(source.device.label),analyticsCsvCell(source.channel.title),analyticsCsvCell(source.channel.unit),typeof row.value_num==='number'&&Number.isFinite(row.value_num)?String(row.value_num):'',analyticsCsvCell(row.recorded_at),analyticsCsvCell(row.received_at),analyticsCsvCell(row.quality),analyticsCsvCell(source.device.config?.mode==='simulation'?'simulation':'registered')].join(','));
  return '\uFEFF'+out.join('\r\n');
}
