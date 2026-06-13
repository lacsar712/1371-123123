(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let allCourses = [];
  let myCourseIds = new Set();

  function getStoredUser() {
    try {
      const raw = sessionStorage.getItem('user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u.role !== 'student' || !u.id) return null;
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

  /** 自定义确认弹框，返回 Promise<boolean>，不用原生 confirm */
  function showConfirm(message, title = '确认') {
    const overlay = document.getElementById('confirmOverlay');
    const messageEl = document.getElementById('confirmMessage');
    const titleEl = document.getElementById('confirmTitle');
    if (!overlay || !messageEl || !titleEl) return Promise.resolve(false);

    titleEl.textContent = title;
    messageEl.textContent = message;
    overlay.classList.add('show');

    return new Promise((resolve) => {
      const done = (result) => {
        overlay.classList.remove('show');
        resolve(result);
        overlay.removeEventListener('click', onOverlayClick);
        document.getElementById('confirmCancel').removeEventListener('click', onCancel);
        document.getElementById('confirmOk').removeEventListener('click', onOk);
      };
      const onOverlayClick = (e) => {
        if (e.target === overlay) done(false);
      };
      const onCancel = () => done(false);
      const onOk = () => done(true);

      overlay.addEventListener('click', onOverlayClick);
      document.getElementById('confirmCancel').addEventListener('click', onCancel);
      document.getElementById('confirmOk').addEventListener('click', onOk);
    });
  }

  function api(path, options = {}) {
    return fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })));
  }

  function renderCourseList(courses) {
    const container = document.getElementById('courseList');
    if (!container) return;
    container.innerHTML = courses
      .map((c) => {
        const enrolled = (c.enrolled ?? 0) | 0;
        const capacity = (c.capacity ?? 0) | 0;
        const full = capacity > 0 && enrolled >= capacity;
        const selected = myCourseIds.has(c.id);
        const canEnroll = !full && !selected;
        return `
          <div class="course-card ${canEnroll ? '' : 'disabled'}">
            <div class="code">${escapeHtml(c.code)}</div>
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="meta">
              <span>${c.credit ?? 0} 学分</span>
              <span>${enrolled} / ${capacity} 人</span>
            </div>
            ${canEnroll
              ? `<button type="button" class="btn btn-primary" data-id="${c.id}">选课</button>`
              : selected
                ? '<span style="color:var(--text-secondary);font-size:0.875rem;">已选</span>'
                : '<span style="color:var(--danger);font-size:0.875rem;">已满</span>'}
          </div>`;
      })
      .join('');

    container.querySelectorAll('.course-card .btn[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => enroll(parseInt(btn.dataset.id, 10)));
    });
  }

  function renderMyCourses(courses) {
    const container = document.getElementById('myCourses');
    if (!container) return;
    if (!courses.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);">暂无选课</p>';
      return;
    }
    container.innerHTML = courses
      .map(
        (c) => `
        <div class="course-card">
          <div class="code">${escapeHtml(c.code)}</div>
          <div class="name">${escapeHtml(c.name)}</div>
          <div class="meta">
            <span>${c.credit ?? 0} 学分</span>
          </div>
          <button type="button" class="btn btn-ghost" data-id="${c.id}">退课</button>
        </div>`
      )
      .join('');
    container.querySelectorAll('.btn[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => drop(parseInt(btn.dataset.id, 10)));
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
      second: '2-digit',
    });
  }

  async function signIn() {
    const code = document.getElementById('attendanceCode').value.trim();
    if (!code || code.length !== 6) {
      showToast('请输入 6 位签到码', 'error');
      return;
    }

    const btn = document.getElementById('signInBtn');
    btn.disabled = true;
    btn.textContent = '签到中...';

    try {
      const { data } = await api('/api/attendance/signin', {
        method: 'POST',
        body: JSON.stringify({ code, studentId: user.id }),
      });

      if (data && data.ok) {
        showToast('签到成功', 'success');
        document.getElementById('attendanceCode').value = '';
        loadAttendanceRecords();
      } else {
        showToast((data && data.message) || '签到失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '立即签到';
    }
  }

  async function loadAttendanceRecords() {
    const tbody = document.getElementById('attendanceRecordsBody');
    const { data } = await api(`/api/attendance/student/${user.id}/records`);
    if (data && data.ok && Array.isArray(data.data)) {
      const records = data.data;
      if (!records.length) {
        tbody.innerHTML =
          '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);">暂无签到记录</td></tr>';
        return;
      }
      tbody.innerHTML = records
        .map((r) => `
          <tr>
            <td>${escapeHtml(r.courseName || '')}</td>
            <td>${escapeHtml(r.courseCode || '')}</td>
            <td>${formatDateTime(r.signInTime)}</td>
            <td>${formatDateTime(r.sessionStartTime)}</td>
          </tr>
        `)
        .join('');
    } else {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
    }
  }

  async function loadCourses(keyword = '') {
    const path = keyword ? '/api/courses?keyword=' + encodeURIComponent(keyword) : '/api/courses';
    const { data } = await api(path);
    if (data && data.ok && Array.isArray(data.data)) {
      allCourses = data.data;
      renderCourseList(data.data);
    } else {
      document.getElementById('courseList').innerHTML =
        '<p style="color:var(--text-secondary);">加载失败</p>';
    }
  }

  async function loadMyCourses() {
    const { data } = await api('/api/students/' + user.id + '/courses');
    if (data && data.ok && Array.isArray(data.data)) {
      myCourseIds = new Set(data.data.map((c) => c.id));
      renderMyCourses(data.data);
    } else {
      document.getElementById('myCourses').innerHTML =
        '<p style="color:var(--text-secondary);">加载失败</p>';
    }
  }

  async function enroll(courseId) {
    const { data } = await api('/api/students/' + user.id + '/enroll', {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    });
    if (data && data.ok) {
      showToast('选课成功', 'success');
      loadCourses(document.getElementById('keyword').value.trim());
      loadMyCourses();
    } else {
      showToast((data && data.message) || '选课失败', 'error');
    }
  }

  async function drop(courseId) {
    const ok = await showConfirm('确定退选该课程？');
    if (!ok) return;
    const { data } = await api('/api/students/' + user.id + '/enroll/' + courseId, {
      method: 'DELETE',
    });
    if (data && data.ok) {
      showToast('退课成功', 'success');
      loadCourses(document.getElementById('keyword').value.trim());
      loadMyCourses();
    } else {
      showToast((data && data.message) || '退课失败', 'error');
    }
  }

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    document.getElementById('userName').textContent = (user.name || user.studentNo || '') + ' · 学生';

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      sessionStorage.removeItem('user');
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
      // 不 preventDefault，让 <a href> 原生跳转，Chrome 下更可靠
    });

    document.getElementById('searchBtn').addEventListener('click', () => {
      loadCourses(document.getElementById('keyword').value.trim());
    });
    document.getElementById('keyword').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') loadCourses(e.target.value.trim());
    });

    document.getElementById('signInBtn').addEventListener('click', signIn);
    document.getElementById('attendanceCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') signIn();
    });

    Promise.all([loadCourses(), loadMyCourses(), loadAttendanceRecords()]);
  }

  init();
})();
