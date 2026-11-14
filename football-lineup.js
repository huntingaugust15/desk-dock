'use strict';
const FootballLineup=(()=>{
  function starters(roster){return (Array.isArray(roster?.roster)?roster.roster:[]).filter(p=>p.starter===true)}
  function complete(roster){const players=starters(roster);return players.length===11&&players.every(p=>/^\d+$/.test(String(p.athlete?.id||'')))&&new Set(players.map(p=>String(p.athlete.id))).size===11}
  function announced(data,teamIds){return teamIds.length>0&&teamIds.every(id=>complete((data?.rosters||[]).find(r=>String(r.team?.id)===String(id))))}
  function position(player){
    const code=String(player.position?.abbreviation||'').toUpperCase();let role,depth;
    if(/^(G|GK)$/.test(code)){role='keeper';depth=-1}
    else if(/^(CD|CB|D)(-[LCR])?$/.test(code)){role='centreBack';depth=0}
    else if(/^(LB|RB|LWB|RWB)$/.test(code)){role='wideBack';depth=0}
    else if(/^(DM|CDM)(-[LCR])?$/.test(code)){role='midfielder';depth=1}
    else if(/^(CM|LM|RM)(-[LCR])?$/.test(code)){role='midfielder';depth=2}
    else if(/^(AM|CAM)(-[LCR])?$/.test(code)){role='attacker';depth=3}
    else if(/^(LW|RW|LF|RF|LWF|RWF)$/.test(code)){role='attacker';depth=3}
    else if(/^(F|CF|ST|SS)(-[LCR])?$/.test(code)){role='forward';depth=4}
    else return null;
    const side=/^(LB|LWB|LM|LW|LF|LWF)$/.test(code)||/^AM-L$/.test(code)?0:/^(RB|RWB|RM|RW|RF|RWF)$/.test(code)||/^AM-R$/.test(code)?4:/-L$/.test(code)?1:/-R$/.test(code)?3:2;
    return {role,depth,side};
  }
  function layout(roster){
    if(!complete(roster)||!/^\d(?:-\d){1,4}$/.test(String(roster.formation||'')))return null;
    const counts=roster.formation.split('-').map(Number);if(counts.some(n=>n<1||n>5)||counts.reduce((a,b)=>a+b,0)!==10)return null;
    const people=starters(roster).map(player=>({player,...position(player)}));if(people.some(p=>!p.role))return null;
    const keeper=people.filter(p=>p.role==='keeper');if(keeper.length!==1)return null;
    const centreBacks=people.filter(p=>p.role==='centreBack').length;
    // A three-centre-back formation places wide backs in the next band.
    if(counts[0]===3&&centreBacks===3)people.forEach(p=>{if(p.role==='wideBack')p.depth=1});
    const outfield=people.filter(p=>p.role!=='keeper').sort((a,b)=>a.depth-b.depth||a.side-b.side||Number(a.player.formationPlace||0)-Number(b.player.formationPlace||0));
    const rows=[];let offset=0;for(const count of counts){rows.push(outfield.slice(offset,offset+count));offset+=count}
    if(rows[0].some(p=>p.depth!==0)||rows.slice(1).some(row=>row.some(p=>p.depth===0)))return null;
    // Generic positions spanning two tactical bands cannot locate individual players reliably.
    for(let i=1;i<rows.length;i++)if(Math.max(...rows[i-1].map(p=>p.depth))>=Math.min(...rows[i].map(p=>p.depth)))return null;
    rows.forEach(row=>row.sort((a,b)=>a.side-b.side||Number(a.player.formationPlace||0)-Number(b.player.formationPlace||0)));
    return [keeper,...rows].map(row=>row.map(p=>p.player));
  }
  function pollInterval(event,now=Date.now()){const state=event?.status?.type?.state||event?.competitions?.[0]?.status?.type?.state;const remaining=Date.parse(event?.date)-now;return state==='in'||remaining<2*3600000?60000:remaining<6*3600000?300000:900000}
  return {starters,complete,announced,position,layout,pollInterval};
})();

