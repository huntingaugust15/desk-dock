/* Personal print queue. Item text stays in this browser's local storage. */
(()=>{
  'use strict';
  const root=document.querySelector('#print-list');
  if(!root)return;
  const key='dock-print-list-v1';
  const form=root.querySelector('.print-form'),input=root.querySelector('#print-item-text');
  const pending=root.querySelector('#print-pending'),finished=root.querySelector('#print-finished');
  const completed=root.querySelector('#print-completed'),status=root.querySelector('#print-status');
  let items=[],editing=null,deleted=null,drag=null,ignoreClickUntil=0;
  const say=(text,error=false)=>{status.textContent=text;status.classList.toggle('print-error',error)};
  try{
    const raw=localStorage.getItem(key);
    if(raw){
      const data=JSON.parse(raw);
      if(data.version!==1||!Array.isArray(data.items))throw Error('format');
      const ids=new Set();
      items=data.items.filter(x=>x&&typeof x.id==='string'&&!ids.has(x.id)&&ids.add(x.id)&&typeof x.text==='string'&&x.text.trim()&&x.text.length<=500&&typeof x.done==='boolean').map(x=>({id:x.id,text:x.text,done:x.done}));
    }
  }catch{say('未能讀取已存列表，請先確認瀏覽器儲存空間。',true)}
  function save(next,message){
    try{localStorage.setItem(key,JSON.stringify({version:1,items:next}))}
    catch{say('未能儲存，請檢查瀏覽器儲存空間後重試。',true);return false}
    items=next;say(message);render();return true;
  }
  function button(text,action,id){
    const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.printAction=action;b.dataset.itemId=id;return b;
  }
  function row(item){
    const li=document.createElement('li');li.className='print-item';li.dataset.itemId=item.id;
    if(editing===item.id){
      const edit=document.createElement('form');edit.className='print-edit';edit.dataset.editId=item.id;
      const text=document.createElement('textarea');text.value=item.text;text.maxLength=500;text.rows=3;text.required=true;text.setAttribute('aria-label','修改待打印事項');
      const controls=document.createElement('div');controls.className='print-actions';
      const submit=document.createElement('button');submit.type='submit';submit.textContent='儲存';
      controls.append(submit,button('取消','cancel',item.id));edit.append(text,controls);li.append(edit);return li;
    }
    const label=document.createElement('label');label.className='print-check';
    const check=document.createElement('input');check.type='checkbox';check.checked=item.done;check.dataset.toggleId=item.id;
    const text=document.createElement('span');text.className='print-item-text';text.textContent=item.text;
    label.append(check,text);
    const controls=document.createElement('div');controls.className='print-row-actions';
    controls.append(button('修改','edit',item.id),button('刪除','delete',item.id));
    const swipe=document.createElement('div');swipe.className='print-swipe';
    const front=document.createElement('div');front.className='print-front';
    const menu=button('⋯','menu',item.id);menu.className='print-menu';menu.setAttribute('aria-label','顯示事項操作');menu.setAttribute('aria-expanded','false');
    controls.id='print-actions-'+item.id;menu.setAttribute('aria-controls',controls.id);
    if(!item.done){
      const handle=button('⠿','drag',item.id);handle.className='print-drag-handle';handle.disabled=editing!==null;
      handle.setAttribute('aria-label','拖曳排序：'+item.text.slice(0,60));handle.title='拖曳排序，或使用上下方向鍵';front.append(handle);
    }
    front.append(label,menu);swipe.append(front,controls);
    swipe.addEventListener('scroll',()=>{
      menu.setAttribute('aria-expanded',String(swipe.scrollLeft>20));
      if(swipe.scrollLeft>4)for(const other of root.querySelectorAll('.print-swipe'))if(other!==swipe&&other.scrollLeft>0)other.scrollLeft=0;
    },{passive:true});
    swipe.addEventListener('keydown',ev=>{if(ev.key==='Escape'){swipe.scrollTo({left:0,behavior:'smooth'});menu.focus()}});
    li.classList.toggle('is-done',item.done);li.append(swipe);return li;
  }
  function render(){
    pending.replaceChildren();finished.replaceChildren();
    const count=items.filter(x=>!x.done).length;
    root.querySelector('#print-count').textContent=count+' 項待打印';
    for(const item of items)(item.done?finished:pending).append(row(item));
    if(!count){const empty=document.createElement('li');empty.className='print-empty';empty.textContent=items.length?'全部完成了。':'還未有待打印事項。';pending.append(empty)}
    const done=items.length-count;
    completed.hidden=!done;completed.querySelector('summary').textContent='已完成（'+done+'）';
    root.querySelector('#print-undo').hidden=!deleted;
  }
  function pendingOrder(){return items.filter(x=>!x.done).map(x=>x.id)}
  function saveOrder(order){
    const before=pendingOrder();
    if(order.length!==before.length||new Set(order).size!==before.length||order.some(id=>!before.includes(id)))return false;
    const byId=new Map(items.map(x=>[x.id,x]));let position=0;
    return save(items.map(x=>x.done?x:byId.get(order[position++])),'已儲存打印次序。');
  }
  function placeDraggedRow(){
    if(!drag)return;
    const before=[...pending.querySelectorAll('.print-item')].find(li=>li!==drag.row&&drag.y<li.getBoundingClientRect().top+li.getBoundingClientRect().height/2);
    if(drag.row.nextElementSibling!==(before||null))pending.insertBefore(drag.row,before||null);
    drag.ghost.style.top=(drag.y-drag.offset)+'px';
  }
  function scrollDrag(){
    if(!drag)return;
    const edge=64,height=window.innerHeight;
    const delta=drag.y<edge?-Math.ceil((edge-drag.y)/5):drag.y>height-edge?Math.ceil((drag.y-height+edge)/5):0;
    if(delta){window.scrollBy(0,Math.max(-14,Math.min(14,delta)));placeDraggedRow()}
    drag.frame=requestAnimationFrame(scrollDrag);
  }
  function finishDrag(cancel=false){
    if(!drag)return;
    const active=drag;drag=null;cancelAnimationFrame(active.frame);active.ghost.remove();active.row.classList.remove('is-dragging');root.classList.remove('is-sorting');
    if(root.hasPointerCapture(active.pointerId))root.releasePointerCapture(active.pointerId);
    ignoreClickUntil=Date.now()+250;
    const order=[...pending.querySelectorAll('.print-item')].map(li=>li.dataset.itemId);
    if(cancel){render();return}
    if(order.join('|')!==pendingOrder().join('|')&&!saveOrder(order))render();
  }
  root.addEventListener('pointerdown',ev=>{
    const handle=ev.target.closest('.print-drag-handle');
    if(!handle||handle.disabled||drag||!ev.isPrimary||ev.button!==0)return;
    ev.preventDefault();
    for(const swipe of root.querySelectorAll('.print-swipe'))swipe.scrollLeft=0;
    const row=handle.closest('.print-item'),rect=row.getBoundingClientRect();
    const ghost=document.createElement('div');ghost.className='print-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.textContent=row.querySelector('.print-item-text').textContent;
    ghost.style.left=rect.left+'px';ghost.style.top=rect.top+'px';ghost.style.width=rect.width+'px';root.append(ghost);
    drag={row,ghost,pointerId:ev.pointerId,y:ev.clientY,offset:ev.clientY-rect.top,frame:0};
    row.classList.add('is-dragging');root.classList.add('is-sorting');root.setPointerCapture(ev.pointerId);drag.frame=requestAnimationFrame(scrollDrag);
  });
  root.addEventListener('pointermove',ev=>{if(drag&&ev.pointerId===drag.pointerId){ev.preventDefault();drag.y=ev.clientY;placeDraggedRow()}});
  root.addEventListener('pointerup',ev=>{if(drag&&ev.pointerId===drag.pointerId)finishDrag()});
  root.addEventListener('pointercancel',ev=>{if(drag&&ev.pointerId===drag.pointerId)finishDrag(true)});
  root.addEventListener('lostpointercapture',()=>{if(drag)finishDrag(true)});
  window.addEventListener('blur',()=>finishDrag(true));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDrag(true)});
  root.addEventListener('click',ev=>{if(drag||Date.now()<ignoreClickUntil){ev.preventDefault();ev.stopImmediatePropagation()}},true);
  root.addEventListener('keydown',ev=>{
    const handle=ev.target.closest('.print-drag-handle');
    if(ev.key==='Escape'&&drag){ev.preventDefault();finishDrag(true);return}
    if(!handle||handle.disabled||!['ArrowUp','ArrowDown'].includes(ev.key))return;
    ev.preventDefault();const order=pendingOrder(),at=order.indexOf(handle.dataset.itemId),next=at+(ev.key==='ArrowUp'?-1:1);
    if(at<0||next<0||next>=order.length)return;
    [order[at],order[next]]=[order[next],order[at]];
    if(saveOrder(order))for(const button of pending.querySelectorAll('.print-drag-handle'))if(button.dataset.itemId===handle.dataset.itemId){button.focus();break}
  });
  form.addEventListener('submit',ev=>{
    ev.preventDefault();const text=input.value.trim();if(!text){input.setCustomValidity('請輸入待打印事項');input.reportValidity();return}
    const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    if(save([...items,{id,text,done:false}],'已加入待打印事項。')){input.value='';input.focus()}
  });
  input.addEventListener('input',()=>input.setCustomValidity(''));
  root.addEventListener('submit',ev=>{
    const edit=ev.target.closest('[data-edit-id]');if(!edit)return;ev.preventDefault();
    const field=edit.querySelector('textarea'),text=field.value.trim();if(!text){field.setCustomValidity('請輸入待打印事項');field.reportValidity();return}
    const previous=editing;editing=null;
    if(!save(items.map(x=>x.id===edit.dataset.editId?{...x,text}:x),'已儲存修改。'))editing=previous;
  });
  root.addEventListener('input',ev=>{if(ev.target.matches('.print-edit textarea'))ev.target.setCustomValidity('')});
  root.addEventListener('change',ev=>{
    const id=ev.target.dataset.toggleId;if(!id)return;
    if(!save(items.map(x=>x.id===id?{...x,done:ev.target.checked}:x),ev.target.checked?'已標記完成。':'已移回待打印。'))ev.target.checked=!ev.target.checked;
  });
  root.addEventListener('click',ev=>{
    const target=ev.target.closest('[data-print-action]');if(!target)return;
    const action=target.dataset.printAction,id=target.dataset.itemId;
    if(action==='menu'){
      const swipe=target.closest('.print-swipe');swipe.scrollTo({left:swipe.scrollLeft>20?0:swipe.scrollWidth-swipe.clientWidth,behavior:'smooth'});return;
    }
    if(action==='edit'){editing=id;render();root.querySelector('.print-edit textarea')?.focus()}
    if(action==='cancel'){editing=null;render()}
    if(action==='delete'){
      const index=items.findIndex(x=>x.id===id);if(index<0)return;
      const previous=deleted;deleted={item:items[index],index};
      if(!save(items.filter(x=>x.id!==id),'已刪除事項，可按復原。'))deleted=previous;
    }
    if(action==='undo'&&deleted){
      const previous=deleted,next=items.slice();next.splice(Math.min(deleted.index,next.length),0,deleted.item);deleted=null;
      if(!save(next,'已復原事項。'))deleted=previous;
    }
  });
  render();
})();
