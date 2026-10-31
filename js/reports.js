(function () {
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateObj = s => new Date(`${s}T12:00:00`);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let data = { leaves: [], tasks: [] };
  let selectedMember = 'all';
  const monthInput = $('reportMonth');

  function toast(message) { window.TeamSpaceUI?.toast(message); }
  function month() { return monthInput.value || iso(new Date()).slice(0, 7); }
  function monthBounds(m) {
    const [y, mo] = m.split('-').map(Number);
    return { start: `${m}-01`, end: iso(new Date(y, mo, 0)) };
  }
  function leaveDays(leave, m) {
    const b = monthBounds(m);
    const start = leave.start_date > b.start ? leave.start_date : b.start;
    const end = leave.end_date < b.end ? leave.end_date : b.end;
    if (start > end) return 0;
    const count = Math.round((dateObj(end) - dateObj(start)) / 86400000) + 1;
    return leave.leave_type === 'half_day' ? count * 0.5 : count;
  }
  function selectedLeaves() {
    const b = monthBounds(month());
    return data.leaves
      .filter(l => l.start_date <= b.end && l.end_date >= b.start)
      .filter(l => selectedMember === 'all' || String(l.member_id) === String(selectedMember))
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date));
  }
  function csvCell(value) {
    const s = String(value ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function download() {
    const m = month();
    const leaves = selectedLeaves();
    const rows = [
      ['TEAM LEAVE CALENDAR — DETAILED LEAVE ENTRIES'],
      ['Month', m],
      ['Team member', selectedMember === 'all' ? 'All members' : TeamSpace.memberById(selectedMember).name],
      [],
      ['Team member', 'Start date', 'End date', 'Leave type', 'Days in selected month', 'Title / reason', 'Notes']
    ];
    leaves.forEach(l => rows.push([
      TeamSpace.memberById(l.member_id).name, l.start_date, l.end_date,
      l.leave_type || 'full_day', leaveDays(l, m), l.title || '', l.notes || ''
    ]));
    if (!leaves.length) rows.push(['No leave entries for this selection']);
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-leave-details-${m}${selectedMember === 'all' ? '' : '-' + TeamSpace.memberById(selectedMember).name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Detailed leave report downloaded.');
  }
  function renderFilters() {
    const el = $('memberReportFilters');
    const members = [{ id: 'all', name: 'All members' }, ...TeamSpace.members];
    el.innerHTML = members.map(m => `
      <button type="button" class="member-report-chip ${String(selectedMember) === String(m.id) ? 'active' : ''}"
        data-member-filter="${esc(m.id)}" aria-pressed="${String(selectedMember) === String(m.id)}">${esc(m.name)}</button>
    `).join('');
    el.querySelectorAll('[data-member-filter]').forEach(button => button.addEventListener('click', () => {
      selectedMember = button.dataset.memberFilter;
      render();
    }));
  }
  function render() {
    const m = month();
    const leaves = selectedLeaves();
    const memberLabel = selectedMember === 'all' ? 'all team members' : TeamSpace.memberById(selectedMember).name;
    $('reportDescription').textContent = `${leaves.length} leave ${leaves.length === 1 ? 'entry' : 'entries'} for ${memberLabel} in ${m}. Click a name to filter the report.`;
    renderFilters();
    const body = $('reportTableBody');
    if (!leaves.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-state">No leave entries for this selection and month.</td></tr>';
      $('reportTableFoot').innerHTML = '';
      return;
    }
    body.innerHTML = leaves.map(l => {
      const member = TeamSpace.memberById(l.member_id);
      return `<tr>
        <td><button type="button" class="report-member-link" data-member-filter="${esc(member.id)}">${esc(member.name)}</button></td>
        <td>${esc(l.start_date)}</td><td>${esc(l.end_date)}</td>
        <td>${esc((l.leave_type || 'full_day').replaceAll('_', ' '))}</td>
        <td>${leaveDays(l, m).toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td>
        <td>${esc(l.title || '')}</td><td>${esc(l.notes || '—')}</td>
      </tr>`;
    }).join('');
    const total = leaves.reduce((sum, l) => sum + leaveDays(l, m), 0);
    $('reportTableFoot').innerHTML = `<tr><td colspan="4">Total leave days</td><td>${total.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</td><td colspan="2"></td></tr>`;
    body.querySelectorAll('[data-member-filter]').forEach(button => button.addEventListener('click', () => {
      selectedMember = button.dataset.memberFilter;
      render();
      $('detailedReportPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  async function load() {
    try { data = await TeamSpace.getAll(); render(); }
    catch (error) { toast(`Could not load report: ${error.message}`); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    monthInput.value = iso(new Date()).slice(0, 7);
    monthInput.addEventListener('change', render);
    $('downloadReport').addEventListener('click', download);
    load();
    if (TeamSpace.isRemote) {
      window.setInterval(() => { if (!document.hidden) load(); }, 20000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    }
  });
})();