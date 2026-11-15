/* Publisher headlines only. No account or home server is needed. */
(()=>{
  'use strict';
  const root=document.querySelector('#arsenal-ticker');if(!root)return;
  const viewport=root.querySelector('.arsenal-window'),pause=root.querySelector('button');
  const cacheKey='dock-arsenal-transfers-v1',remote='https://raw.githubusercontent.com/huntingaugust15/desk-dock/main/assets/arsenal-transfers.json';
  let data=null,busy=false,failed=false,attempt=0,paused=false,signature='';
  function valid(value){
    const now=Date.now();
    if(value?.version!==1||!Array.isArray(value.articles)||!Number.isFinite(Date.parse(value.generatedAt))||Date.parse(value.generatedAt)>now+600000)return null;
    const seen=new Set(),articles=[];
    for(const item of value.articles.slice(0,30)){
      try{
        const url=new URL(item.url),at=Date.parse(item.publishedAt);
        if(url.protocol!=='https:'||url.hostname!=='arseblog.news'||url.username||url.password||url.port||!Number.isFinite(at)||at<now-30*86400000||at>now+600000||typeof item.title!=='string'||!item.title.trim()||item.title.length>280||seen.has(url.href))continue;
        seen.add(url.href);articles.push({title:item.title,url:url.href,publishedAt:new Date(at).toISOString()});
      }catch{}
    }
    return{version:1,generatedAt:value.generatedAt,articles:articles.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,12)};
  }
  function state(){
    const stale=data&&Date.now()-Date.parse(data.generatedAt)>7200000;
    root.classList.toggle('is-paused',paused||document.hidden);
    root.classList.toggle('is-stale',!!stale||failed||!navigator.onLine);
    const checked=data?new Date(data.generatedAt).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'未取得資料';
    root.querySelector('.arsenal-label').title='來源 Arseblog · 核對 '+checked+(!navigator.onLine?' · 離線':stale||failed?' · 資料可能過期':'');
    pause.textContent=paused?'▶':'Ⅱ';pause.setAttribute('aria-label',paused?'播放 Arsenal 轉會新聞':'暫停 Arsenal 轉會新聞');pause.setAttribute('aria-pressed',String(paused));
    pause.disabled=!data?.articles.length;
  }
  function size(){
    const group=viewport.querySelector('.arsenal-group');
    if(group)root.style.setProperty('--arsenal-duration',Math.max(32,group.getBoundingClientRect().width/24)+'s');
  }
  function render(){
    if(data)data=valid(data);
    const next=JSON.stringify(data?.articles||[])+(data?'loaded':failed?'error':'loading');
    if(next!==signature||!viewport.firstChild){
      signature=next;viewport.replaceChildren();
      if(data?.articles.length){
        const track=document.createElement('div');track.className='arsenal-track';
        const group=document.createElement('div');group.className='arsenal-group';
        for(const item of data.articles){
          const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';
          const date=new Date(item.publishedAt).toLocaleDateString('zh-HK',{timeZone:'Asia/Hong_Kong',day:'numeric',month:'numeric'});
          link.textContent=item.title+'  ·  Arseblog '+date;group.append(link);
        }
        const repeat=group.cloneNode(true);repeat.setAttribute('aria-hidden','true');for(const link of repeat.querySelectorAll('a'))link.tabIndex=-1;
        track.append(group,repeat);viewport.append(track);size();
      }else{
        const message=document.createElement('span');message.className='arsenal-empty';message.textContent=data?'近 30 日沒有新的轉會報道':failed?'轉會新聞暫時未能載入':'正在讀取轉會新聞…';viewport.append(message);
      }
    }
    state();
  }
  async function fetchData(url){
    const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(14000)});if(!response.ok)throw Error('HTTP '+response.status);
    const parsed=valid(await response.json());if(!parsed)throw Error('Invalid feed');return parsed;
  }
  async function refresh(){
    if(busy||document.hidden||!navigator.onLine)return;
    busy=true;attempt=Date.now();
    try{
      let value;try{value=await fetchData(remote)}catch{value=await fetchData('assets/arsenal-transfers.json')}
      if(!data||Date.parse(value.generatedAt)>=Date.parse(data.generatedAt))data=value;
      failed=Date.now()-Date.parse(data.generatedAt)>7200000;
      try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}
    }catch{failed=true}finally{busy=false;render()}
  }
  pause.addEventListener('click',()=>{paused=!paused;state()});
  document.addEventListener('visibilitychange',()=>{state();if(!document.hidden&&Date.now()-attempt>300000)refresh()});
  window.addEventListener('online',refresh);window.addEventListener('offline',state);
  window.addEventListener('resize',size);
  if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(viewport);
  try{data=valid(JSON.parse(localStorage.getItem(cacheKey)))}catch{}
  render();refresh();setInterval(()=>{render();if(Date.now()-attempt>=300000)refresh()},60000);
})();
