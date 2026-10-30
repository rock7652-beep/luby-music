const $ = id => document.getElementById(id);
const labels = { open: '開放報名', paused: '暫停報名', full: '已滿班' };
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let classes = [], editing = null, busy = false;

async function api(method = 'GET', body) {
  const res = await fetch('/api/classes', { method, cache: 'no-store', credentials: 'same-origin',
    headers: {'Content-Type':'application/json'}, ...(body ? {body: JSON.stringify(body)} : {}) });
  const json = await res.json();
  if (res.status === 401) { location.assign('/admin/'); throw new Error('請先登入管理中心'); }
  if (!res.ok || !json.ok) throw new Error(json.error || '操作失敗，請稍後再試');
  return json;
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('button').forEach(b => b.disabled = value);
  $('search').disabled = value;
  // 編輯儲存中鎖住輸入，避免把尚未送出的修改誤認為已儲存。
  $('classForm').querySelectorAll('input,select').forEach(el => el.disabled = value);
}
function render() {
  const term = $('search').value.trim();
  const days=['週一','週二','週三','週四','週五','週六','週日'];
  classes.sort((a,b)=>days.indexOf(a.day)-days.indexOf(b.day)||a.time.localeCompare(b.time));
  const rows = classes.filter(c => [c.name,c.teacher,c.day,c.time].join(' ').includes(term));
  $('list').innerHTML = rows.map(c => {
    const status = c.status === 'open' && c.remaining === 0 ? 'full' : c.status;
    return `<article class="card" data-id="${escapeText(c.id)}"><div class="card-top"><h2>${escapeText(c.name)}</h2><span class="tag status-${status}">${labels[status]}</span></div>
      <p class="class-meta">${escapeText(c.day)} ${escapeText(c.time)} · ${escapeText(c.teacher)} 老師<br>${escapeText(c.startDate)} ～ ${escapeText(c.endDate)} · ${c.lessons} 堂<br>NT$ ${c.price.toLocaleString()} · ${c.remaining === null ? '剩餘名額未設定' : `對外剩餘 ${c.remaining} 名`}${c.capacity === null ? '' : `／總名額 ${c.capacity}`}</p>
      <div class="class-actions"><button class="edit" data-action="edit">編輯</button><button data-action="status">${status === 'open' ? '暫停報名' : '重新開放'}</button><button data-action="copy">複製</button></div></article>`;
  }).join('');
  if (!rows.length) $('list').textContent = term ? '找不到符合的班級。' : '尚無班級，請新增班級。';
}
async function load() {
  if (busy) return;
  setBusy(true); $('message').textContent = '正在讀取雲端班級…';
  try { classes = (await api()).classes; render(); $('message').textContent = `共 ${classes.length} 班`; }
  catch (error) { $('message').textContent = error.message; }
  finally { setBusy(false); }
}
function edit(c, copy = false) {
  editing = copy ? null : c;
  $('classForm').reset();
  const values = c || {name:'',teacher:'',level:'入門',day:'週一',time:'19:00',lessons:8,price:3600,status:'paused'};
  for (const el of $('classForm').elements) if (el.name) el.value = values[el.name] ?? '';
  if (copy) { $('classForm').elements.name.value = c.name + '（複製）'; $('classForm').elements.status.value = 'paused'; $('classForm').elements.remaining.value = ''; }
  $('editorTitle').textContent = copy ? '複製班級' : c ? '編輯班級' : '新增班級';
  $('formMessage').textContent = ''; $('editor').showModal();
}
$('list').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button || busy) return;
  const c = classes.find(c => c.id === button.closest('[data-id]').dataset.id); if (!c) return;
  if (button.dataset.action === 'edit') return edit(c);
  if (button.dataset.action === 'copy') return edit(c,true);
  const open = c.status === 'open' && c.remaining !== 0;
  if (!open && c.remaining === 0) { edit(c); $('classForm').elements.status.value = 'open'; $('formMessage').textContent = '請先調整剩餘名額，再儲存重新開放。'; return; }
  if (!confirm(`確定將「${c.name} · ${c.day} ${c.time}」${open ? '暫停報名' : '重新開放'}？既有報名會保留。`)) return;
  setBusy(true);
  try { const updated = (await api('PUT',{...c,status:open?'paused':'open'})).class; classes = classes.map(row => row.id === c.id ? updated : row); render(); $('message').textContent = '已儲存，官網招生狀態已更新。'; }
  catch (error) { $('message').textContent = error.message; }
  finally { setBusy(false); }
});
$('classForm').addEventListener('submit',async event => {
  event.preventDefault(); if (busy) return;
  const data = Object.fromEntries(new FormData(event.target));
  if (editing) { data.id = editing.id; data.version = editing.version; }
  setBusy(true); $('formMessage').textContent = '儲存中…';
  try { const updated = (await api(editing?'PUT':'POST',data)).class; classes = editing ? classes.map(c=>c.id===updated.id?updated:c) : [...classes,updated]; render(); $('editor').close(); $('message').textContent = '已儲存，官網班級資料已更新。'; }
  catch (error) { $('formMessage').textContent = error.message; }
  finally { setBusy(false); }
});
$('cancel').onclick = () => { if (!busy) $('editor').close(); };
$('editor').addEventListener('cancel',event => { if (busy) event.preventDefault(); });
$('add').onclick = () => edit(null);
$('refresh').onclick = load;
$('search').oninput = render;
load();
