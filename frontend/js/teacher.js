(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let courses = [];
  let currentSession = null;
  let countdownTimer = null;
  let refreshTimer = null;
  let endTime = null;

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u.role !== 'teacher' || !u.id) return null;
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
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })));
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateCountdown() {
    if (!endTime) return;
    const now = new Date().getTime();
    const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
    const countdownEl = document.getElementById('countdown');
    countdownEl.textContent = formatCountdown(remaining);

    countdownEl.classList.remove('warning', 'danger');
    if (remaining <= 60) {
      countdownEl.classList.add('danger');
    } else if (remaining <= 120) {
      countdownEl.classList.add('warning');
    }

    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      showToast('签到已结束', 'info');
      loadActiveSession(currentSession.course.id);
    }
  }

  function startCountdown(endTimeStr) {
    endTime = new Date(endTimeStr).getTime();
    updateCountdown();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function renderAttendanceList(records) {
    const tbody = document.getElementById('attendanceTableBody');
    if (!records || records.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-state">
            <div class="icon">📋</div>
            <div>暂无签到记录</div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = records
      .map((r, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(r.studentNo || '')}</td>
          <td>${escapeHtml(r.studentName || '')}</td>
          <td class="sign-in-time">${formatTime(r.signInTime)}</td>
        </tr>
      `)
      .join('');
  }

  async function loadCourses() {
    const { data } = await api('/api/courses');
    if (data && data.ok && Array.isArray(data.data)) {
      courses = data.data;
      const select = document.getElementById('courseSelect');
      select.innerHTML =
        '<option value="">请选择课程</option>' +
        courses
          .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`)
          .join('');
    }
  }

  async function checkActiveSessions() {
    for (const course of courses) {
      const { data } = await api(`/api/attendance/active/${course.id}`);
      if (data && data.ok && data.data) {
        showActiveSession(data.data);
        return;
      }
    }
  }

  async function loadActiveSession(courseId) {
    const { data } = await api(`/api/attendance/active/${courseId}`);
    if (data && data.ok && data.data) {
      showActiveSession(data.data);
    } else {
      hideActiveSession();
    }
  }

  function showActiveSession(session) {
    currentSession = session;
    document.getElementById('selectCourseSection').style.display = 'none';
    document.getElementById('activeSessionSection').style.display = 'block';

    document.getElementById('activeCourseName').textContent = session.course?.name || '';
    document.getElementById('activeCourseCode').textContent = session.course?.code || '';
    document.getElementById('attendanceCode').textContent = session.code;
    document.getElementById('signedCount').textContent = session.signedCount || 0;
    document.getElementById('totalCount').textContent = session.totalCount || 0;

    renderAttendanceList(session.records);

    const now = new Date().getTime();
    const end = new Date(session.endTime).getTime();
    if (end > now) {
      startCountdown(session.endTime);
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => loadActiveSession(session.course.id), 3000);
    } else {
      document.getElementById('countdown').textContent = '已结束';
      document.getElementById('countdown').classList.add('danger');
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function hideActiveSession() {
    currentSession = null;
    document.getElementById('selectCourseSection').style.display = 'block';
    document.getElementById('activeSessionSection').style.display = 'none';
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    endTime = null;
  }

  async function startAttendance() {
    const courseId = parseInt(document.getElementById('courseSelect').value, 10);
    if (!courseId) {
      showToast('请先选择课程', 'error');
      return;
    }

    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.textContent = '发起中...';

    try {
      const { data } = await api('/api/attendance/start', {
        method: 'POST',
        body: JSON.stringify({ courseId, duration: 300 }),
      });

      if (data && data.ok) {
        showToast('签到已发起', 'success');
        await loadActiveSession(courseId);
      } else {
        showToast((data && data.message) || '发起失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '发起签到';
    }
  }

  async function endAttendance() {
    if (!currentSession) return;
    if (confirm('确定要结束当前签到吗？')) {
      hideActiveSession();
      showToast('签到已结束', 'info');
    }
  }

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('userName').textContent = (user.name || user.teacherNo || '') + ' · 教师';

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      sessionStorage.removeItem('user');
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    });

    document.getElementById('startBtn').addEventListener('click', startAttendance);
    document.getElementById('endBtn').addEventListener('click', endAttendance);

    loadCourses().then(() => {
      checkActiveSessions();
    });
  }

  init();
})();
