(function () {
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateObj = s => new Date(`${s}T12:00:00`);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => dateObj(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const holidays = d => window.indianHolidaysForDate ? window.indianHolidaysForDate(d) : [];

  let current = new Date();
  let selected = new URLSearchParams(location.search).get('date') || iso(new Date());
  let data = { leaves: [], tasks: [] };
  window.TeamSpaceCalendarSelectedDate = selected;

  function toast(message) { window.TeamSpaceUI?.toast(message); }
  function covers(entry, day) {
    return entry.kind === 'task'
      ? entry.due_date === day
      : entry.start_date <= day && entry.end_date >= day;
  }
  function entries() {
    return [
      ...data.leaves.map(e => ({ ...e, kind: 'leave' })),
      ...data.tasks.map(e => ({ ...e, kind: 'task' }))
    ];
  }
  function leavePeopleFor(day) {
    const matches = data.leaves.filter(l => l.start_date <= day && l.end_date >= day);
    return [...new Set(matches.map(l => String(l.member_id)))];
  }
  function legend() {
    const el = $('memberLegend');
    if (!el) return;
    el.innerHTML = TeamSpace.members.map(m =>
      `<span class="legend-item"><i class="legend-dot" style="background:${m.color}"></i>${esc(m.name)}</span>`
    ).join('');
  }

  function render() {
    const y = current.getFullYear(), month = current.getMonth();
    $('monthTitle').textContent = current.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const first = new Date(y, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(y, month, 1 - offset);
    const today = iso(new Date());
    let html = '';

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = iso(d);
      const outside = d.getMonth() !== month;
      const hs = holidays(key);
      const matches = entries().filter(e => covers(e, key));
      const leaveMatches = matches.filter(e => e.kind === 'leave');
      const peopleAway = leavePeopleFor(key).length;
      html += `
        <div class="calendar-cell ${outside ? 'outside' : ''} ${key === today ? 'today' : ''} ${key === selected ? 'selected' : ''} ${hs.length ? 'has-holiday' : ''}"
             data-date="${key}" role="button" tabindex="0" aria-label="${fmt(key)}; ${peopleAway} people on leave; ${matches.filter(e => e.kind === 'task').length} tasks">
          <div class="cell-top">
            <div class="cell-number">${d.getDate()}</div>
            ${peopleAway ? `<span class="leave-count-badge" title="${peopleAway} ${peopleAway === 1 ? 'person' : 'people'} on leave">${peopleAway} away</span>` : ''}
            ${hs.length ? '<span class="holiday-mark" title="Indian festival or holiday">✦</span>' : ''}
          </div>
          ${hs.slice(0, 1).map(h => `<div class="holiday-chip" title="${esc(h.type)}: ${esc(h.name)}">${esc(h.name)}</div>`).join('')}
          ${matches.slice(0, 3).map(e => {
            const member = TeamSpace.memberById(e.member_id);
            return `<div class="calendar-entry ${e.kind}" title="${esc(e.title)} — ${esc(member.name)}" style="border-left:3px solid ${member.color}">
              ${esc(member.name)}: ${esc(e.title)}
            </div>`;
          }).join('')}
          ${matches.length > 3 ? `<div class="more-entries">+${matches.length - 3} more entries</div>` : ''}
        </div>`;
    }

    const el = $('fullCalendar');
    el.innerHTML = html;
    el.querySelectorAll('.calendar-cell').forEach(cell => {
      const choose = () => {
        selected = cell.dataset.date;
        window.TeamSpaceCalendarSelectedDate = selected;
        render();
        renderSelected();
      };
      cell.addEventListener('click', choose);
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          choose();
        }
      });
    });
  }

  function renderSelected() {
    const label = $('selectedDateLabel');
    const el = $('selectedDateEntries');
    if (!label || !el) return;

    const hs = holidays(selected);
    const matches = entries().filter(e => covers(e, selected));
    const leaveMatches = matches.filter(e => e.kind === 'leave');
    const peopleAway = leavePeopleFor(selected).length;
    const taskMatches = matches.filter(e => e.kind === 'task');

    label.textContent = `${fmt(selected)} · ${peopleAway} ${peopleAway === 1 ? 'person' : 'people'} on leave · ${leaveMatches.length} ${leaveMatches.length === 1 ? 'leave entry' : 'leave entries'} · ${taskMatches.length} ${taskMatches.length === 1 ? 'task' : 'tasks'}`;

    let html = '';
    if (peopleAway) {
      html += `<div class="selected-date-summary">
        <div class="selected-date-count">${peopleAway}</div>
        <div><strong>${peopleAway === 1 ? '1 team member is' : `${peopleAway} team members are`} on leave</strong>
        <p>Everyone listed below has leave covering this date.</p></div>
      </div>`;
    } else {
      html += `<div class="selected-date-summary selected-date-clear">
        <div class="selected-date-count">0</div>
        <div><strong>No team members on leave</strong><p>No leave has been recorded for this date.</p></div>
      </div>`;
    }

    html += hs.map(h => `<div class="holiday-detail"><div class="holiday-detail-icon">✦</div><div><strong>${esc(h.name)}</strong><p>${esc(h.type)} · Indian calendar reference</p></div></div>`).join('');

    if (!matches.length && !hs.length) {
      el.innerHTML = html;
      return;
    }

    html += leaveMatches.map(e => renderEntry(e)).join('');
    html += taskMatches.map(e => renderEntry(e)).join('');
    el.innerHTML = html;

    el.querySelectorAll('[data-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        const kind = button.dataset.kind;
        const prompt = kind === 'leave' ? 'Delete this leave entry? This cannot be undone.' : 'Delete this task? This cannot be undone.';
        if (!confirm(prompt)) return;
        button.disabled = true;
        try {
          await TeamSpace.deleteEntry(kind, button.dataset.delete);
          await load();
          toast('Entry deleted successfully.');
        } catch (error) {
          button.disabled = false;
          toast(`Could not delete entry: ${error.message}`);
        }
      });
    });
  }

  function renderEntry(entry) {
    const member = TeamSpace.memberById(entry.member_id);
    const isLeave = entry.kind === 'leave';
    const dateRange = isLeave && (entry.start_date !== entry.end_date)
      ? `${entry.start_date} → ${entry.end_date}`
      : '';
    const typeText = isLeave
      ? (entry.leave_type || 'full_day').replaceAll('_', ' ')
      : (entry.status || 'open').replaceAll('_', ' ');
    return `<div class="upcoming-item selected-entry">
      <div class="member-avatar" style="background:${member.color}">${esc(member.name.slice(0, 1).toUpperCase())}</div>
      <div class="entry-details">
        <strong>${esc(member.name)} · ${esc(entry.title)}</strong>
        <p>${isLeave ? 'Leave' : 'Task'} · ${esc(typeText)}${dateRange ? ` · ${esc(dateRange)}` : ''}</p>
        ${entry.notes ? `<p>${esc(entry.notes)}</p>` : ''}
        <span class="entry-tag ${isLeave ? 'tag-leave' : 'tag-task'}">${isLeave ? 'LEAVE' : 'TASK'}</span>
      </div>
      <button class="btn btn-danger btn-small" data-delete="${esc(entry.id)}" data-kind="${entry.kind}" aria-label="Delete ${isLeave ? 'leave' : 'task'} entry">Delete</button>
    </div>`;
  }

  async function load() {
    try {
      data = await TeamSpace.getAll();
      render();
      renderSelected();
      legend();
    } catch (error) {
      toast(`Could not load calendar: ${error.message}`);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('prevMonth').addEventListener('click', () => {
      current = new Date(current.getFullYear(), current.getMonth() - 1, 1);
      render();
    });
    $('nextMonth').addEventListener('click', () => {
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      render();
    });
    $('todayBtn').addEventListener('click', () => {
      current = new Date();
      selected = iso(new Date());
      window.TeamSpaceCalendarSelectedDate = selected;
      render();
      renderSelected();
    });
    const dateParam = new URLSearchParams(location.search).get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      selected = dateParam;
      window.TeamSpaceCalendarSelectedDate = selected;
      const d = dateObj(dateParam);
      current = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    load();
    // Refresh shared data when teammates make changes from another device.
    if (TeamSpace.isRemote) {
      window.setInterval(() => {
        if (!document.hidden) load();
      }, 20000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) load();
      });
    }
  });
})();
