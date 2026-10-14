export const $ = id => document.getElementById(id);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const paths = {
  bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/>',
  bookmark:'<path d="M6 3h12v18l-6-4-6 4z"/>',
  book:'<path d="M5 4h14v16H5zM8 8h8M8 12h6M8 16h8"/>',
  group:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
  class:'<path d="M4 21V5h16v16M8 21v-5h8v5M8 9h2m4 0h2M8 12h2m4 0h2"/>',
  workshop:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  feedback:'<path d="M4 4h16v13H9l-5 4zM8 8h8m-8 4h5"/>',
  like:'<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 2 10 8 15 6-5 12-11 8-15z"/>',
  remix:'<path d="M4 7h12l-4-4m4 4-4 4M20 17H8l4 4m-4-4 4-4"/>',
  document:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  scene:'<path d="M3 18h18M6 21V3M6 8c7 0 6 10 11 10a4 4 0 0 0 4-4"/><circle cx="6" cy="8" r="1"/>',
  home:'<path d="m3 11 9-8 9 8M6 9v12h12V9m-8 12v-7h4v7"/>',
  'file-import':'<path d="M6 3h8l4 4v5M14 3v5h4M6 12v9h12v-3M3 14h10m-3-3 3 3-3 3"/>',
  'folder-import':'<path d="M3 7V5h6l2 2h10v13H3V7M12 10v7m-3-3 3 3 3-3"/>',
  import:'<path d="M12 3v12m-4-4 4 4 4-4M5 15v6h14v-6"/>',
  export:'<path d="M12 16V3m-4 4 4-4 4 4M5 14v7h14v-7"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
  save:'<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7"/>',
  presentation:'<path d="M3 4h18v12H3zM12 16v5m-4 0 4-5 4 5M7 11l3-3 3 3 4-4"/>',
  sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM4 2v4M2 4h4M20 18v4m-2-2h4"/>',
  layout:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M8 8v13"/>',
  settings:'<path d="M3 6h7m4 0h7M3 12h12m4 0h2M3 18h2m4 0h12"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  'panel-left':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m-3-14v10"/>',
  'panel-right':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18m3-14v10"/>',
  pin:'<path d="m14 3 7 7-3 1-3 5-4-4-5 5m5-5L7 8l5-3zM6 17l-3 4"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  more:'<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
  undo:'<path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo:'<path d="m15 4 5 5-5 5M20 9H10a6 6 0 0 0 0 12h3"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  edit:'<path d="m15 4 5 5M4 20l1-5L17 3l4 4L9 19z"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M18 18a8 8 0 0 1-14-6"/>',
  fullscreen:'<path d="M3 9V3h6m6 0h6v6M21 15v6h-6M9 21H3v-6"/>',
  logout:'<path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"/>',
  key:'<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-5-5 3-3m0 6 3-3"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  list:'<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  'chevron-left':'<path d="m15 5-7 7 7 7"/>',
  'chevron-right':'<path d="m9 5 7 7-7 7"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  link:'<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1"/>'
};
export const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.book) + '</svg>';
const buttonMasks=new Map();
// A CSS mask keeps icons intact when existing controllers update button text,
// and inherits the same foreground color in normal, selected and disabled states.
export function setButtonIcon(node,name){
  if(!node)return;
  if(!buttonMasks.has(name))buttonMasks.set(name,'url("data:image/svg+xml,'+encodeURIComponent(icon(name).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '))+'")');
  if(!node.classList.contains('ui-icon-button'))node.classList.add('ui-icon-button');
  if(node.style.getPropertyValue('--ui-button-icon')!==buttonMasks.get(name))node.style.setProperty('--ui-button-icon',buttonMasks.get(name));
}
export function dateText(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date); }
export const query = input => { const params = new URLSearchParams(); for (const [key,value] of Object.entries(input)) if (value !== null && value !== undefined && value !== '' && value !== 'all') params.set(key,String(value)); return params.size ? '?' + params : ''; };
export async function copyText(value) {
  if (navigator.clipboard && isSecureContext) { await navigator.clipboard.writeText(value); return true; }
  const field=document.createElement('textarea');field.value=value;field.style.cssText='position:fixed;top:0;opacity:0';document.body.append(field);field.select();
  const copied=document.execCommand('copy');field.remove();return copied;
}
