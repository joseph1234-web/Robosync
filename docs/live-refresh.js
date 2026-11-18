// Sample freshness is based on the sample timestamp, never the refresh timer.
export function readingFreshness(rows, now=Date.now()) {
  let newest=-Infinity;
  for(const row of rows||[]) {
    if(!row||['bad','invalid','stale'].includes(row.quality))continue;
    if(!Number.isFinite(row.value_num)&&typeof row.value_bool!=='boolean'&&typeof row.value_text!=='string')continue;
    const at=Date.parse(row.recorded_at);if(Number.isFinite(at)&&at<=now+2000)newest=Math.max(newest,at);
  }
  return {newest:Number.isFinite(newest)?newest:null,live:Number.isFinite(newest)&&now-newest<=20000};
}

/** All times refer to recorded samples. A successful dashboard fetch is a separate event. */
export function sampleStatus(freshness,now=Date.now()){
  if(freshness.newest===null)return 'No saved sensor readings';
  if(freshness.live)return 'Latest sensor reading · just now';
  const seconds=Math.max(0,Math.floor((now-freshness.newest)/1000));
  const age=seconds<60?seconds+'s':seconds<3600?Math.floor(seconds/60)+'m':seconds<86400?Math.floor(seconds/3600)+'h '+Math.floor(seconds%3600/60)+'m':Math.floor(seconds/86400)+'d';
  return 'Stale · last sensor reading '+age+' ago';
}
