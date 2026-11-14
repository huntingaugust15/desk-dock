/* Publisher headlines only; collection and grouping run in the cloud. */
const NEWS_PUBLISHERS={technews:{name:'科技新報',host:'technews.tw'},ithome:{name:'iThome',host:'ithome.com.tw'}};
const NEWS_REMOTE='https://raw.githubusercontent.com/huntingaugust15/desk-dock/main/assets/news.json';
let newsData=null,newsIndex=0,newsSource='all',newsSelectedId=null,newsBusy=false,newsAttempt=0,newsError=false,newsPaused=false,newsRotated=Date.now();
function validNewsArticle(item,now){
  if(!item||typeof item!=='object')return null;const source=NEWS_PUBLISHERS[item.sourceId];
  if(!source||typeof item.title!=='string'||!item.title.trim()||item.title.length>280)return null;
  try{const url=new URL(item.url),at=Date.parse(item.publishedAt);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!(url.hostname===source.host||url.hostname.endsWith('.'+source.host))||!Number.isFinite(at)||at<now-7*86400000||at>now+600000)return null;return{id:String(item.id||url.href),title:item.title,url:url.href,publishedAt:new Date(at).toISOString(),sourceId:item.sourceId,sourceName:source.name}}catch{return null}
}
function validNews(data,now=Date.now()){
  if(data?.version!==1||!Array.isArray(data.articles)||!Array.isArray(data.sources)||!Number.isFinite(Date.parse(data.generatedAt))||Date.parse(data.generatedAt)>now+600000)return null;
  const seen=new Set(),articles=[];
  for(const item of data.articles.slice(0,100)){
    const clean=validNewsArticle(item,now);if(!clean||seen.has(clean.url))continue;seen.add(clean.url);
    const related=[];for(const other of (Array.isArray(item.related)?item.related:[]).slice(0,8)){const valid=validNewsArticle(other,now);if(valid&&!seen.has(valid.url)){related.push(valid);seen.add(valid.url)}}
    articles.push({...clean,clusterId:typeof item.clusterId==='string'?item.clusterId.slice(0,120):clean.id,related});
  }
  return{version:1,generatedAt:data.generatedAt,contentUpdatedAt:Number.isFinite(Date.parse(data.contentUpdatedAt))?data.contentUpdatedAt:data.generatedAt,sources:Object.entries(NEWS_PUBLISHERS).map(([id,source])=>{const status=data.sources.find(s=>s?.id===id);return{id,name:source.name,ok:status?.ok===true,lastSuccess:Number.isFinite(Date.parse(status?.lastSuccess))?status.lastSuccess:null}}),articles:articles.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt))};
}
function newsListItems(){return(newsData?.articles||[]).flatMap(group=>{if(newsSource==='all')return[group];const all=[group,...group.related],selected=all.find(a=>a.sourceId===newsSource);return selected?[{...selected,clusterId:group.clusterId,related:all.filter(a=>a.url!==selected.url)}]:[]})}
function newsItems(){const items=newsListItems();return newsSource==='all'?DockTuning.balanced(items):items}
function newsDate(value){return fmt(value,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}
function newsStale(now=Date.now()){return !navigator.onLine||!newsData||now-Date.parse(newsData.generatedAt)>7200000||newsData.sources.some(s=>!s.ok||!s.lastSuccess||now-Date.parse(s.lastSuccess)>7200000)}
function updateNewsHealth(now=Date.now()){
  const node=$('#news-time');if(!node)return;const stale=newsStale(now);
  setCardStatus(node,'RSS',newsData?'核對 '+newsDate(newsData.generatedAt):newsBusy?'正在核對來源…':'未取得資料',!navigator.onLine?'離線':stale&&newsData?'資料可能過期':newsError?'連線待恢復':'');
  node.classList.toggle('data-stale',stale||newsError);
}
function newsFilters(){return '<div class="news-filters" role="group" aria-label="新聞來源">'+[['all','全部'],...Object.entries(NEWS_PUBLISHERS).map(([id,s])=>[id,s.name])].map(([id,name])=>'<button type="button" data-news-source="'+id+'" aria-pressed="'+(newsSource===id)+'">'+name+'</button>').join('')+'</div>'}
function renderNews(){
  const items=newsItems();newsIndex=items.length?Math.min(newsIndex,items.length-1):0;const item=items[newsIndex];
  $('#news-content').innerHTML=item?'<div class="news-byline"><span>'+esc(item.sourceName)+(item.related.length?' · 同題 '+(item.related.length+1)+' 篇':'')+'</span><time datetime="'+esc(item.publishedAt)+'">發佈 '+esc(newsDate(item.publishedAt))+'</time></div><button type="button" class="news-headline" data-detail="news">'+esc(item.title)+'</button>':'<p class="empty">'+(newsBusy?'正在讀取科技新聞…':newsData?'最近七天暫無新聞':'新聞暫時未能載入')+'</p>';
  $('#news-position').textContent=items.length?(newsIndex+1)+' / '+items.length:'—';$('#news-prev').disabled=items.length<2;$('#news-next').disabled=items.length<2;
  $('#news-pause').textContent=newsPaused?'繼續輪播':'暫停輪播';$('#news-pause').setAttribute('aria-pressed',String(newsPaused));updateNewsHealth();
}
function newsArticleLink(item,label){return '<a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗<span class="sr-only">：'+esc(item.title)+'</span></a>'}
function renderNewsDetail(c){
  c.innerHTML='<h2>科技新聞</h2>'+newsFilters()+'<div class="news-detail-status"><span>'+esc(newsData?'來源核對 '+newsDate(newsData.generatedAt):'尚未取得新聞')+(newsStale()?' · 資料可能過期':'')+'</span><button type="button" data-news-refresh '+(newsBusy?'disabled':'')+'>'+(newsBusy?'核對中':'更新')+'</button></div><ol class="news-list">'+newsListItems().map(item=>'<li data-reading-anchor="news-'+esc(item.clusterId)+'"><div class="news-byline"><span>'+esc(item.sourceName)+'</span><time datetime="'+esc(item.publishedAt)+'">發佈 '+esc(newsDate(item.publishedAt))+'</time></div><h3>'+esc(item.title)+'</h3>'+newsArticleLink(item,'閱讀原文')+(item.related.length?'<details class="news-related" data-reading-open="news-'+esc(item.clusterId)+'"><summary>同題報道 · '+item.related.length+' 篇</summary>'+item.related.map(other=>'<div><span>'+esc(other.sourceName)+' · '+esc(newsDate(other.publishedAt))+'</span>'+newsArticleLink(other,other.title)+'</div>').join('')+'</details>':'')+'</li>').join('')+'</ol>'+(!newsListItems().length?'<p class="empty">'+(newsBusy?'正在讀取…':'最近七天暫無新聞')+'</p>':'')+(newsData?'<div class="news-source-checks">'+newsData.sources.map(s=>'<span class="'+(!s.ok?'data-stale':'')+'">'+esc(s.name)+' · '+esc(s.lastSuccess?'核對 '+newsDate(s.lastSuccess):'未取得資料')+(!s.ok?' · 更新失敗':'')+'</span>').join('')+'</div>':'');
}
function refreshNewsDetail(){if($('#detail').open&&$('#detail').dataset.kind==='news')renderNewsDetail($('#detail-content'))}
function acceptNews(value){
  const clean=validNews(value);if(!clean)return false;if(newsData&&Date.parse(clean.generatedAt)<Date.parse(newsData.generatedAt))return true;
  const current=newsItems()[newsIndex]?.clusterId||newsSelectedId;newsData=clean;const next=newsItems().findIndex(a=>a.clusterId===current);newsIndex=next<0?Math.min(newsIndex,Math.max(0,newsItems().length-1)):next;
  storage.set('dock-news-cache-v1',clean);renderNews();refreshNewsDetail();return true;
}
async function loadNews(force=false){
  if(newsBusy||document.hidden||!navigator.onLine||!force&&Date.now()-newsAttempt<300000)return;
  newsBusy=true;newsAttempt=Date.now();renderNews();refreshNewsDetail();
  const remote=(location.hostname==='huntingaugust15.github.io'?NEWS_REMOTE:'assets/news.json')+'?t='+Math.floor(Date.now()/300000);
  try{if(!acceptNews(await getJSON(remote)))throw new Error('Invalid news data');newsError=false}catch{newsError=true;if(!newsData)try{acceptNews(await getJSON('assets/news.json'))}catch{}}
  finally{newsBusy=false;renderNews();refreshNewsDetail()}
}
function moveNews(delta){const items=newsItems();if(items.length){newsIndex=(newsIndex+delta+items.length)%items.length;newsRotated=Date.now();renderNews()}}
function startNews(){
  newsPaused=storage.get('dock-news-paused')===true;acceptNews(storage.get('dock-news-cache-v1'));renderNews();loadNews();
  $('#news-prev').onclick=()=>moveNews(-1);$('#news-next').onclick=()=>moveNews(1);
  $('#news-pause').onclick=()=>{newsPaused=!newsPaused;storage.set('dock-news-paused',newsPaused);newsRotated=Date.now();renderNews()};
  document.addEventListener('click',ev=>{const filter=ev.target.closest('[data-news-source]');if(filter&&['all',...Object.keys(NEWS_PUBLISHERS)].includes(filter.dataset.newsSource)){newsSource=filter.dataset.newsSource;newsIndex=0;renderNews();renderNewsDetail($('#detail-content'))}if(ev.target.closest('[data-news-refresh]'))loadNews(true)});
  document.addEventListener('visibilitychange',()=>{newsRotated=Date.now();if(!document.hidden)loadNews()});window.addEventListener('online',()=>loadNews(true));
  setInterval(()=>{if(document.hidden)return;loadNews();updateNewsHealth();if($('#detail').open||$('#preferences').open){newsRotated=Date.now();return}if(!newsPaused&&Date.now()-newsRotated>=20000)moveNews(1)},1000);
}