// Lineup UI and shared summary requests.
const matchFlights=new Map(),homeLineupChecks=new Map();
function pitchPlayer(player){const full=player.athlete?.displayName||player.athlete?.fullName||'球員',short=player.athlete?.shortName||full;return '<li class="pitch-player" aria-label="'+esc((player.jersey?'#'+player.jersey+' ':'')+full)+'"><span class="pitch-avatar">'+footballPlayerPortrait(player)+'<span class="pitch-jersey">'+esc(player.jersey||'–')+'</span></span><span class="pitch-player-name" title="'+esc(full)+'">'+esc(short)+'</span></li>'}
function formationPitch(roster){const rows=FootballLineup.layout(roster);if(!rows)return '';return '<div class="formation-board" role="group" aria-label="'+esc(roster.formation)+' 陣式示意，進攻方向向上"><div class="pitch-direction">進攻 ↑</div><div class="pitch-surface"><div class="pitch-lines" aria-hidden="true"><span class="pitch-halfway"></span><span class="pitch-circle"></span><span class="pitch-box pitch-box-top"></span><span class="pitch-box pitch-box-bottom"></span></div><div class="pitch-rows">'+rows.slice().reverse().map((row,i)=>'<ul class="pitch-row" style="--players:'+row.length+'" aria-label="'+(i===rows.length-1?'門將':'陣式第 '+(rows.length-1-i)+' 線')+'">'+row.map(pitchPlayer).join('')+'</ul>').join('')+'</div></div></div>'}
function lineupTargetIds(event){const sides=gameSides(event),ids=[sides.home,sides.away].map(s=>String(s?.team?.id||'')).filter(Boolean);return isArsenalMode()&&ids.includes(ARSENAL_TEAM_ID)?[ARSENAL_TEAM_ID]:ids}
function homeLineupEvent(){const event=rankedGames()[0];if(!event||gameState(event)==='post'||!/^\d+$/.test(String(event.id)))return null;const type=event.status?.type?.name||event.competitions?.[0]?.status?.type?.name||'';return /CANCEL|ABANDON|POSTPON/.test(type)?null:event}
function syncHomeLineupBadge(){const badge=$('#lineup-notice');if(!badge)return;const event=homeLineupEvent(),entry=event?matchCache.get(String(event.id)):null,known=event&&entry&&FootballLineup.announced(entry.data,lineupTargetIds(event));badge.hidden=!known;if(!known){badge.removeAttribute('data-match-id');return}badge.dataset.matchId=String(event.id);const stale=!navigator.onLine||Date.now()-entry.at>Math.max(180000,FootballLineup.pollInterval(event)*2)||homeLineupChecks.get(String(event.id))?.error;badge.classList.toggle('data-stale',!!stale);badge.setAttribute('aria-label',(isArsenalMode()?'Arsenal ':'')+'正選已公布，查看陣容'+(stale?'，顯示已存資料':''));badge.title=(stale?'已存陣容 · ':'')+stamp(entry.at)}
async function fetchFootballMatch(id,force=false){id=String(id);if(!/^\d+$/.test(id))throw Error('比賽代號不正確');const cached=matchCache.get(id);if(!force&&cached&&Date.now()-cached.at<60000)return cached;if(matchFlights.has(id))return matchFlights.get(id);const task=(async()=>{const raw=await getJSON('https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event='+id);matchModel(raw,id);const data={header:raw.header,boxscore:raw.boxscore,rosters:raw.rosters,gameInfo:raw.gameInfo,lastFiveGames:raw.lastFiveGames,keyEvents:raw.keyEvents};const entry={data,at:Date.now()};matchCache.set(id,entry);const check=homeLineupChecks.get(id);if(check)check.error=false;if(matchCache.size>12)matchCache.delete(matchCache.keys().next().value);return entry})();matchFlights.set(id,task);try{return await task}finally{matchFlights.delete(id);syncHomeLineupBadge()}}
async function pollHomeLineup(force=false){syncHomeLineupBadge();const event=homeLineupEvent();if(!event||document.hidden||!navigator.onLine)return;const id=String(event.id),old=homeLineupChecks.get(id);if(old?.loading||(!force&&old&&Date.now()<old.nextAt))return;const check={loading:true,error:old?.error||false,failures:old?.failures||0,nextAt:Infinity};homeLineupChecks.set(id,check);if(homeLineupChecks.size>12)homeLineupChecks.delete(homeLineupChecks.keys().next().value);try{await fetchFootballMatch(id,force);check.error=false;check.failures=0}catch{check.error=true;check.failures++}finally{check.loading=false;check.nextAt=Date.now()+DockFeatures.retryDelay(check.failures,FootballLineup.pollInterval(event));syncHomeLineupBadge()}}
window.addEventListener('online',()=>{if(typeof rankedGames==='function')pollHomeLineup(true)});
