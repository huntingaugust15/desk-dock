'use strict';
let f1HomeKey='',quoteStates=new Map(),footballNextAt=0,f1NextAt=0;
let footballFailures=0,f1Failures=0,pendingRefresh=false;
function setQuoteState(symbol,state){quoteStates.set(symbol,{state,at:Date.now()})}
function trackQuoteFrame(host,wrap,symbol){
  setQuoteState(symbol,'loading');let frame=null;
  const detect=()=>{const found=wrap.querySelector('iframe');if(!found||found===frame)return;frame=found;found.addEventListener('load',()=>{if(host.isConnected&&host.firstChild===wrap)setQuoteState(symbol,'loaded')},{once:true})};
  const observer=new MutationObserver(detect);observer.observe(wrap,{childList:true,subtree:true});detect();
  setTimeout(()=>{observer.disconnect();if(host.isConnected&&host.firstChild===wrap&&quoteStates.get(symbol)?.state==='loading')setQuoteState(symbol,'error')},25000);
}
function currentQuoteHealth(now=Date.now()){
  const states=prefs.symbols.map(s=>quoteStates.get(s.symbol));
  if(!navigator.onLine)return {stale:true,label:'離線 · 資料可能過期'};
  if(states.some(s=>s?.state==='error'))return {stale:true,label:'連線待確認 · 自動重試'};
  if(states.some(s=>!s||s.state==='loading'))return {stale:false,label:'延遲報價 · 連接中'};
  if(now-lastQuoteConnection>360000)return {stale:true,label:'連線待確認 · 自動重試'};
  return {stale:false,label:'延遲報價 · 頁面已載入'};
}
function updateNightMode(now=Date.now()){
  const n=DockFeatures.nightSettings(prefs.night),active=DockFeatures.isNight(now,n);
  document.body.classList.toggle('night-mode',active);
  document.body.style.setProperty('--night-shade',active?String(1-n.brightness/100):'0');
  $('#night-indicator').hidden=!active;
}
function updateMarketStatus(now=Date.now()){
  const host=$('#market-session');host.hidden=!prefs.symbols.some(s=>/^(NASDAQ|NYSE|AMEX|NYSEARCA|ARCA):/.test(s.symbol));
  if(host.hidden)return;const m=DockFeatures.marketStatus(now);
  $('#market-state').textContent='美股 · '+m.label;host.dataset.state=m.state;
  $('#market-countdown').textContent=m.target?m.targetLabel+' '+DockFeatures.shortCountdown(m.target-now):'';
  host.title='紐約時間 · 已核對 2026–2028 交易日曆；不包含臨時停市。';
}
function homeSessionKey(s){return s?s.id+':'+s.state:'none'}
function updateF1Home(now=Date.now()){
  const s=DockFeatures.nextSession(f1?.races,now),key=homeSessionKey(s);
  if(key!==f1HomeKey)renderF1();
  const countdownNode=$('#countdown');if(countdownNode)countdownNode.textContent=DockFeatures.sessionCountdown(s,now);
  const fresh=!DockFeatures.freshness(f1?.at,1800000,navigator.onLine,f1Error,false,now).stale;
  const soon=fresh&&s?.state==='upcoming'&&s.at-now<=1800000;
  const active=fresh&&s?.state==='scheduled';
  $('.racing').classList.toggle('event-soon',soon);$('.racing').classList.toggle('event-scheduled',active);
  const flag=$('#f1-event-flag');if(flag){flag.textContent=active?'按賽程':soon?'即將開始':'';flag.hidden=!active&&!soon}
}
function updateEventHighlights(now=Date.now()){
  const health=DockFeatures.freshness(football?.at,180000,navigator.onLine,footballError,football?.partial,now);
  const alert=DockFeatures.footballAlert(rankedGames()[0],now,!health.stale);
  $('.football').classList.toggle('event-soon',alert==='soon');$('.football').classList.toggle('event-live',alert==='live');
  if(alert==='soon'){$('#football-state').textContent='30 分鐘內開賽';$('#football-state').classList.remove('live')}
  else if(alert==='live'){$('#football-state').textContent='進行中';$('#football-state').classList.add('live')}
  else{$('#football-state').textContent=health.stale?'資料待更新':'賽程 / 賽果';$('#football-state').classList.remove('live')}
}
function updateDataHealth(now=Date.now()){
  const foot=DockFeatures.freshness(football?.at,180000,navigator.onLine,footballError,football?.partial,now),race=DockFeatures.freshness(f1?.at,1800000,navigator.onLine,f1Error,false,now),quotes=currentQuoteHealth(now);
  for(const [selector,name,data,health,error] of [['#football-time','ESPN',football,foot,footballError],['#f1-time','Jolpica F1',f1,race,f1Error]]){
    const node=$(selector);node.textContent=name+' · '+(data?stamp(data.at):'未取得資料')+(health.label?' · '+health.label:'');node.classList.toggle('data-stale',health.stale);node.title=error||'';
  }
  $('#quote-health').textContent=quotes.label;$('#quote-health').classList.toggle('data-stale',quotes.stale);
  $('#quote-health').title=lastQuoteConnection?'報價頁面重連於 '+fmt(lastQuoteConnection,{hour:'2-digit',minute:'2-digit',hour12:false})+'；價格時間以圖表為準。':'';
  $('#connection').textContent=!navigator.onLine?'離線 · 自動重連':foot.stale||race.stale||quotes.stale?'部份資料待更新':'ONLINE';
  $('#connection').classList.toggle('data-stale',foot.stale||race.stale||quotes.stale);
}
function updateDockFeatures(now=Date.now()){updateNightMode(now);updateMarketStatus(now);updateF1Home(now);updateEventHighlights(now);updateDataHealth(now)}
function scheduleRefresh(kind){
  if(kind==='football'){footballFailures=footballError?footballFailures+1:0;footballNextAt=Date.now()+DockFeatures.retryDelay(footballFailures,60000)}
  else {f1Failures=f1Error?f1Failures+1:0;f1NextAt=Date.now()+DockFeatures.retryDelay(f1Failures,900000)}
}
function maintainConnections(){
  if(document.hidden||!navigator.onLine)return;const now=Date.now();
  const kinds=[];if(now>=footballNextAt)kinds.push('football');if(now>=f1NextAt)kinds.push('f1');if(kinds.length&&!busy)refresh(kinds);
  const q=currentQuoteHealth(now);if(now-lastQuoteConnection>=(q.stale?30000:300000))reconnectQuotes();
}
function showNightSettings(){const n=DockFeatures.nightSettings(prefs.night);$('#night-enabled').checked=n.enabled;$('#night-start').value=n.start;$('#night-end').value=n.end;$('#night-brightness').value=n.brightness;$('#night-brightness-value').textContent=n.brightness+'%'}
function readNightSettings(){return DockFeatures.nightSettings({enabled:$('#night-enabled').checked,start:$('#night-start').value,end:$('#night-end').value,brightness:Number($('#night-brightness').value)})}
document.addEventListener('input',ev=>{if(ev.target.id==='night-brightness')$('#night-brightness-value').textContent=ev.target.value+'%'});
