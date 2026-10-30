/* Shared data adapter. Uses Supabase when configured; otherwise local demo data. */
(function () {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR_PROJECT_ID') && !cfg.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE');
  let client = null;
  if (configured && window.supabase?.createClient) client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const isRemote = !!client;
  const STORAGE_KEY = 'teamspace-demo-data-v1';
  const members = (cfg.TEAM_MEMBERS || []).map((m, i) => ({ ...m, id: String(m.id || `member-${i + 1}`) }));
  const today = new Date();
  const iso = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function seedData() { return { leaves: [], tasks: [] }; }
  function readLocal() {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) return JSON.parse(saved); } catch (_) {}
    const initial = seedData(); try { localStorage.setItem(STORAGE_KEY, JSON.stringify(initial)); } catch (_) {} return initial;
  }
  function writeLocal(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (error) { throw new Error(`Browser storage is unavailable: ${error.message || error}. Please allow site storage and try again.`); }
  }
  function makeId() {
    return (window.crypto && typeof window.crypto.randomUUID === 'function')
      ? window.crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function getAll() {
    if (!isRemote) return readLocal();
    const [l, t] = await Promise.all([
      client.from('leaves').select('*').order('start_date'),
      client.from('tasks').select('*').order('due_date')
    ]);
    if (l.error) throw l.error; if (t.error) throw t.error;
    return { leaves: l.data || [], tasks: t.data || [] };
  }
  async function addEntry(type, payload) {
    if (type === 'leave') {
      const row = { member_id: payload.member_id, title: payload.title, start_date: payload.start_date, end_date: payload.end_date, leave_type: payload.leave_type, notes: payload.notes || '' };
      if (isRemote) { const { data, error } = await client.from('leaves').insert(row).select().single(); if (error) throw error; return data; }
      const db = readLocal(); const item = { ...row, id: makeId(), created_at: new Date().toISOString() }; db.leaves.push(item); writeLocal(db); return item;
    }
    const row = { member_id: payload.member_id, title: payload.title, due_date: payload.start_date, status: payload.status || 'open', notes: payload.notes || '' };
    if (isRemote) { const { data, error } = await client.from('tasks').insert(row).select().single(); if (error) throw error; return data; }
    const db = readLocal(); const item = { ...row, id: makeId(), created_at: new Date().toISOString() }; db.tasks.push(item); writeLocal(db); return item;
  }
  async function updateTask(id, patch) {
    if (isRemote) { const { error } = await client.from('tasks').update(patch).eq('id', id); if (error) throw error; return; }
    const db = readLocal(); db.tasks = db.tasks.map(t => t.id === id ? { ...t, ...patch } : t); writeLocal(db);
  }
  async function deleteEntry(type, id) {
    if (isRemote) { const { error } = await client.from(type === 'leave' ? 'leaves' : 'tasks').delete().eq('id', id); if (error) throw error; return; }
    const db = readLocal(); const key = type === 'leave' ? 'leaves' : 'tasks'; db[key] = db[key].filter(x => x.id !== id); writeLocal(db);
  }
  function memberById(id) { return members.find(m => String(m.id) === String(id)) || { id, name: 'Unknown member', color: '#8b93a7' }; }
  function setStatusBadge() {
    document.querySelectorAll('#connectionStatus').forEach(el => { el.textContent = isRemote ? 'Shared storage connected' : 'DEMO MODE · NOT SHARED'; el.className = `status-pill ${isRemote ? 'status-live' : 'status-demo'}`; el.title = isRemote ? 'Entries are stored in the shared Supabase database.' : 'This browser only. Configure Supabase before teammates can share entries.'; });
  }
  document.addEventListener('DOMContentLoaded', setStatusBadge);
  window.TeamSpace = { members, isRemote, getAll, addEntry, updateTask, deleteEntry, memberById, setStatusBadge };
})();
