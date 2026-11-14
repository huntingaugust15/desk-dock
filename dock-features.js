'use strict';
// Pure time/schedule rules, shared by the UI and boundary checks.
const DockFeatures=(()=>{
  const minute=60000,day=86400000;
  const calendars={
    2026:{closed:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],early:['11-27','12-24']},
    2027:{closed:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],early:['11-26']},
    2028:{closed:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25'],early:['07-03','11-24']}
  };
  const parts=(now,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const dateKey=p=>p.year+'-'+p.month+'-'+p.day;
  const clockMinutes=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
  function nightSettings(value={}){value=value&&typeof value==='object'?value:{};return {enabled:typeof value.enabled==='boolean'?value.enabled:true,start:clockMinutes(value.start)!==null?value.start:'23:00',end:clockMinutes(value.end)!==null?value.end:'07:00',brightness:Number.isFinite(Number(value.brightness))?Math.max(35,Math.min(85,Number(value.brightness))):55}}
  function isNight(now,settings){const p=parts(now,'Asia/Hong_Kong'),m=Number(p.hour)*60+Number(p.minute),a=clockMinutes(settings.start),b=clockMinutes(settings.end);return !!settings.enabled&&a!==null&&b!==null&&a!==b&&(a<b?m>=a&&m<b:m>=a||m<b)}
  function tradingDay(key){const year=Number(key.slice(0,4)),cal=calendars[year];if(!cal)return null;const weekday=new Date(key+'T12:00:00Z').getUTCDay();return {open:weekday!==0&&weekday!==6&&!cal.closed.includes(key.slice(5)),early:cal.early.includes(key.slice(5))}}
  function easternTime(key,minutes){const noon=Date.parse(key+'T12:00:00Z'),offset=12-Number(parts(noon,'America/New_York').hour);return Date.parse(key+'T00:00:00Z')+(minutes+offset*60)*minute}
  function marketStatus(now=Date.now()){
    const p=parts(now,'America/New_York'),key=dateKey(p),today=tradingDay(key);
    if(!today)return {state:'unknown',label:'交易日曆待更新',target:null,targetLabel:''};
    const open=easternTime(key,570),close=easternTime(key,today.early?780:960),pre=easternTime(key,240),post=easternTime(key,today.early?1020:1200);
    let state='closed',label='休市';
    if(today.open){if(now>=open&&now<close){state='regular';label=today.early?'交易中 · 提早收市':'交易中'}else if(now>=pre&&now<open){state='pre';label='盤前'}else if(now>=close&&now<post){state='post';label='盤後'}}
    if(state==='regular')return {state,label,target:close,targetLabel:'距收市',early:today.early};
    let target=null;
    for(let i=0;i<12;i++){const candidate=new Date(Date.parse(key+'T12:00:00Z')+i*day).toISOString().slice(0,10),d=tradingDay(candidate);if(d?.open){const at=easternTime(candidate,570);if(at>now){target=at;break}}}
    return {state,label,target,targetLabel:target?'距開市':'',early:today.early};
  }
  function shortCountdown(ms){const seconds=Math.max(0,Math.ceil(ms/1000)),d=Math.floor(seconds/86400),h=Math.floor(seconds%86400/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return (d?d+'日 ':'')+[h,m,s].map(v=>String(v).padStart(2,'0')).join(':')}
  const sessionTypes=[['FirstPractice','練習 1',60],['SecondPractice','練習 2',60],['ThirdPractice','練習 3',60],['SprintQualifying','衝刺排位',45],['Sprint','衝刺賽',60],['Qualifying','排位賽',60],['race','正賽',180]];
  function sessions(races){return (races||[]).flatMap(race=>sessionTypes.flatMap(([key,label,duration])=>{const s=key==='race'?race:race[key];if(!s?.date)return [];const at=s.time?Date.parse(s.date+'T'+s.time):null;return [{key,label,race,date:s.date,time:s.time||null,at:Number.isFinite(at)?at:null,duration:duration*minute,id:[race.season||'',race.round,key,s.date,s.time||'tba'].join(':')}]})).sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.at??Infinity)-(b.at??Infinity))}
  function nextSession(races,now=Date.now()){
    const all=sessions(races),today=new Date(now).toISOString().slice(0,10);
    const timed=all.filter(s=>s.at!==null).sort((a,b)=>a.at-b.at);
    const selected=timed.find((s,i)=>now<Math.min(s.at+s.duration,timed[i+1]?.at??Infinity));
    // An undated time on an earlier weekend must not disappear behind a later race.
    const tba=all.find(s=>s.at===null&&s.date>=today&&(!selected||s.date<selected.date||(s.date===selected.date&&String(s.race.round)===String(selected.race.round)&&sessionTypes.findIndex(t=>t[0]===s.key)<sessionTypes.findIndex(t=>t[0]===selected.key))));
    if(tba)return {...tba,state:'tba'};
    if(!selected)return null;
    return {...selected,state:now>=selected.at?'scheduled':'upcoming'};
  }
  function sessionCountdown(s,now=Date.now()){return !s||s.at===null?'時間待定':s.state==='scheduled'?'預定進行中':'倒數 '+shortCountdown(s.at-now)}
  function footballAlert(ev,now=Date.now(),fresh=true){if(!ev||!fresh)return '';const stat=ev.status?.type||ev.competitions?.[0]?.status?.type||{};if(/CANCEL|ABANDON|POSTPON|SUSPEND|DELAY/.test(stat.name||''))return '';if(stat.state==='in')return 'live';if(stat.state==='post'||ev.timeValid===false||ev.competitions?.[0]?.timeValid===false)return '';const remaining=Date.parse(ev.date)-now;return remaining>0&&remaining<=30*minute?'soon':''}
  function freshness(at,maxAge,online,error=false,partial=false,now=Date.now()){if(!online)return {stale:true,label:at?'離線 · 已存資料':'離線 · 未有資料'};if(!at)return {stale:true,label:'未取得資料'};if(partial)return {stale:true,label:'部份資料過期'};if(error||now-at>maxAge)return {stale:true,label:'資料可能過期'};return {stale:false,label:''}}
  function retryDelay(failures,normal){return failures?Math.min(300000,30000*2**Math.min(failures-1,4)):normal}
  return {nightSettings,isNight,marketStatus,shortCountdown,sessions,nextSession,sessionCountdown,footballAlert,freshness,retryDelay};
})();
