/* Pure policies shared by refresh, freshness and headline rotation. */
const DockTuning=(()=>{
  const minute=60000,hour=60*minute;
  function footballInterval(events,now=Date.now()){
    if(!events?.length)return 5*minute;
    let interval=30*minute;
    for(const e of events){
      const type=e.status?.type||e.competitions?.[0]?.status?.type||{},at=Date.parse(e.date),gap=at-now;
      if(/CANCEL|ABANDON|POSTPON|SUSPEND/.test(type.name||'')||!Number.isFinite(at))continue;
      if(type.state==='in'&&gap>-5*hour)return 30*1000;
      if(type.state==='post'){if(gap>-4*hour)interval=Math.min(interval,2*minute);continue}
      if(e.timeValid===false||e.competitions?.[0]?.timeValid===false)continue;
      if(gap>=-3*hour&&gap<=15*minute)return 30*1000;
      if(gap>0&&gap<=90*minute)interval=Math.min(interval,minute);
      else if(gap>0&&gap<=24*hour)interval=Math.min(interval,5*minute);
      else if(gap>0)interval=Math.min(interval,15*minute);
    }
    return interval;
  }
  function f1Interval(races,now=Date.now()){
    if(!races?.length)return 15*minute;
    const sessions=DockFeatures.sessions(races).filter(s=>s.at!==null);
    if(sessions.some(s=>now>=s.at-hour&&now<=s.at+s.duration+15*minute))return minute;
    for(const race of races){
      const weekend=sessions.filter(s=>s.race===race);
      if(weekend.length&&now>=weekend[0].at-24*hour&&now<=weekend.at(-1).at+4*hour)return 5*minute;
    }
    return hour;
  }
  function maxAge(interval,minimum){return Math.max(minimum,interval*2+minute)}
  function due(attempt,next,interval,failures,now=Date.now()){return now>=(failures?next:Math.min(next,attempt+interval))}
  function balanced(items){
    const buckets=new Map();for(const item of items){if(!buckets.has(item.sourceId))buckets.set(item.sourceId,[]);buckets.get(item.sourceId).push(item)}
    const result=[];while([...buckets.values()].some(a=>a.length))for(const bucket of buckets.values())if(bucket.length)result.push(bucket.shift());
    return result;
  }
  return {footballInterval,f1Interval,maxAge,due,balanced};
})();
