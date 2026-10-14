import releaseNotes from './release-notes.json' with {type: 'json'};
import {esc, icon} from './web-ui.mjs';

// Release notes are public build content. Opening them never touches a paper,
// the editor iframe, account state, or the server's resource-saving lifecycle.
export function createUpdatesUI() {
  let dialog;
  const dateLabel = date => date.split('-').map(Number).map((part, index) => part + ['年', '月', '日'][index]).join('');

  function open() {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'web-updates-dialog';
      dialog.setAttribute('aria-labelledby', 'web-updates-title');
      dialog.setAttribute('aria-describedby', 'web-updates-description');
      dialog.innerHTML = `
        <header class="updates-heading">
          <div><span class="updates-eyebrow">题景 · 持续更新</span><h2 id="web-updates-title">更新记录</h2></div>
          <button type="button" data-updates-close aria-label="关闭更新记录" autofocus>${icon('close')}</button>
        </header>
        <p id="web-updates-description">看看学习空间又有了哪些新变化。</p>
        <div class="updates-timeline">${releaseNotes.map((release, index) => `
          <article class="updates-release${index === 0 ? ' updates-latest' : ''}">
            <div class="updates-meta"><span class="updates-version">v${esc(release.version)}</span>${index === 0 ? '<span class="updates-current">当前版本</span>' : ''}<time datetime="${esc(release.date)}">${dateLabel(release.date)}</time></div>
            <h3>${esc(release.title)}</h3>
            <ul>${release.changes.map(change => `<li><span class="updates-kind" data-kind="${esc(change.type)}">${esc(change.type)}</span><span>${esc(change.text)}</span></li>`).join('')}</ul>
          </article>`).join('')}</div>
        <footer class="updates-footer"><span>让每一次探索，体验更好一点。</span><button type="button" data-updates-close>回到学习 ${icon('chevron-right')}</button></footer>`;
      document.body.append(dialog);
      dialog.addEventListener('click', event => {
        if (event.target.closest('[data-updates-close]')) dialog.close();
        // Native dialog handles Escape and focus restoration. Only a true
        // backdrop click closes it; clicking the panel's padding does not.
        if (event.target === dialog) {
          const bounds = dialog.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
        }
      });
    }
    if (!dialog.open) dialog.showModal();
  }

  const entry = document.getElementById('web-updates-open');
  entry.title = `更新记录 · v${releaseNotes[0].version}`;
  entry.addEventListener('click', open);
  return {open};
}
