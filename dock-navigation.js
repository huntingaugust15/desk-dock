/* Same-document history for the Dock. Stores view choices, never result data. */
const DockNavigation=(()=>{
  const kinds=['home','stocks','football','f1','news','preferences'];
  const id=value=>typeof value==='string'&&/^\d{1,12}$/.test(value)?value:null;
  function clean(value){
    if(!value||!kinds.includes(value.kind))return null;
    const route={kind:value.kind};
    if(value.kind==='football'){
      route.match=value.match&&id(value.match.id)?{id:id(value.match.id),tab:['lineup','players','stats','events','form','h2h'].includes(value.match.tab)?value.match.tab:'lineup',team:id(value.match.team)||'359'}:null;
    }
    if(value.kind==='f1'){
      route.tab=['schedule','drivers','teams','sprintQualifying','sprint','qualifying','results'].includes(value.tab)?value.tab:'schedule';
      route.resultRound=id(value.resultRound);route.sprintRound=id(value.sprintRound);
      route.season=typeof value.season==='string'&&/^\d{4}$/.test(value.season)?value.season:null;
      route.circuit=typeof value.circuit==='string'&&/^[a-z0-9_]{1,60}$/.test(value.circuit)?value.circuit:null;
    }
    if(value.kind==='stocks')route.range=['1D','1M','3M','12M','60M'].includes(value.range)?value.range:'1M';
    if(value.kind==='news')route.source=['all','technews','ithome'].includes(value.source)?value.source:'all';
    return route;
  }
  function level(route){return route.kind==='home'?0:route.kind==='football'&&route.match||route.kind==='f1'&&route.circuit?2:1}
  function parent(route){return route.kind==='football'?{kind:'football',match:null}:route.kind==='f1'?{...route,circuit:null}:{kind:'home'}}
  function entry(state){
    const saved=state?.deskDockNavigation,route=clean(saved?.route);
    return saved?.version===1&&route&&saved.index===level(route)?{version:1,index:saved.index,route}:null;
  }
  return {clean,level,parent,entry};
})();
let navigationApplying=false,navigationPending=false,navigationReady=false,preferencesInitialized=false,openPreferencesBase=null;
function currentNavigationRoute(){
  if($('#preferences').open)return {kind:'preferences'};
  if(!$('#detail').open)return {kind:'home'};
  const kind=$('#detail').dataset.kind;
  return DockNavigation.clean(kind==='football'?{kind,match:matchView?{id:matchView.id,tab:matchView.tab,team:matchView.team}:null}:kind==='f1'?{kind,tab:f1Tab,resultRound:f1ResultRound,sprintRound:f1SprintRound,season:f1Season(),circuit:circuitView?.id||null}:kind==='stocks'?{kind,range:stockRange}:{kind,source:newsSource});
}
function writeNavigation(route,push=false){
  const clean=DockNavigation.clean(route);if(!clean)return;
  const previous=history.state&&typeof history.state==='object'&&!Array.isArray(history.state)?history.state:{};
  const state={...previous,deskDockNavigation:{version:1,index:DockNavigation.level(clean),route:clean}};
  history[push?'pushState':'replaceState'](state,'');
}
function syncNavigation(){
  if(!navigationReady||navigationApplying||navigationPending)return;
  const current=DockNavigation.entry(history.state),route=currentNavigationRoute();
  if(current&&route&&current.index===DockNavigation.level(route)&&JSON.stringify(current.route)!==JSON.stringify(route))writeNavigation(route);
  updateNavigationButton();
}
function commitNavigation(route){
  const destination=DockNavigation.clean(route);if(!destination)return;
  let current=DockNavigation.entry(history.state);
  if(!current){writeNavigation({kind:'home'});current=DockNavigation.entry(history.state)}
  const level=DockNavigation.level(destination);
  if(level===2){
    if(current.index===0)writeNavigation(DockNavigation.parent(destination),true);
    else if(current.index===1&&current.route.kind!==destination.kind)writeNavigation(DockNavigation.parent(destination));
    writeNavigation(destination,current.index<2);
  }else if(level===1)writeNavigation(destination,current.index===0);
  else writeNavigation(destination);
  updateNavigationButton();
}
function navigateWith(action){
  if(navigationApplying)return action();
  if(navigationPending)return;
  syncNavigation();saveReadingState();navigationApplying=true;
  try{return action()}finally{navigationApplying=false;commitNavigation(currentNavigationRoute())}
}
function updateNavigationButton(){
  const button=$('#detail-back');if(!button)return;
  const route=currentNavigationRoute(),nested=route&&DockNavigation.level(route)===2;
  button.hidden=!nested;
  if(nested){button.textContent=route.kind==='football'?'← 賽程':'← F1';button.setAttribute('aria-label',route.kind==='football'?'返回足球賽程':'返回 F1 詳情')}
}
function applyNavigation(route){
  route=DockNavigation.clean(route)||{kind:'home'};saveReadingState();navigationApplying=true;
  try{
    if(route.kind==='home'){
      if($('#preferences').open)$('#preferences').close();
      if($('#detail').open)$('#detail').close();
      return;
    }
    if(route.kind==='preferences'){
      if($('#detail').open)$('#detail').close();
      if(!preferencesInitialized){openPreferencesBase();preferencesInitialized=true}
      else if(!$('#preferences').open)$('#preferences').showModal();
      return;
    }
    if($('#preferences').open)$('#preferences').close();
    matchRequest++;matchView=null;circuitView=null;readingRenderedKey='';
    $('#detail').dataset.kind=route.kind;
    if(route.kind==='football'&&route.match)matchView={...route.match,returnScroll:0,error:false,loading:false};
    if(route.kind==='f1'){
      f1Tab=route.tab;f1DetailSeason=route.season;f1ResultRound=route.resultRound;f1SprintRound=route.sprintRound;
      if(route.circuit)circuitView={id:route.circuit,returnScroll:0};
    }
    if(route.kind==='stocks')stockRange=route.range;
    if(route.kind==='news'){newsSource=route.source;renderNews()}
    $('#detail-eyebrow').textContent='DESK DOCK / '+({stocks:'MARKETS',football:'FOOTBALL',f1:'FORMULA 1',news:'TECH NEWS'}[route.kind]);
    if(!$('#detail').open)$('#detail').showModal();
    renderDetail(route.kind);
    if(matchView)loadMatchDetail(matchView.id);
    if(circuitView){loadCircuitFacts();loadCircuitWinners(circuitView.id)}
  }finally{navigationApplying=false;updateNavigationButton()}
}
function leaveNavigation(all=false){
  if(navigationPending)return;
  const current=DockNavigation.entry(history.state);
  saveReadingState();syncNavigation();
  if(current?.index>0){
    navigationPending=true;
    try{history.go(all?-current.index:-1)}catch{navigationPending=false;const route=all?{kind:'home'}:DockNavigation.parent(current.route);writeNavigation(route);applyNavigation(route)}
  }else{
    const route=all?{kind:'home'}:DockNavigation.parent(currentNavigationRoute()||{kind:'home'});
    writeNavigation(route);applyNavigation(route);
  }
}
function setupNavigation(){
  const originalOpen=openDetail,originalMatch=openFootballMatch,originalCircuit=openCircuit;
  openDetail=(...args)=>navigateWith(()=>originalOpen(...args));
  openFootballMatch=(...args)=>navigateWith(()=>originalMatch(...args));
  openCircuit=(...args)=>navigateWith(()=>originalCircuit(...args));
  openPreferencesBase=$('#settings').onclick;
  $('#settings').onclick=()=>navigateWith(()=>{preferencesInitialized=true;openPreferencesBase()});
  const saved=DockNavigation.entry(history.state);
  if(saved&&history.length>saved.index){
    navigationReady=true;
    // Wait for the synchronous cache hydration in refresh() before rendering a restored view.
    queueMicrotask(()=>{if(DockNavigation.entry(history.state)&&!$('#detail').open&&!$('#preferences').open)applyNavigation(saved.route)});
  }else{
    writeNavigation({kind:'home'});navigationReady=true;
    if(saved&&saved.index>0){commitNavigation(saved.route);queueMicrotask(()=>applyNavigation(saved.route))}
  }
  window.addEventListener('popstate',event=>{
    navigationPending=false;const destination=DockNavigation.entry(event.state);applyNavigation(destination?.route||{kind:'home'});
  });
  document.addEventListener('click',event=>{
    if(event.target.closest('#detail-back,[data-match-back],[data-circuit-back]')){event.preventDefault();event.stopImmediatePropagation();leaveNavigation();return}
    if(event.target.closest('#close-detail,#close-settings')){event.preventDefault();event.stopImmediatePropagation();leaveNavigation(true)}
  },true);
  document.addEventListener('click',()=>queueMicrotask(syncNavigation));
  document.addEventListener('change',()=>queueMicrotask(syncNavigation));
  for(const dialog of [$('#detail'),$('#preferences')]){
    dialog.addEventListener('cancel',event=>{event.preventDefault();leaveNavigation()},true);
    dialog.addEventListener('close',()=>{
      if(!navigationApplying&&!navigationPending&&DockNavigation.entry(history.state)?.index>0&&!$('#detail').open&&!$('#preferences').open)leaveNavigation(true);
    });
  }
  // Async data can resolve a previously unknown F1 season/round after opening.
  const renderF1=renderF1Detail;renderF1Detail=(...args)=>{try{return renderF1(...args)}finally{syncNavigation()}};
  window.addEventListener('pageshow',event=>{if(event.persisted){navigationPending=false;const entry=DockNavigation.entry(history.state);if(entry)applyNavigation(entry.route)}});
  updateNavigationButton();
}
