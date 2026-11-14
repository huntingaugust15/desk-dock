/* Remember selections and stable reading anchors, never result/reveal state. */
let readingState={version:1,selections:{},positions:{}},readingRenderedKey='',readingDepth=0,readingSaveTimer=0;
const readingPending=new Map();
function footballReadingScope(){return [prefs.footballMode,prefs.league,prefs.team||''].join('|')}
function readingKey(){
  const kind=$('#detail').dataset.kind;
  if(kind==='football')return 'football:'+footballReadingScope()+':'+(matchView?'match:'+matchView.id+':'+matchView.tab+':'+matchView.team:'schedule');
  if(kind==='f1')return 'f1:'+(f1Season()||'')+':'+(circuitView?'circuit:'+circuitView.id:f1Tab+':'+(hasF1RaceResults(f1Tab)?selectedF1Round()||'':''));
  if(kind==='stocks')return 'stocks:'+prefs.symbols.map(s=>s.symbol).join(',')+':'+stockRange;
  return 'news:'+newsSource;
}
function captureReadingPosition(){
  const dialog=$('#detail'),top=dialog.getBoundingClientRect().top;
  const anchors=[...dialog.querySelectorAll('[data-reading-anchor]')];
  const anchor=anchors.find(e=>e.getBoundingClientRect().bottom>top+24);
  return {top:dialog.scrollTop,anchor:anchor?.dataset.readingAnchor||'',offset:anchor?anchor.getBoundingClientRect().top-top:0,expanded:[...dialog.querySelectorAll('details[open][data-reading-open]')].map(e=>e.dataset.readingOpen),at:Date.now()};
}
function storeReadingPosition(){if($('#detail').open&&readingRenderedKey&&!readingPending.has(readingRenderedKey))readingState.positions[readingRenderedKey]=captureReadingPosition()}
function saveReadingState(){
  const kind=$('#detail').dataset.kind;if(!kind)return;
  storeReadingPosition();
  if(kind==='football')readingState.selections.football={scope:footballReadingScope(),match:matchView?{id:matchView.id,tab:matchView.tab,team:matchView.team,returnScroll:matchView.returnScroll}:null};
  if(kind==='f1')readingState.selections.f1={tab:f1Tab,resultRound:f1ResultRound,sprintRound:f1SprintRound,season:f1Season(),circuit:circuitView?{id:circuitView.id,returnScroll:circuitView.returnScroll}:null};
  if(kind==='stocks')readingState.selections.stocks={range:stockRange};
  readingState.selections.news={source:newsSource,id:newsItems()[newsIndex]?.clusterId||newsSelectedId,index:newsIndex};
  const entries=Object.entries(readingState.positions).sort((a,b)=>b[1].at-a[1].at).slice(0,60);readingState.positions=Object.fromEntries(entries);
  storage.set('dock-reading-v1',readingState);
}
function restoreReadingSelection(kind){
  const selected=readingState.selections[kind];matchView=null;circuitView=null;
  if(kind==='stocks'&&stockRanges.some(r=>r[0]===selected?.range))stockRange=selected.range;
  if(kind==='football'&&selected?.scope===footballReadingScope()&&/^\d+$/.test(selected.match?.id||'')){
    const m=selected.match;matchView={id:m.id,tab:['lineup','players','stats','events','form','h2h'].includes(m.tab)?m.tab:'lineup',team:/^\d+$/.test(m.team)?m.team:ARSENAL_TEAM_ID,returnScroll:Number.isFinite(m.returnScroll)?m.returnScroll:0,error:false,loading:false};
  }
  if(kind==='f1'&&selected){
    if(F1_TABS.some(t=>t[0]===selected.tab))f1Tab=selected.tab;
    f1DetailSeason=selected.season;
    f1ResultRound=/^\d+$/.test(selected.resultRound||'')?selected.resultRound:null;f1SprintRound=/^\d+$/.test(selected.sprintRound||'')?selected.sprintRound:null;
    if(/^[a-z0-9_]+$/.test(selected.circuit?.id||'')&&circuitRace(selected.circuit.id))circuitView={id:selected.circuit.id,returnScroll:Number.isFinite(selected.circuit.returnScroll)?selected.circuit.returnScroll:0};
  }
  if(kind==='news'&&selected){
    newsSource=['all',...Object.keys(NEWS_PUBLISHERS)].includes(selected.source)?selected.source:'all';newsSelectedId=typeof selected.id==='string'?selected.id:null;newsIndex=Number.isInteger(selected.index)?Math.max(0,selected.index):0;
  }
}
function applyReadingPosition(position,key){
  const dialog=$('#detail');if(!dialog.open||readingRenderedKey!==key)return;
  const state=position||{top:0,expanded:[]};
  for(const item of dialog.querySelectorAll('details[data-reading-open]'))item.open=(state.expanded||[]).includes(item.dataset.readingOpen);
  const anchor=[...dialog.querySelectorAll('[data-reading-anchor]')].find(e=>e.dataset.readingAnchor===state.anchor);
  if(!anchor&&state.top>dialog.scrollHeight-dialog.clientHeight+2)readingPending.set(key,state);else readingPending.delete(key);
  dialog.scrollTop=anchor?dialog.scrollTop+anchor.getBoundingClientRect().top-dialog.getBoundingClientRect().top-state.offset:state.top||0;
}
function renderRemembering(render){
  if(readingDepth||!$('#detail').open)return render();
  storeReadingPosition();const key=readingKey(),position=readingState.positions[key];readingDepth++;
  try{return render()}finally{
    readingDepth--;readingRenderedKey=key;applyReadingPosition(position,key);saveReadingState();
    const top=$('#detail').scrollTop;
    requestAnimationFrame(()=>{if($('#detail').scrollTop===top)applyReadingPosition(position,key)});
  }
}
function setupReading(){
  const saved=storage.get('dock-reading-v1');
  if(saved?.version===1&&saved.selections&&typeof saved.selections==='object'){
    readingState.selections=saved.selections;
    for(const [key,p] of Object.entries(saved.positions||{}).slice(0,60))if(key.length<300&&p&&Number.isFinite(p.top)&&p.top>=0&&p.top<1000000&&Number.isFinite(p.offset)&&Math.abs(p.offset)<1000000&&typeof p.anchor==='string'&&p.anchor.length<200)readingState.positions[key]={...p,expanded:Array.isArray(p.expanded)?p.expanded.filter(x=>typeof x==='string'&&x.length<200):[]};
  }
  const stock=readingState.selections.stocks;if(stockRanges.some(r=>r[0]===stock?.range))stockRange=stock.range;
  restoreReadingSelection('news');
  const wrap=fn=>(...args)=>renderRemembering(()=>fn(...args));
  renderStockDetail=wrap(renderStockDetail);renderFootballDetail=wrap(renderFootballDetail);renderMatchView=wrap(renderMatchView);renderF1Detail=wrap(renderF1Detail);renderCircuitView=wrap(renderCircuitView);renderNewsDetail=wrap(renderNewsDetail);
  const dialog=$('#detail');
  dialog.addEventListener('scroll',()=>{clearTimeout(readingSaveTimer);readingSaveTimer=setTimeout(saveReadingState,160)},{passive:true});
  dialog.addEventListener('cancel',saveReadingState);dialog.addEventListener('close',saveReadingState);window.addEventListener('pagehide',saveReadingState);
  for(const event of ['wheel','touchmove','keydown'])dialog.addEventListener(event,()=>readingPending.delete(readingRenderedKey),{passive:true});
}
