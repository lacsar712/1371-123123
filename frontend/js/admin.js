(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let courses = [];
  let currentPage = 'courses';
  let currentSessionId = null;

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u.role !== 'admin' || !u.id) return null;
      return u;
    } catch (_) {
      return null;
    }
  }

  function showToast(message, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast ' + type + ' show';
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function api(path, options = {}) {
    return fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    }).then((r) => {
      if (options.download) return { ok: r.ok, response: r };
      return r.json().then((d) => ({ ok: r.ok, status: r.status, data: d }));
    });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function showPage(page) {
    currentPage = page;
    document.querySelectorAll('.sidebar-nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === page);
    });
    document.getElementById('page-courses').style.display = page === 'courses' ? 'block' : 'none';
    document.getElementById('page-lottery').style.display = page === 'lottery' ? 'block' : 'none';
    document.getElementById('page-attendance').style.display = page === 'attendance' ? 'block' : 'none';
    document.getElementById('page-attendance-detail').style.display = page === 'attendance-detail' ? 'block' : 'none';

    const headerTitle = document.querySelector('.admin-header h1');
    const headerSubtitle = document.querySelector('.admin-header .header-subtitle');
    if (page === 'courses') {
      headerTitle.textContent = '课程管理';
      headerSubtitle.textContent = '管理课程信息与容量';
    } else if (page === 'lottery') {
      headerTitle.textContent = '抽签中心';
      headerSubtitle.textContent = '管理抽签课程与执行抽签';
    } else if (page === 'attendance' || page === 'attendance-detail') {
      headerTitle.textContent = '考勤历史';
      headerSubtitle.textContent = '查看历次点名出勤情况';
    }

    if (page === 'lottery') {
      loadLotteryCourses();
    }
    if (page === 'attendance') {
      loadAttendanceList();
    }
  }

  // ========== 课程管理 ==========
  async function loadCourses() {
    const tbody = document.getElementById('courseTableBody');
    const { data } = await api('/api/admin/courses');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    courses = rows;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">暂无课程</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (c) => `
        <tr>
          <td>${c.id}</td>
          <td>${escapeHtml(c.code)}</td>
          <td>${escapeHtml(c.name)}${c.lotteryMode ? ' <span class="badge badge-lottery">抽签</span>' : ''}</td>
          <td>${c.credit ?? 0}</td>
          <td>${c.capacity ?? 0}</td>
          <td>${c.enrolled ?? 0}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm edit-btn" data-id="${c.id}">编辑</button>
            <button type="button" class="btn btn-danger btn-sm delete-btn" data-id="${c.id}">删除</button>
          </td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => openEdit(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => doDelete(parseInt(btn.dataset.id, 10)));
    });

    const courseFilter = document.getElementById('attendanceCourseFilter');
    if (courseFilter) {
      courseFilter.innerHTML =
        '<option value="">全部课程</option>' +
        rows
          .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`)
          .join('');
    }
  }

  const modal = document.getElementById('modalOverlay');
  const form = document.getElementById('courseForm');
  const modalTitle = document.getElementById('modalTitle');

  function openAdd() {
    document.getElementById('courseId').value = '';
    document.getElementById('code').value = '';
    document.getElementById('name').value = '';
    document.getElementById('credit').value = '';
    document.getElementById('capacity').value = '';
    document.getElementById('lotteryMode').checked = false;
    modalTitle.textContent = '新增课程';
    modal.classList.remove('modal-editing');
    modal.classList.add('show');
  }

  function openEdit(id) {
    const course = courses.find((c) => c.id === id);
    if (!course) return;
    document.getElementById('courseId').value = id;
    document.getElementById('code').value = course.code;
    document.getElementById('name').value = course.name;
    document.getElementById('credit').value = course.credit;
    document.getElementById('capacity').value = course.capacity;
    document.getElementById('lotteryMode').checked = !!course.lotteryMode;
    modalTitle.textContent = '编辑课程';
    modal.classList.add('modal-editing', 'show');
  }

  function closeModal() {
    modal.classList.remove('show');
  }

  async function doDelete(id) {
    if (!confirm('确定删除该课程？已选课记录将一并删除。')) return;
    const { data } = await api('/api/admin/courses/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      loadCourses();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('courseId').value.trim();
    const code = document.getElementById('code').value.trim();
    const name = document.getElementById('name').value.trim();
    const credit = parseInt(document.getElementById('credit').value, 10);
    const capacity = parseInt(document.getElementById('capacity').value, 10);
    const lotteryMode = document.getElementById('lotteryMode').checked;
    if (!code || !name || Number.isNaN(credit) || credit < 0 || Number.isNaN(capacity) || capacity < 0) {
      showToast('请填写完整且有效的字段', 'error');
      return;
    }
    const payload = { code, name, credit, capacity, lotteryMode };
    if (id) {
      const { data } = await api('/api/admin/courses/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('保存成功', 'success');
        closeModal();
        loadCourses();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } else {
      const { data } = await api('/api/admin/courses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (data && data.ok) {
        showToast('新增成功', 'success');
        closeModal();
        loadCourses();
      } else {
        showToast((data && data.message) || '新增失败', 'error');
      }
    }
  });

  // ========== 抽签中心 ==========
  async function loadLotteryCourses() {
    const tbody = document.getElementById('lotteryTableBody');
    const { data } = await api('/api/admin/lottery/courses');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">暂无抽签课程，请在课程管理中开启抽签模式</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (c) => {
          const sc = c.statusCounts || {};
          const waiting = sc.waiting || 0;
          const won = sc.won || 0;
          const lost = sc.lost || 0;
          const hasWaiting = waiting > 0;
          return `
          <tr>
            <td>${c.id}</td>
            <td>${escapeHtml(c.code)}</td>
            <td>${escapeHtml(c.name)}</td>
            <td>${c.capacity ?? 0}</td>
            <td>${c.entries ?? 0}</td>
            <td><span class="badge badge-lottery-waiting">${waiting}</span></td>
            <td><span class="badge badge-lottery-won">${won}</span></td>
            <td><span class="badge badge-lottery-lost">${lost}</span></td>
            <td>
              <button type="button" class="btn btn-primary btn-sm execute-lottery-btn" data-id="${c.id}" ${!hasWaiting ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                ${hasWaiting ? '执行抽签' : '已开奖'}
              </button>
            </td>
          </tr>`;
        }
      )
      .join('');

    tbody.querySelectorAll('.execute-lottery-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => executeLottery(parseInt(btn.dataset.id, 10)));
    });
  }

  async function executeLottery(courseId) {
    if (!confirm('确定对该课程执行抽签？等待中的学生将被随机分配中签/未中签。')) return;
    const btn = document.querySelector(`.execute-lottery-btn[data-id="${courseId}"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '抽签中...';
    }
    const { data } = await api('/api/admin/lottery/execute/' + courseId, { method: 'POST' });
    if (data && data.ok) {
      showToast(data.message || '抽签完成', 'success');
      loadLotteryCourses();
    } else {
      showToast((data && data.message) || '抽签失败', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '执行抽签';
      }
    }
  }

  // ========== 考勤管理 ==========
  async function loadAttendanceList() {
    const tbody = document.getElementById('attendanceTableBody');
    const courseId = document.getElementById('attendanceCourseFilter').value;
    const path = courseId ? `/api/admin/attendance?courseId=${courseId}` : '/api/admin/attendance';

    const { data } = await api(path);
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);">暂无考勤记录</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (s) => `
        <tr>
          <td>${s.id}</td>
          <td>${escapeHtml(s.course?.name || '')} <span style="color:var(--text-secondary);font-size:0.8125rem;">(${escapeHtml(s.course?.code || '')})</span></td>
          <td style="font-family:monospace;font-weight:700;letter-spacing:0.25rem;">${s.code}</td>
          <td>${formatDateTime(s.startTime)}</td>
          <td>${formatDateTime(s.endTime)}</td>
          <td>
            <span class="badge ${s.status === 'active' ? 'badge-active' : 'badge-ended'}">
              ${s.status === 'active' ? '进行中' : '已结束'}
            </span>
          </td>
          <td>${s.signedCount} / ${s.totalCount}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm view-btn" data-id="${s.id}">查看详情</button>
          </td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('.view-btn').forEach((btn) => {
      btn.addEventListener('click', () => viewAttendanceDetail(parseInt(btn.dataset.id, 10)));
    });
  }

  async function viewAttendanceDetail(sessionId) {
    currentSessionId = sessionId;
    const { data } = await api(`/api/admin/attendance/${sessionId}`);
    if (!data || !data.ok) {
      showToast((data && data.message) || '加载失败', 'error');
      return;
    }

    const detail = data.data;
    document.getElementById('attendanceDetailTitle').textContent =
      `${detail.course?.name || ''} - 考勤详情`;

    const statsEl = document.getElementById('attendanceDetailStats');
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="value" style="color:var(--accent-start);font-size:2rem;font-weight:800;">${detail.totalCount}</div>
        <div class="label" style="color:var(--text-secondary);font-size:0.875rem;">应到人数</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:var(--success);font-size:2rem;font-weight:800;">${detail.signedCount}</div>
        <div class="label" style="color:var(--text-secondary);font-size:0.875rem;">已签到</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:var(--danger);font-size:2rem;font-weight:800;">${detail.absentCount}</div>
        <div class="label" style="color:var(--text-secondary);font-size:0.875rem;">缺勤</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:var(--text-secondary);font-size:2rem;font-weight:800;">${detail.code}</div>
        <div class="label" style="color:var(--text-secondary);font-size:0.875rem;">签到码</div>
      </div>
    `;

    const tbody = document.getElementById('attendanceDetailBody');
    tbody.innerHTML = detail.students
      .map(
        (s) => `
        <tr class="${s.status === 'absent' ? 'row-absent' : ''}">
          <td>${escapeHtml(s.studentNo || '')}</td>
          <td>${escapeHtml(s.studentName || '')}</td>
          <td>
            <span class="badge ${s.status === 'signed' ? 'badge-signed' : 'badge-absent'}">
              ${s.status === 'signed' ? '已签到' : '缺勤'}
            </span>
          </td>
          <td class="sign-in-time">${s.signInTime ? formatDateTime(s.signInTime) : '-'}</td>
        </tr>
      `
      )
      .join('');

    showPage('attendance-detail');
  }

  async function exportAbsent() {
    if (!currentSessionId) return;
    try {
      const link = document.createElement('a');
      link.href = API_BASE + `/api/admin/attendance/${currentSessionId}/export`;
      link.click();
      showToast('导出成功', 'success');
    } catch (e) {
      showToast('导出失败', 'error');
    }
  }

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    document.querySelectorAll('.sidebar-nav a').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        showPage(a.dataset.page);
      });
    });

    document.getElementById('modalCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    document.getElementById('addCourseBtn').addEventListener('click', openAdd);
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      sessionStorage.removeItem('user');
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    });

    document.getElementById('attendanceCourseFilter').addEventListener('change', loadAttendanceList);
    document.getElementById('backToAttendanceList').addEventListener('click', () => showPage('attendance'));
    document.getElementById('exportAbsentBtn').addEventListener('click', exportAbsent);

    loadCourses();
  }

  const style = document.createElement('style');
  style.textContent = `
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-active {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .badge-ended {
      background: rgba(161, 161, 170, 0.15);
      color: #a1a1aa;
    }
    .badge-signed {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .badge-absent {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .badge-lottery {
      background: rgba(139, 92, 246, 0.15);
      color: #a78bfa;
      margin-left: 6px;
      font-size: 0.6875rem;
      padding: 2px 8px;
    }
    .badge-lottery-waiting {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }
    .badge-lottery-won {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .badge-lottery-lost {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }
    .row-absent {
      background: rgba(239, 68, 68, 0.08) !important;
    }
    .row-absent:hover {
      background: rgba(239, 68, 68, 0.15) !important;
    }
    .stat-card {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
    }
    .sign-in-time {
      color: var(--text-secondary);
      font-size: 0.875rem;
      font-variant-numeric: tabular-nums;
    }
  `;
  document.head.appendChild(style);

  init();
})();
