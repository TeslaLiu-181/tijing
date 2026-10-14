const DEFAULT_WIDTH = 400, MIN_WIDTH = 320, MAX_WIDTH = 600, MIN_CANVAS = 360;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The shell only moves and arranges one AI panel. Its owner keeps request,
// consent, history and draft state, and decides when to save or change scenes.
export function createAIDock({container = document.querySelector('.workspace'), onAction = () => {}, onVisibilityChange = () => {}} = {}) {
  if (!container) throw Error('未找到场景工作区');
  if (document.getElementById('web-ai-dock')) throw Error('AI侧栏只能创建一次');
  const element = document.createElement('aside');
  element.id = 'web-ai-dock'; element.className = 'web-ai-dock'; element.hidden = true;
  element.setAttribute('aria-label', '场景AI探究侧栏');
  element.innerHTML = '<div class="ai-dock-resizer" role="separator" tabindex="0" aria-label="调整AI侧栏宽度" aria-orientation="vertical"></div><header class="ai-dock-heading"><div class="ai-dock-title-row"><span class="ai-dock-mark" aria-hidden="true">✦</span><div><h2>AI探究助手</h2><p class="ai-dock-context" hidden></p></div><span class="ai-dock-status" role="status" hidden></span></div><div class="ai-dock-actions"><button type="button" data-dock-action="new">＋ 新探究</button><button type="button" data-dock-action="history" aria-pressed="false">探究记录</button><button type="button" data-dock-action="settings">API设置</button><button type="button" data-dock-action="collapse" class="ai-dock-close" aria-label="收起AI侧栏">收起 ›</button></div></header><div class="ai-dock-mount"></div>';
  container.append(element);
  const mount = element.querySelector('.ai-dock-mount'), resizer = element.querySelector('.ai-dock-resizer');
  const title = element.querySelector('h2'), context = element.querySelector('.ai-dock-context'), status = element.querySelector('.ai-dock-status');
  let options = null, slots = [], actionEpoch = 0;
  let panel = null, origin = null, open = false, section = 'thread', preferredWidth = DEFAULT_WIDTH, actualWidth = DEFAULT_WIDTH, drag = null, layoutFrame = 0, opener = null;

  function update(values = {}) {
    if ('section' in values) setSection(values.section);
    if ('title' in values) title.textContent = values.title || 'AI探究助手';
    if ('contextLabel' in values) { context.textContent = values.contextLabel || ''; context.title = context.textContent; context.hidden = !context.textContent; }
    if ('status' in values) { status.textContent = values.status || ''; status.hidden = !status.textContent; }
  }
  function setSection(value = 'thread') {
    if (!['thread', 'history'].includes(value)) return;
    section = value; panel?.classList.toggle('ai-dock-history', value === 'history');
    const history = element.querySelector('[data-dock-action="history"]');
    history.setAttribute('aria-pressed', String(value === 'history')); history.textContent = value === 'history' ? '返回对话' : '探究记录';
  }
  function inlineCapacity() {
    let occupied = 0;
    for (const sibling of container.querySelectorAll(".question-sidebar,#source-panel")) {
      const style = getComputedStyle(sibling);
      if (style.display !== 'none' && !['absolute', 'fixed'].includes(style.position)) occupied += sibling.getBoundingClientRect().width;
    }
    // The comfortable workspace reserves narrow rails for the reference
    // drawers. Count those margins before promising an inline canvas width.
    const main=container.querySelector('.main-panel');
    if(main){const style=getComputedStyle(main);occupied+=(parseFloat(style.marginLeft)||0)+(parseFloat(style.marginRight)||0);}
    return container.getBoundingClientRect().width - occupied;
  }
  function measureLayout() {
    layoutFrame = 0; if (!open) return;
    const landscape = matchMedia('(max-width:1000px) and (max-height:600px) and (orientation:landscape)').matches;
    const phone = innerWidth < MIN_WIDTH + MIN_CANVAS && !landscape;
    const capacity = inlineCapacity(), inline = !phone && (innerWidth >= 1100 || landscape) && capacity >= MIN_WIDTH + MIN_CANVAS;
    const layout = phone ? 'sheet' : inline ? 'inline' : 'overlay';
    const frame = container.querySelector('#editor')?.getBoundingClientRect();
    const overlayRoom = frame ? container.getBoundingClientRect().right - frame.left - MIN_CANVAS : innerWidth - MIN_CANVAS;
    const max = inline ? Math.min(MAX_WIDTH, capacity - MIN_CANVAS) : Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, phone ? innerWidth - 32 : overlayRoom));
    actualWidth = clamp(preferredWidth, MIN_WIDTH, max);
    element.style.setProperty('--ai-dock-width', actualWidth + 'px'); element.dataset.layout = layout;
    document.body.classList.toggle('ai-dock-inline', layout === 'inline');
    document.body.classList.toggle('ai-dock-overlay', layout === 'overlay');
    document.body.classList.toggle('ai-dock-sheet', layout === 'sheet');
    resizer.setAttribute('aria-valuemin', String(MIN_WIDTH)); resizer.setAttribute('aria-valuemax', String(Math.round(max)));
    resizer.setAttribute('aria-valuenow', String(Math.round(actualWidth))); resizer.setAttribute('aria-valuetext', Math.round(actualWidth) + '像素');
  }
  function scheduleLayout() { if (open && !layoutFrame) layoutFrame = requestAnimationFrame(measureLayout); }
  function setWidth(value) { if (!Number.isFinite(Number(value))) return; preferredWidth = clamp(Number(value), MIN_WIDTH, MAX_WIDTH); measureLayout(); }
  function stopDrag() {
    if (drag && resizer.hasPointerCapture(drag.id)) resizer.releasePointerCapture(drag.id);
    drag = null; document.body.classList.remove('ai-dock-resizing');
  }
  function foldOptions() {
    if (options || !panel) return;
    const form = panel.querySelector('#ai-request-form'); if (!form) return;
    options = document.createElement('details'); options.className = 'ai-dock-options';
    options.innerHTML = '<summary>题目、资料与选项</summary><div class="ai-dock-options-body"></div>';
    const content = options.lastElementChild;
    // Keep nodes, form association and IDs. Placeholders restore the page
    // layout exactly when the same panel returns to the library.
    for (const node of form.querySelectorAll('#ai-mode-description,#ai-scene-capability,#ai-context,.ai-guidance-row,.ai-attachment-area,#ai-files-list,#ai-attachment-note,#ai-followup-note')) {
      const slot = document.createComment('AI dock option'); node.before(slot); slots.push({node, slot}); content.append(node);
    }
    const consent = form.querySelector('.ai-consent'); form.insertBefore(options, consent || form.lastElementChild);
  }
  function restoreOptions() {
    for (const {node, slot} of slots) { if (slot.parentNode) slot.replaceWith(node); }
    slots = []; options?.remove(); options = null;
  }
  function attach(value) {
    if (!value || value.nodeType !== 1) throw Error('未提供AI面板');
    if (panel && panel !== value) throw Error('侧栏必须复用同一AI面板');
    if (!origin && value.parentElement !== mount) origin = {parent: value.parentElement, next: value.nextSibling};
    panel = value; mount.append(value); value.classList.add('ai-docked'); foldOptions(); setSection(section); scheduleLayout();
    return value;
  }
  function show(values = {}) {
    if (!panel || panel.parentElement !== mount) throw Error('请先挂载AI面板');
    update(values);
    if (!open && document.activeElement instanceof HTMLElement && !element.contains(document.activeElement)) opener = document.activeElement;
    const changed = !open; open = true; element.hidden = false; panel.hidden = false; document.body.classList.add('ai-dock-open');
    measureLayout(); if (changed) onVisibilityChange(true);
  }
  function collapse() {
    if (!open) return;
    const restoreFocus = element.contains(document.activeElement); stopDrag(); open = false; element.hidden = true;
    if (layoutFrame) cancelAnimationFrame(layoutFrame); layoutFrame = 0;
    document.body.classList.remove('ai-dock-open', 'ai-dock-inline', 'ai-dock-overlay', 'ai-dock-sheet');
    onVisibilityChange(false); if (restoreFocus && opener?.isConnected) opener.focus({preventScroll: true});
  }
  function detach(target = origin?.parent) {
    collapse(); if (!panel) return null;
    restoreOptions(); panel.classList.remove('ai-docked', 'ai-dock-history');
    if (target) { const next = target === origin?.parent && origin.next?.parentElement === target ? origin.next : null; target.insertBefore(panel, next); }
    return panel;
  }
  function reset() {
    actionEpoch++; stopDrag(); detach(); preferredWidth = actualWidth = DEFAULT_WIDTH; element.style.removeProperty('--ai-dock-width');
    setSection('thread'); update({title: '', contextLabel: '', status: ''}); opener = null;
  }
  element.querySelector('.ai-dock-actions').addEventListener('click', async event => {
    const button = event.target.closest('[data-dock-action]'); if (!button) return;
    const action = button.dataset.dockAction, ticket = actionEpoch;
    if (action === 'collapse') collapse();
    if (action === 'history') setSection(section === 'thread' ? 'history' : 'thread');
    try { const result = await onAction(action, {section}); if (ticket === actionEpoch && action === 'new' && result !== false) setSection('thread'); }
    catch (error) { if (ticket === actionEpoch) update({status: error.message || '操作未完成，请重试'}); }
  });
  element.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) { event.preventDefault(); collapse(); onAction('collapse', {section}); }
  });
  resizer.addEventListener('pointerdown', event => {
    if (!open || element.dataset.layout === 'sheet' || event.button !== 0) return;
    event.preventDefault(); drag = {id: event.pointerId, x: event.clientX, width: actualWidth};
    resizer.setPointerCapture(event.pointerId); document.body.classList.add('ai-dock-resizing');
  });
  resizer.addEventListener('pointermove', event => { if (drag?.id === event.pointerId) setWidth(drag.width + drag.x - event.clientX); });
  resizer.addEventListener('pointerup', stopDrag); resizer.addEventListener('pointercancel', stopDrag); resizer.addEventListener('lostpointercapture', stopDrag);
  resizer.addEventListener('keydown', event => {
    if (element.dataset.layout === 'sheet' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); setWidth(event.key === 'Home' ? MIN_WIDTH : event.key === 'End' ? MAX_WIDTH : preferredWidth + (event.key === 'ArrowLeft' ? 16 : -16));
  });
  window.addEventListener('resize', scheduleLayout);
  const observer = new ResizeObserver(scheduleLayout); observer.observe(container);
  for (const node of container.querySelectorAll('.main-panel,.question-sidebar,#source-panel')) observer.observe(node);
  new MutationObserver(scheduleLayout).observe(document.body, {attributes: true, attributeFilter: ['class']});
  return {element, attach, show, collapse, detach, update, setSection, reset, setWidth, get width() {return actualWidth;}, get isOpen() {return open;}};
}
