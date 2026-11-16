'use strict';
// Fit the existing live quote image; never read prices from a third-party frame.
const DockStockLens=(()=>{
  const tiles=new Set();let primary=null;
  function measure(height,width){
    if(!Number.isFinite(height)||!Number.isFinite(width)||height<=0||width<=72)return null;
    const zoom=Math.floor(Math.min(2.2,(height+6)/56,(width-72)/108)*1000)/1000;
    if(zoom<=0)return null;
    return {zoom,offset:Math.max(0,56*zoom-height),lensWidth:108*zoom};
  }
  function fit(tile){
    if(!tile.isConnected)return;
    const box=tile.getBoundingClientRect(),m=measure(box.height,box.width);if(!m)return;
    const zoom=String(m.zoom),offset=m.offset.toFixed(3)+'px';
    if(tile.style.getPropertyValue('--quote-zoom')!==zoom)tile.style.setProperty('--quote-zoom',zoom);
    if(tile.style.getPropertyValue('--quote-offset')!==offset)tile.style.setProperty('--quote-offset',offset);
  }
  function fitSports(){
    const app=document.querySelector('.app');if(!app)return;
    const cards=[...document.querySelectorAll('.primary-cards>.football,.primary-cards>.racing')];
    const tight=app.classList.contains('stock-pair-mode')&&cards.some(card=>card.getBoundingClientRect().height<144);
    app.classList.toggle('dock-tight-sports',tight);
  }
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{
    for(const entry of entries)if(tiles.has(entry.target))fit(entry.target);
    fitSports();
  }):null;
  function refresh(){for(const tile of tiles)fit(tile);fitSports()}
  function reset(){for(const tile of tiles)observer?.unobserve(tile);tiles.clear()}
  function watch(tile){
    const container=document.querySelector('.primary-cards');
    if(container!==primary){if(primary)observer?.unobserve(primary);primary=container;if(primary)observer?.observe(primary)}
    tiles.add(tile);observer?.observe(tile);fit(tile);fitSports();
  }
  if(typeof window!=='undefined')window.addEventListener('resize',refresh,{passive:true});
  return {measure,watch,reset,refresh};
})();
