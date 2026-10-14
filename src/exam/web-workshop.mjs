import {$,esc,icon,dateText,query} from './web-ui.mjs';
const categories={scene:'场景',exercise:'习题',document:'文档',paper:'整卷资源'};
export function createWorkshopUI(ctx){
  let posts=new Map(),cursor=null,publishing=null,activePost=null,searchTimer;
  const panel=document.createElement('div');panel.id='web-workshop-panel';panel.hidden=true;document.querySelector('.library-content').append(panel);
  panel.innerHTML='<div class="page-heading workshop-heading"><div><span class="web-eyebrow">把想法变成作品</span><h1>创意工坊</h1><p>分享场景、习题与文档，为同学的尝试点赞，也可以从原作开始二创。</p></div><span class="workshop-heading-art">'+icon('scene')+'</span></div><div class="workshop-filters"><div id="workshop-types">'+Object.entries({all:'全部作品',...categories}).map(([key,name])=>'<button data-workshop-category="'+key+'" class="'+(key==='all'?'active':'')+'">'+name+'</button>').join('')+'</div><label class="search-field">'+icon('book')+'<input id="workshop-search" placeholder="搜索作品或作者" aria-label="搜索作品"></label><select id="workshop-mode" aria-label="选择作品范围"><option value="public">大家的作品</option><option value="mine">我的作品</option></select><button id="workshop-refresh" aria-label="刷新作品">↻</button></div><div id="workshop-grid"></div><button id="workshop-more" hidden>加载更多作品</button>';
  document.body.insertAdjacentHTML('beforeend',`<dialog id="workshop-publish-dialog"><div class="dialog-heading"><h2>发布到创意工坊</h2><button data-web-close="workshop-publish-dialog" aria-label="关闭">×</button></div><form id="workshop-publish-form"><p id="workshop-publish-note" class="web-subtle"></p><label class="text-label">作品标题<input id="workshop-title" maxlength="140" required></label><div class="form-columns"><label class="text-label">作品类型<select id="workshop-category"><option value="scene">场景</option><option value="exercise">习题</option><option value="document">文档</option><option value="paper">整卷资源</option></select></label><label class="text-label">发布范围<select id="workshop-selection"><option value="paper">整份资源</option><option value="question">当前题目</option><option value="scene">当前场景</option></select></label></div><label class="text-label">作品介绍<textarea id="workshop-description" rows="3" maxlength="1200" placeholder="介绍你的设计思路，或希望大家探究的问题"></textarea></label><label class="check"><input id="workshop-reference" type="checkbox" checked>分享文字参考解析</label><label id="workshop-originals-label" class="check"><input id="workshop-originals" type="checkbox">同时共享原始文档，允许其他已登录用户下载</label><p class="web-subtle">发布的是当前保存版本。之后修改原稿，需要再次发布才会更新作品。</p><div class="dialog-actions"><button type="button" data-web-close="workshop-publish-dialog">取消</button><button class="primary" type="submit">发布作品</button></div></form></dialog>
  <dialog id="workshop-visibility-dialog"><div class="dialog-heading"><h2 id="workshop-visibility-title">管理作品</h2><button data-web-close="workshop-visibility-dialog" aria-label="关闭">×</button></div><form id="workshop-visibility-form"><p id="workshop-visibility-note" class="web-subtle"></p><label class="text-label">说明（可选）<textarea id="workshop-visibility-reason" rows="3" maxlength="300"></textarea></label><div class="dialog-actions"><button type="button" data-web-close="workshop-visibility-dialog">取消</button><button class="primary" type="submit">确认</button></div></form></dialog>`);
  let category='all';
  function card(post){
    return '<article class="work-card"><button class="work-card-open" data-work-open="'+post.id+'"><div class="work-card-cover '+post.category+'">'+(post.previewURL?'<img src="'+esc(post.previewURL)+'" alt="" loading="lazy">':'<span>'+icon(post.category==='scene'?'scene':post.category==='document'?'document':'book')+'</span>')+'<span class="resource-tag">'+categories[post.category]+'</span></div><div class="work-card-copy"><h3>'+esc(post.title)+'</h3><p>'+esc(post.description||'打开作品，看看其中的场景与思路。')+'</p><div class="work-card-author"><span class="student-avatar">'+(post.authorAvatarURL?'<img src="'+esc(post.authorAvatarURL)+'" alt="" loading="lazy">':esc(post.author.slice(0,1)))+'</span><span>'+esc(post.author)+(post.authorRole==='teacher'?' · 教师':'')+'</span><small>'+dateText(post.updatedAt)+'</small></div></div></button>'+
      (post.origin?'<p class="work-origin">二创自 '+(post.origin.available?'<button data-work-open="'+post.origin.id+'">'+esc(post.origin.title)+'</button>':esc(post.origin.title))+' · '+esc(post.origin.author)+'</p>':'')+
      '<div class="work-card-actions"><button data-work-like="'+post.id+'" class="'+(post.liked?'is-liked':'')+'" '+(post.mine||!post.visible?'disabled':'')+' aria-label="'+(post.liked?'取消点赞':'点赞')+'">'+icon('like')+'<span>'+post.likeCount+'</span></button><button data-work-remix="'+post.id+'" '+(!post.visible?'disabled':'')+'>'+icon('remix')+'<span>二创 '+post.remixCount+'</span></button>'+(post.mine||post.manageable?'<button data-work-visibility="'+post.id+'" class="work-manage">'+(post.visible?'撤下':post.moderated?'教师已撤下':'恢复')+'</button>':'')+'</div>'+'<div class="work-card-community"><button data-profile="'+post.authorId+'">查看作者</button><button data-work-discuss="'+post.id+'" '+(!post.visible?'disabled':'')+'>'+icon('feedback')+'讨论作品</button><button data-work-report="'+post.id+'" aria-label="举报作品">⋯</button></div>'+(!post.visible?'<p class="work-hidden-note">'+esc(post.moderated?'教师已撤下：'+(post.hiddenReason||'请联系教师了解详情'):'作品已撤下，原稿与个人资源保留。')+'</p>':'')+'</article>';
  }
  function render(){
    $('workshop-grid').innerHTML=[...posts.values()].map(card).join('')||'<div class="section-empty">'+icon('workshop')+'<h3>等待新的创意</h3><p>在“我的资源”中完成作品，打开后即可发布到这里。</p><button data-go-mine class="secondary-button">前往我的资源</button></div>';
    $('workshop-more').hidden=!cursor;
  }
  async function load(append=false){
    const mode=$('workshop-mode').value,value=await ctx.request('/api/workshop'+query({category,search:$('workshop-search').value,mine:mode==='mine'?'1':'',hidden:mode==='hidden'?'1':'',before:append?cursor:null}));
    if(!append)posts.clear();for(const post of value.posts)posts.set(post.id,post);cursor=value.nextCursor;render();
  }
  async function show(){
    panel.hidden=false;
    const hidden=$('workshop-mode').querySelector('option[value="hidden"]');
    if(ctx.user().role==='teacher'&&!hidden)$('workshop-mode').insertAdjacentHTML('beforeend','<option value="hidden">已撤下作品</option>');
    if(ctx.user().role!=='teacher'&&hidden){hidden.remove();if($('workshop-mode').value==='hidden')$('workshop-mode').value='public';}
    await load();
  }
  async function publishDialog(){
    await ctx.beforeLeave();const current=ctx.context(),meta=ctx.meta();if(!current||!meta?.writable)throw Error('请先打开自己的资源');
    publishing=current;let existing=null;
    if(meta.workshopId){const state=await ctx.request('/api/workshop/'+meta.workshopId);existing=state.post;}
    if(existing?.moderated&&ctx.user().role!=='teacher')throw Error('作品已由教师撤下，请联系教师处理');
    $('workshop-title').value=existing?.title||current.title;$('workshop-description').value=existing?.description||'';
    $('workshop-category').value=existing?.category||(current.sceneId?'scene':'exercise');
    $('workshop-selection').value=existing?.selection||(current.sceneId?'scene':'paper');
    for(const option of $('workshop-selection').options)option.disabled=option.value==='scene'?!current.sceneId:option.value==='question'?!current.questionId:false;
    if($('workshop-selection').selectedOptions[0]?.disabled)$('workshop-selection').value='paper';
    $('workshop-publish-note').textContent=existing?'这份资源已有作品“'+existing.title+'”，本次会更新它。需要保留多个独立作品时，可先复制为新资源。':'作品对平台内已登录用户可见，其他用户可以点赞和二创。';
    $('workshop-originals-label').hidden=!current.originalCount;$('workshop-originals').checked=!!existing?.includeOriginals;$('workshop-reference').checked=true;
    $('workshop-publish-dialog').showModal();
  }
  $('workshop-publish-form').addEventListener('submit',event=>ctx.run(event,async()=>{
    const post=await ctx.request('/api/workshop',{method:'POST',version:ctx.meta().version,body:{resourceId:publishing.id,title:$('workshop-title').value,description:$('workshop-description').value,category:$('workshop-category').value,selection:$('workshop-selection').value,questionId:publishing.questionId,sceneId:publishing.sceneId,includeReference:$('workshop-reference').checked,includeOriginals:!$('workshop-originals-label').hidden&&$('workshop-originals').checked}});
    ctx.published(post);$('workshop-publish-dialog').close();ctx.notify('作品已发布到创意工坊。');
  }));
  $('workshop-visibility-form').addEventListener('submit',event=>ctx.run(event,async()=>{
    const post=await ctx.request('/api/workshop/'+activePost.id,{method:'PUT',version:activePost.version,body:{visible:!activePost.visible,reason:$('workshop-visibility-reason').value}});posts.set(post.id,post);$('workshop-visibility-dialog').close();render();ctx.notify(post.visible?'作品已恢复展示。':'作品已撤下，私有原稿保留。');
  }));
  $('workshop-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>ctx.run(null,load),250);});$('workshop-mode').addEventListener('change',()=>ctx.run(null,load));
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
    if(button.dataset.workOpen)ctx.run(event,()=>ctx.openWork(button.dataset.workOpen));
    if(button.dataset.workLike)ctx.run(event,async()=>{const post=posts.get(button.dataset.workLike),updated=await ctx.request('/api/workshop/'+post.id+'/like',{method:'PUT',body:{liked:!post.liked}});posts.set(post.id,updated);render();});
    if(button.dataset.workRemix)ctx.run(event,async()=>{const state=await ctx.request('/api/workshop/'+button.dataset.workRemix+'/remix',{method:'POST',body:{}});await ctx.adopt(state);ctx.notify('已创建你的二创副本，原作保持不变。');});
    if(button.dataset.workVisibility)ctx.run(event,async()=>{activePost=posts.get(button.dataset.workVisibility);if(activePost.moderated&&ctx.user().role!=='teacher')throw Error('作品由教师撤下，请联系教师');$('workshop-visibility-title').textContent=(activePost.visible?'撤下':'恢复')+'作品';$('workshop-visibility-note').textContent='“'+activePost.title+'”'+(activePost.visible?'将从工坊移除展示，个人原稿保留。':'将重新对已登录用户展示。');$('workshop-visibility-reason').value='';$('workshop-visibility-dialog').showModal();});
    if(button.dataset.workshopCategory){category=button.dataset.workshopCategory;for(const node of document.querySelectorAll('[data-workshop-category]'))node.classList.toggle('active',node===button);ctx.run(event,load);}
    if(button.id==='workshop-refresh')ctx.run(event,load);if(button.id==='workshop-more')ctx.run(event,()=>load(true));
  });
  return {show,publishDialog,remember(post){posts.set(post.id,post);},hide(){panel.hidden=true;},reset(){clearTimeout(searchTimer);posts.clear();cursor=null;publishing=null;activePost=null;$('workshop-grid').replaceChildren();}};
}
