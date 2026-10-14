const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Mouse menus and a persistent inspector share the same object actions. */
export function createContextMenu({onAction, onClose, onPopoverClose} = {}) {
  const menu = document.createElement('div');
  menu.className = 'scene-context-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '场景快捷操作');
  const popover = document.createElement('section');
  popover.className = 'scene-property-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', '对象快捷参数');
  popover.innerHTML = '<div class="scene-popover-header"><div><strong></strong><small></small></div><button type="button" data-popover="pin" title="固定浮窗" aria-label="固定参数浮窗" aria-pressed="false">♧</button><button type="button" data-popover="collapse" title="收起" aria-label="收起参数浮窗" aria-expanded="true">−</button><button type="button" data-popover="close" title="关闭" aria-label="关闭参数浮窗">×</button></div><div class="scene-popover-body"></div><button type="button" class="scene-popover-resize" aria-label="调整参数浮窗大小" title="拖动调整大小"></button>';
  document.body.append(menu, popover);
  const body = popover.querySelector('.scene-popover-body');
  const header = popover.querySelector('.scene-popover-header');
  let items = [], context = null, savedFocus = null, popoverContext = null;
  let pinned = false, collapsed = false, gesture = null;
  const visibleItems = () => [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];

  function place(element, x, y) {
    // Keep the app's undo/file controls reachable even for a long parameter form.
    const headerBottom = document.querySelector('body > header')?.getBoundingClientRect().bottom || 0;
    const top = Math.max(8, Math.min(headerBottom + 8, innerHeight - 68));
    element.style.maxHeight = Math.max(60, innerHeight - top - 8) + 'px';
    const box = element.getBoundingClientRect();
    element.style.left = Math.max(8, Math.min(x, innerWidth - box.width - 8)) + 'px';
    element.style.top = Math.max(top, Math.min(y, innerHeight - box.height - 8)) + 'px';
  }
  function close({restoreFocus = false} = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (restoreFocus && savedFocus?.isConnected) savedFocus.focus({preventScroll:true});
    onClose?.();
  }
  function open({x, y, title = '画布', subtitle = '', sections = [], footer = '', value = null}) {
    savedFocus = document.activeElement;
    context = value;
    items = sections.flatMap(section => section.items || []);
    let index = 0;
    menu.innerHTML = '<div class="scene-context-heading"><strong>' + esc(title) + '</strong>' + (subtitle ? '<small>' + esc(subtitle) + '</small>' : '') + '</div>' + sections.map(section => '<div class="scene-context-group">' + (section.title ? '<span class="scene-context-group-label">' + esc(section.title) + '</span>' : '') + (section.items || []).map(item => '<button type="button" role="menuitem" data-context-index="' + index++ + '"' + (item.disabled ? ' disabled' : '') + (item.danger ? ' class="danger"' : '') + '><span class="scene-context-symbol" aria-hidden="true">' + esc(item.icon || '') + '</span><span>' + esc(item.label) + '</span>' + (item.shortcut ? '<kbd>' + esc(item.shortcut) + '</kbd>' : '') + (item.checked !== undefined ? '<span class="scene-context-check" aria-hidden="true">' + (item.checked ? '✓' : '') + '</span>' : '') + '</button>').join('') + '</div>').join('') + (footer ? '<p class="scene-context-footer">' + esc(footer) + '</p>' : '');
    menu.hidden = false;
    place(menu, x, y);
    visibleItems()[0]?.focus({preventScroll:true});
  }
  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-context-index]');
    if (!button || button.disabled) return;
    const item = items[Number(button.dataset.contextIndex)];
    const value = context;
    close();
    item.action ? item.action(value) : onAction?.(item.id, value);
  });
  menu.addEventListener('keydown', event => {
    const buttons = visibleItems(), current = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); event.stopPropagation(); buttons[next]?.focus(); }
    if (event.key === 'Escape' || event.key === 'Tab') { close({restoreFocus:event.key === 'Escape'}); event.stopPropagation(); }
  });

  function closePopover() {
    if (popover.hidden) return;
    popover.hidden = true;
    onPopoverClose?.(popoverContext);
    popoverContext = null;
  }
  function showPopover({x, y, title, subtitle = '', html, value = null}) {
    const wasOpen = !popover.hidden;
    popoverContext = value;
    header.querySelector('strong').textContent = title;
    header.querySelector('small').textContent = subtitle;
    if (html !== undefined) body.innerHTML = html;
    popover.hidden = false;
    if (!wasOpen || !pinned) place(popover, x, y);
    else place(popover, parseFloat(popover.style.left) || x, parseFloat(popover.style.top) || y);
    return body;
  }
  function setCollapsed(value) {
    collapsed = !!value;
    popover.classList.toggle('is-collapsed', collapsed);
    const button = header.querySelector('[data-popover="collapse"]');
    button.textContent = collapsed ? '+' : '−';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? '展开参数浮窗' : '收起参数浮窗');
    place(popover, parseFloat(popover.style.left) || 8, parseFloat(popover.style.top) || 8);
  }
  header.addEventListener('click', event => {
    const action = event.target.closest('[data-popover]')?.dataset.popover;
    if (action === 'close') closePopover();
    if (action === 'collapse') setCollapsed(!collapsed);
    if (action === 'pin') {
      pinned = !pinned;
      popover.classList.toggle('is-pinned', pinned);
      const button = header.querySelector('[data-popover="pin"]');
      button.setAttribute('aria-pressed', String(pinned));
      button.setAttribute('aria-label', pinned ? '取消固定参数浮窗' : '固定参数浮窗');
      button.title = pinned ? '已固定：点击画布保留浮窗' : '固定浮窗';
    }
  });
  popover.addEventListener('pointerdown', event => {
    const resize = event.target.closest('.scene-popover-resize');
    if (event.button !== 0 || (!resize && (!event.target.closest('.scene-popover-header') || event.target.closest('button')))) return;
    const rect = popover.getBoundingClientRect();
    gesture = {id:event.pointerId, x:event.clientX, y:event.clientY, rect, resize:!!resize};
    event.preventDefault();
    popover.setPointerCapture(event.pointerId);
  });
  popover.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (gesture.resize) {
      popover.style.width = Math.max(250, Math.min(540, innerWidth - gesture.rect.left - 8, gesture.rect.width + dx)) + 'px';
      popover.style.height = Math.max(150, Math.min(innerHeight - gesture.rect.top - 8, gesture.rect.height + dy)) + 'px';
      popover.classList.add('is-sized');
    } else place(popover, gesture.rect.left + dx, gesture.rect.top + dy);
  });
  for (const type of ['pointerup','pointercancel']) popover.addEventListener(type, event => {
    if (gesture?.id === event.pointerId) gesture = null;
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !menu.contains(event.target)) close();
    if (!popover.hidden && !pinned && !popover.contains(event.target) && !menu.contains(event.target) && event.target.closest('#paper')) closePopover();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!menu.hidden) { close({restoreFocus:true}); event.stopPropagation(); }
      else if (!popover.hidden && popover.contains(document.activeElement)) { closePopover(); event.stopPropagation(); }
    }
  });
  window.addEventListener('resize', () => {
    close();
    if (!popover.hidden) place(popover, parseFloat(popover.style.left) || 8, parseFloat(popover.style.top) || 8);
  });
  return {open, close, showPopover, closePopover, body, popover,
    get value() { return popoverContext; }, get popoverOpen() { return !popover.hidden; }, get pinned() { return pinned; }};
}
