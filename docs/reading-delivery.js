export function readingAge(milliseconds) {
  const seconds=Math.max(0,Math.floor(milliseconds/1000));
  if(seconds<60)return seconds+'s';
  const minutes=Math.floor(seconds/60);
  if(minutes<60)return minutes+'m';
  const hours=Math.floor(minutes/60);
  return hours<48?hours+'h':Math.floor(hours/24)+'d';
}

export function readingDelivery(rows,now=Date.now()){
  let latest=null,at=-Infinity;
  for(const row of rows||[]){
    const recorded=Date.parse(row.recorded_at);
    if(!Number.isFinite(recorded)||recorded<at||recorded>now+2000||['bad','invalid','stale'].includes(row.quality))continue;
    if(!Number.isFinite(row.value_num)&&typeof row.value_bool!=='boolean'&&typeof row.value_text!=='string')continue;
    latest=row;at=recorded;
  }
  if(!latest)return null;
  const received=Date.parse(latest.received_at);
  return {
    at,age:readingAge(now-at)+' ago',
    delay:Number.isFinite(received)&&received-at>=1000?readingAge(received-at):null,
    recent:latest.quality!=='estimated'&&now-at<=20000
  };
}
