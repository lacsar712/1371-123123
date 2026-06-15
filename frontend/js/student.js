(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;
  let allCourses = [];
  let myCourseIds = new Set();
  let myLotteryMap = {};

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
        const isLottery = !!c.lotteryMode;
        const alreadyInLottery = !!myLotteryMap[c.id];

        if (isLottery) {
          let actionHtml;
          if (selected) {
            actionHtml = '<span style="color:var(--text-secondary);font-size:0.875rem;">已中签</span>';
          } else if (alreadyInLottery) {
            const status = myLotteryMap[c.id];
            if (status === 'waiting') {
              actionHtml = '<span class="lottery-status lottery-waiting">等待开奖</span>';
            } else if (status === 'won') {
              actionHtml = '<span class="lottery-status lottery-won">已中签</span>';
            } else if (status === 'lost') {
              actionHtml = '<span class="lottery-status lottery-lost">未中签</span>';
            } else {
              actionHtml = '<span class="lottery-status lottery-waiting">等待开奖</span>';
            }
          } else {
            actionHtml = `<button type="button" class="btn btn-lottery" data-id="${c.id}">加入抽签</button>`;
          }
          return `
            <div class="course-card ${!selected && !alreadyInLottery ? '' : 'disabled'}">
              <div class="code">${escapeHtml(c.code)} <span class="lottery-tag">🎰 抽签</span></div>
              <div class="name">${escapeHtml(c.name)}</div>
              <div class="meta">
                <span>${c.credit ?? 0} 学分</span>
                <span>${enrolled} / ${capacity} 人</span>
              </div>
              ${actionHtml}
            </div>`;
        }

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

    container.querySelectorAll('.course-card .btn-primary[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => enroll(parseInt(btn.dataset.id, 10)));
    });
    container.querySelectorAll('.course-card .btn-lottery[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => joinLottery(parseInt(btn.dataset.id, 10)));
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

  function renderMyLottery(entries) {
    const container = document.getElementById('myLottery');
    if (!container) return;
    if (!entries.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);">暂无抽签记录</p>';
      return;
    }
    container.innerHTML = entries
      .map((e) => {
        const c = e.course;
        if (!c) return '';
        let statusHtml;
        let actionHtml = '';
        if (e.status === 'waiting') {
          statusHtml = '<span class="lottery-status lottery-waiting">等待开奖</span>';
          actionHtml = `<button type="button" class="btn btn-ghost btn-cancel-lottery" data-id="${c.id}" style="width:100%;margin-top:8px;font-size:0.8125rem;">退出抽签</button>`;
        } else if (e.status === 'won') {
          statusHtml = '<span class="lottery-status lottery-won">已中签</span>';
        } else if (e.status === 'lost') {
          statusHtml = '<span class="lottery-status lottery-lost">未中签</span>';
        } else {
          statusHtml = '<span class="lottery-status lottery-waiting">等待开奖</span>';
        }
        return `
          <div class="course-card">
            <div class="code">${escapeHtml(c.code)} <span class="lottery-tag">🎰 抽签</span></div>
            <div class="name">${escapeHtml(c.name)}</div>
            <div class="meta">
              <span>${c.credit ?? 0} 学分</span>
              <span>容量 ${c.capacity ?? 0}</span>
            </div>
            ${statusHtml}
            ${actionHtml}
          </div>`;
      })
      .join('');
    container.querySelectorAll('.btn-cancel-lottery').forEach((btn) => {
      btn.addEventListener('click', () => cancelLottery(parseInt(btn.dataset.id, 10)));
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
    if (!/^\d{6}$/.test(code)) {
      showToast('请输入 6 位数字签到码', 'error');
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

  async function loadMyLottery() {
    const { data } = await api('/api/students/' + user.id + '/lottery');
    if (data && data.ok && Array.isArray(data.data)) {
      myLotteryMap = {};
      data.data.forEach((e) => {
        myLotteryMap[e.courseId] = e.status;
      });
      renderMyLottery(data.data);
      renderCourseList(allCourses);
    } else {
      document.getElementById('myLottery').innerHTML =
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

  async function joinLottery(courseId) {
    const { data } = await api('/api/students/' + user.id + '/enroll', {
      method: 'POST',
      body: JSON.stringify({ courseId }),
    });
    if (data && data.ok) {
      showToast('已加入抽签', 'success');
      loadMyLottery();
      loadCourses(document.getElementById('keyword').value.trim());
    } else {
      showToast((data && data.message) || '加入抽签失败', 'error');
    }
  }

  async function cancelLottery(courseId) {
    const ok = await showConfirm('确定退出该课程的抽签？');
    if (!ok) return;
    const { data } = await api('/api/students/' + user.id + '/enroll/' + courseId, {
      method: 'DELETE',
    });
    if (data && data.ok) {
      showToast('已退出抽签', 'success');
      loadMyLottery();
      loadCourses(document.getElementById('keyword').value.trim());
    } else {
      showToast((data && data.message) || '退出抽签失败', 'error');
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

  let currentTicketPage = 1;
  let currentTicketStatus = '';
  let currentTicketId = null;
  let notificationTimer = null;
  let lastNotificationId = 0;
  let notificationSSE = null;
  let notificationDropdownOpen = false;
  let soundEnabled = true;
  let ncCurrentType = '';
  let ncCurrentPage = 1;
  let ncSelectedIds = new Set();
  let notificationAudioCtx = null;

  function playNotificationSound() {
    if (!soundEnabled) return;
    try {
      if (!notificationAudioCtx) {
        notificationAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = notificationAudioCtx;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
      oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.16);
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  }

  function shakeBell() {
    const bell = document.getElementById('bellIcon');
    if (bell) {
      bell.classList.remove('bell-shake');
      void bell.offsetWidth;
      bell.classList.add('bell-shake');
    }
  }

  function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (count > 0) {
        badge.style.display = 'inline-flex';
        badge.textContent = count > 99 ? '99+' : count;
      } else {
        badge.style.display = 'none';
      }
    }
    const ticketBadge = document.getElementById('ticketBadge');
    if (ticketBadge) {
      ticketBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  async function fetchUnreadCount() {
    if (!user) return;
    try {
      const params = new URLSearchParams({ userId: user.id, userRole: 'student' });
      const { data } = await api('/api/notifications/unread-count?' + params.toString());
      if (data && data.ok && data.data) {
        updateNotificationBadge(data.data.unreadCount);
      }
    } catch (e) {}
  }

  function connectSSE() {
    if (!user) return;
    if (notificationSSE) {
      notificationSSE.close();
      notificationSSE = null;
    }
    try {
      const url = API_BASE + '/api/notifications/sse?userId=' + user.id + '&userRole=student';
      notificationSSE = new EventSource(url);
      notificationSSE.onmessage = function (event) {
        try {
          const notification = JSON.parse(event.data);
          if (notification.type === 'connected') return;
          onNewNotification(notification);
        } catch (e) {}
      };
      notificationSSE.onerror = function () {
        notificationSSE.close();
        notificationSSE = null;
        setTimeout(connectSSE, 5000);
      };
    } catch (e) {
      setTimeout(connectSSE, 5000);
    }
  }

  function onNewNotification(notification) {
    if (notification.id <= lastNotificationId) return;
    lastNotificationId = notification.id;
    showFloatingNotification(notification);
    shakeBell();
    playNotificationSound();
    fetchUnreadCount();
  }

  async function loadNotificationDropdown() {
    if (!user) return;
    try {
      const params = new URLSearchParams({ userId: user.id, userRole: 'student', limit: '10' });
      const { data } = await api('/api/notifications/latest?' + params.toString());
      if (data && data.ok && data.data) {
        updateNotificationBadge(data.data.unreadCount);
        renderNotificationDropdown(data.data.list);
      }
    } catch (e) {}
  }

  function getTypeIcon(type) {
    const map = {
      lottery: '🎰',
      ticket: '📩',
      badge: '🏅',
      exam: '📝',
      announcement: '📢',
      system: '⚙️',
    };
    return map[type] || '🔔';
  }

  function getTypeLabel(type) {
    const map = {
      lottery: '候补转正',
      ticket: '工单回复',
      badge: '新勋章',
      exam: '考试提醒',
      announcement: '公告',
      system: '系统',
    };
    return map[type] || '通知';
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return minutes + ' 分钟前';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' 小时前';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + ' 天前';
    return formatDateTime(dateStr);
  }

  function renderNotificationDropdown(notifications) {
    const container = document.getElementById('notificationDropdownList');
    if (!container) return;
    if (!notifications || !notifications.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:32px;">暂无通知</div>';
      return;
    }
    container.innerHTML = notifications.map((n) => `
      <div class="notification-dropdown-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}" data-type="${n.type || 'system'}" data-related-type="${n.relatedObjectType || ''}" data-related-id="${n.relatedObjectId || ''}">
        <div class="notification-dropdown-item-icon">${getTypeIcon(n.type)}</div>
        <div class="notification-dropdown-item-content">
          <div class="notification-dropdown-item-title">${escapeHtml(n.title)}</div>
          <div class="notification-dropdown-item-desc">${escapeHtml(n.content || '')}</div>
          <div class="notification-dropdown-item-time">${formatRelativeTime(n.createdAt)}</div>
        </div>
        ${n.isRead ? '' : '<div class="notification-unread-dot"></div>'}
      </div>
    `).join('');

    container.querySelectorAll('.notification-dropdown-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id, 10);
        const relatedType = el.dataset.relatedType;
        const relatedId = parseInt(el.dataset.relatedId, 10);
        if (!parseInt(el.dataset.isRead || '0')) {
          markNotificationRead(id);
          el.classList.remove('unread');
          const dot = el.querySelector('.notification-unread-dot');
          if (dot) dot.remove();
        }
        toggleNotificationDropdown(false);
        handleNotificationClick(relatedType, relatedId);
      });
    });
  }

  function handleNotificationClick(relatedType, relatedId) {
    if (relatedType === 'ticket' && relatedId) {
      showTicketPage();
      showTicketDetailPage(relatedId);
    } else if (relatedType === 'enrollment' && relatedId) {
      loadMyCourses();
      loadMyLottery();
    } else if (relatedType === 'badge') {
      showBadgePage();
    } else if (relatedType === 'exam') {
      showExamPage();
    }
  }

  function toggleNotificationDropdown(show) {
    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;
    if (show === undefined) {
      notificationDropdownOpen = !notificationDropdownOpen;
    } else {
      notificationDropdownOpen = show;
    }
    if (notificationDropdownOpen) {
      dropdown.style.display = 'block';
      loadNotificationDropdown();
    } else {
      dropdown.style.display = 'none';
    }
  }

  function showNotificationCenterPage() {
    hideAllPages();
    document.getElementById('notificationCenterPage').style.display = 'block';
    ncCurrentPage = 1;
    ncSelectedIds = new Set();
    loadNotificationCenterList();
  }

  function hideNotificationCenterPage() {
    document.getElementById('notificationCenterPage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  async function loadNotificationCenterList() {
    if (!user) return;
    const container = document.getElementById('notificationCenterList');
    const params = new URLSearchParams({
      userId: user.id,
      userRole: 'student',
      page: ncCurrentPage,
      pageSize: 20,
    });
    if (ncCurrentType) params.append('type', ncCurrentType);

    try {
      const { data } = await api('/api/notifications?' + params.toString());
      if (data && data.ok && data.data) {
        updateNotificationBadge(data.data.unreadCount);
        renderNotificationCenterList(data.data);
      } else {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">加载失败</div>';
      }
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">网络错误</div>';
    }
  }

  function renderNotificationCenterList(pageData) {
    const container = document.getElementById('notificationCenterList');
    const { list, total, totalPages } = pageData;

    if (!list || !list.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">暂无通知</div>';
      document.getElementById('notificationCenterPagination').innerHTML = '';
      return;
    }

    container.innerHTML = list.map((n) => `
      <div class="nc-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}" data-type="${n.type || 'system'}" data-related-type="${n.relatedObjectType || ''}" data-related-id="${n.relatedObjectId || ''}">
        <label class="nc-checkbox-wrap" onclick="event.stopPropagation();">
          <input type="checkbox" class="nc-checkbox" data-id="${n.id}" ${ncSelectedIds.has(n.id) ? 'checked' : ''} />
        </label>
        <div class="nc-item-icon">${getTypeIcon(n.type)}</div>
        <div class="nc-item-content" data-id="${n.id}" data-related-type="${n.relatedObjectType || ''}" data-related-id="${n.relatedObjectId || ''}">
          <div class="nc-item-title">
            <span class="nc-type-tag nc-type-${n.type || 'system'}">${getTypeLabel(n.type)}</span>
            ${escapeHtml(n.title)}
          </div>
          <div class="nc-item-desc">${escapeHtml(n.content || '')}</div>
          <div class="nc-item-meta">
            <span>${formatRelativeTime(n.createdAt)}</span>
            ${n.isRead ? '' : '<span style="color:var(--accent-start);">未读</span>'}
          </div>
        </div>
        <div class="nc-item-actions">
          ${n.isRead ? '' : `<button type="button" class="nc-action-btn nc-read-btn" data-id="${n.id}" title="标已读">✓</button>`}
          <button type="button" class="nc-action-btn nc-delete-btn" data-id="${n.id}" title="删除">✕</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.nc-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(cb.dataset.id, 10);
        if (cb.checked) ncSelectedIds.add(id);
        else ncSelectedIds.delete(id);
      });
    });

    container.querySelectorAll('.nc-item-content').forEach((el) => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id, 10);
        const relatedType = el.dataset.relatedType;
        const relatedId = parseInt(el.dataset.relatedId, 10);
        markNotificationRead(id);
        handleNotificationClick(relatedType, relatedId);
      });
    });

    container.querySelectorAll('.nc-read-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        markNotificationRead(id);
        loadNotificationCenterList();
      });
    });

    container.querySelectorAll('.nc-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        try {
          await api('/api/notifications/' + id, { method: 'DELETE' });
          loadNotificationCenterList();
        } catch (e) {}
      });
    });

    renderNCPagination(total, totalPages);
  }

  function renderNCPagination(total, totalPages) {
    const container = document.getElementById('notificationCenterPagination');
    if (!container || totalPages <= 1) {
      if (container) container.innerHTML = '';
      return;
    }
    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${ncCurrentPage === 1 ? 'disabled' : ''} data-page="prev">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === ncCurrentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" ${ncCurrentPage === totalPages ? 'disabled' : ''} data-page="next">下一页</button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'prev' && ncCurrentPage > 1) ncCurrentPage--;
        else if (page === 'next' && ncCurrentPage < totalPages) ncCurrentPage++;
        else if (page !== 'prev' && page !== 'next') ncCurrentPage = parseInt(page, 10);
        loadNotificationCenterList();
      });
    });
  }

  function showTicketPage() {
    document.querySelector('main.student-main').style.display = 'none';
    document.getElementById('ticketPage').style.display = 'block';
    loadTicketList();
  }

  function hideTicketPage() {
    document.getElementById('ticketPage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  function showTicketDetailPage(ticketId) {
    currentTicketId = ticketId;
    document.getElementById('ticketPage').style.display = 'none';
    document.getElementById('ticketDetailPage').style.display = 'block';
    loadTicketDetail(ticketId);
  }

  function hideTicketDetailPage() {
    document.getElementById('ticketDetailPage').style.display = 'none';
    document.getElementById('ticketPage').style.display = 'block';
    currentTicketId = null;
  }

  async function loadTicketList() {
    const container = document.getElementById('ticketList');
    const params = new URLSearchParams({
      submitterId: user.id,
      submitterRole: 'student',
      page: currentTicketPage,
      pageSize: 10,
    });
    if (currentTicketStatus) params.append('status', currentTicketStatus);

    const { data } = await api('/api/tickets?' + params.toString());
    if (data && data.ok && data.data) {
      const { list, total, totalPages } = data.data;
      if (!list.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">暂无工单</div>';
      } else {
        container.innerHTML = list.map((t) => `
          <div class="ticket-card" data-id="${t.id}">
            <div class="ticket-card-header">
              <span class="ticket-category ticket-cat-${t.category}">${escapeHtml(t.categoryText || t.category)}</span>
              <span class="ticket-status ticket-status-${t.status}">${escapeHtml(t.statusText || t.status)}</span>
            </div>
            <div class="ticket-card-title">${escapeHtml(t.title)}</div>
            <div class="ticket-card-meta">
              <span>创建时间：${formatDateTime(t.createdAt)}</span>
              <span>最后回复：${formatDateTime(t.lastReplyAt)}</span>
            </div>
            ${t.handlerName ? `<div class="ticket-card-handler">处理人：${escapeHtml(t.handlerName)}</div>` : ''}
          </div>
        `).join('');

        container.querySelectorAll('.ticket-card').forEach((card) => {
          card.addEventListener('click', () => {
            showTicketDetailPage(parseInt(card.dataset.id, 10));
          });
        });
      }
      renderPagination(total, totalPages);
    } else {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">加载失败</div>';
    }
  }

  function renderPagination(total, totalPages) {
    const container = document.getElementById('ticketPagination');
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${currentTicketPage === 1 ? 'disabled' : ''} data-page="prev">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === currentTicketPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" ${currentTicketPage === totalPages ? 'disabled' : ''} data-page="next">下一页</button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'prev' && currentTicketPage > 1) {
          currentTicketPage--;
        } else if (page === 'next' && currentTicketPage < totalPages) {
          currentTicketPage++;
        } else if (page !== 'prev' && page !== 'next') {
          currentTicketPage = parseInt(page, 10);
        }
        loadTicketList();
      });
    });
  }

  async function loadTicketDetail(ticketId) {
    const container = document.getElementById('ticketDetailContent');
    const replySection = document.getElementById('ticketReplySection');
    const { data } = await api('/api/tickets/' + ticketId + '?requesterId=' + user.id + '&requesterRole=student');
    if (data && data.ok && data.data) {
      const ticket = data.data;
      document.getElementById('detailTitle').textContent = ticket.title;

      let html = `
        <div class="ticket-detail-header">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <span class="ticket-category ticket-cat-${ticket.category}">${escapeHtml(ticket.categoryText || ticket.category)}</span>
            <span class="ticket-status ticket-status-${ticket.status}">${escapeHtml(ticket.statusText || ticket.status)}</span>
          </div>
          <div class="ticket-detail-meta">
            <span>提交人：${escapeHtml(ticket.submitterName)}</span>
            <span>提交时间：${formatDateTime(ticket.createdAt)}</span>
            ${ticket.handlerName ? `<span>处理人：${escapeHtml(ticket.handlerName)}</span>` : ''}
          </div>
        </div>
        <div class="ticket-detail-body">
          <div class="ticket-description">
            <h4>问题描述</h4>
            <p>${escapeHtml(ticket.description).replace(/\n/g, '<br>')}</p>
          </div>
      `;

      if (ticket.replies && ticket.replies.length) {
        html += '<div class="ticket-replies"><h4>回复记录</h4>';
        ticket.replies.forEach((reply) => {
          const isAdmin = reply.replyerRole === 'admin';
          html += `
            <div class="ticket-reply ${isAdmin ? 'reply-admin' : 'reply-user'}">
              <div class="reply-header">
                <span class="replyer-name">${escapeHtml(reply.replyerName)}</span>
                <span class="reply-time">${formatDateTime(reply.createdAt)}</span>
              </div>
              <div class="reply-content">${escapeHtml(reply.content).replace(/\n/g, '<br>')}</div>
            </div>
          `;
        });
        html += '</div>';
      }

      html += '</div>';
      container.innerHTML = html;

      if (ticket.status !== 'closed') {
        replySection.style.display = 'block';
      } else {
        replySection.style.display = 'none';
      }
    } else {
      const msg = (data && data.message) || '加载失败';
      if (data && data.message === '无权查看该工单') {
        container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">无权查看该工单</div>';
        replySection.style.display = 'none';
      } else {
        container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">' + escapeHtml(msg) + '</div>';
      }
    }
  }

  function openNewTicketModal() {
    document.getElementById('ticketTitle').value = '';
    document.getElementById('ticketDesc').value = '';
    document.getElementById('ticketCategory').value = 'course_enrollment';
    document.getElementById('newTicketModal').classList.add('show');
  }

  function closeNewTicketModal() {
    document.getElementById('newTicketModal').classList.remove('show');
  }

  async function submitTicket() {
    const title = document.getElementById('ticketTitle').value.trim();
    const description = document.getElementById('ticketDesc').value.trim();
    const category = document.getElementById('ticketCategory').value;

    if (!title) {
      showToast('请输入标题', 'error');
      return;
    }
    if (!description) {
      showToast('请输入详细描述', 'error');
      return;
    }

    const btn = document.getElementById('submitTicketBtn');
    btn.disabled = true;
    btn.textContent = '提交中...';

    try {
      const { data } = await api('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          category,
          submitterId: user.id,
          submitterRole: 'student',
          submitterName: user.name,
        }),
      });

      if (data && data.ok) {
        showToast('工单提交成功', 'success');
        closeNewTicketModal();
        loadTicketList();
      } else {
        showToast((data && data.message) || '提交失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交';
    }
  }

  async function submitReply() {
    const content = document.getElementById('replyContent').value.trim();
    if (!content) {
      showToast('请输入回复内容', 'error');
      return;
    }
    if (!currentTicketId) return;

    const btn = document.getElementById('submitReplyBtn');
    btn.disabled = true;
    btn.textContent = '发送中...';

    try {
      const { data } = await api(`/api/tickets/${currentTicketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          replyerId: user.id,
          replyerRole: 'student',
          replyerName: user.name,
        }),
      });

      if (data && data.ok) {
        showToast('回复成功', 'success');
        document.getElementById('replyContent').value = '';
        loadTicketDetail(currentTicketId);
      } else {
        showToast((data && data.message) || '回复失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交回复';
    }
  }

  async function checkNotifications() {
    if (!user) return;
    await fetchUnreadCount();
  }

  function showFloatingNotification(notification) {
    const el = document.createElement('div');
    el.className = 'floating-notification';
    el.innerHTML = `
      <div class="floating-notification-icon">${getTypeIcon(notification.type)}</div>
      <div class="floating-notification-body">
        <div class="floating-notification-title">${escapeHtml(notification.title)}</div>
        <div class="floating-notification-content">${escapeHtml(notification.content || '')}</div>
      </div>
    `;
    document.body.appendChild(el);

    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 5000);

    el.addEventListener('click', () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
      const relatedType = notification.relatedObjectType;
      const relatedId = notification.relatedObjectId;
      handleNotificationClick(relatedType, relatedId);
    });

    if (!notification.isRead) {
      markNotificationRead(notification.id);
    }
  }

  async function markNotificationRead(id) {
    try {
      await api('/api/notifications/' + id + '/read', { method: 'PUT' });
      fetchUnreadCount();
    } catch (e) {}
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
      if (notificationTimer) clearInterval(notificationTimer);
      if (notificationSSE) notificationSSE.close();
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
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
    document.getElementById('attendanceCode').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });

    document.getElementById('ticketBtn').addEventListener('click', showTicketPage);
    document.getElementById('ticketBackBtn').addEventListener('click', hideTicketPage);
    document.getElementById('ticketDetailBackBtn').addEventListener('click', hideTicketDetailPage);
    document.getElementById('newTicketBtn').addEventListener('click', openNewTicketModal);
    document.getElementById('cancelTicketBtn').addEventListener('click', closeNewTicketModal);
    document.getElementById('submitTicketBtn').addEventListener('click', submitTicket);
    document.getElementById('submitReplyBtn').addEventListener('click', submitReply);

    document.getElementById('newTicketModal').addEventListener('click', (e) => {
      if (e.target.id === 'newTicketModal') closeNewTicketModal();
    });

    document.querySelectorAll('.ticket-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ticket-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentTicketStatus = btn.dataset.status || '';
        currentTicketPage = 1;
        loadTicketList();
      });
    });

    Promise.all([loadCourses(), loadMyCourses(), loadMyLottery(), loadAttendanceRecords()]);

    fetchUnreadCount();
    connectSSE();

    document.getElementById('notificationBellBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotificationDropdown();
    });

    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('notificationDropdown');
      const bellBtn = document.getElementById('notificationBellBtn');
      if (notificationDropdownOpen && dropdown && !dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
        toggleNotificationDropdown(false);
      }
    });

    document.getElementById('markAllReadBtn').addEventListener('click', async () => {
      try {
        const params = new URLSearchParams({ userId: user.id, userRole: 'student' });
        await api('/api/notifications/read-all?' + params.toString(), { method: 'POST' });
        updateNotificationBadge(0);
        loadNotificationDropdown();
        showToast('已全部标为已读', 'success');
      } catch (e) {}
    });

    const viewAllBtn = document.getElementById('viewAllNotificationsBtn');
    if (viewAllBtn) {
      viewAllBtn.addEventListener('click', () => {
        toggleNotificationDropdown(false);
        showNotificationCenterPage();
      });
    }

    document.getElementById('soundToggleBtn').addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      document.getElementById('soundToggleBtn').textContent = soundEnabled ? '🔊' : '🔇';
    });

    document.getElementById('notificationCenterBackBtn').addEventListener('click', hideNotificationCenterPage);

    document.querySelectorAll('.notification-center-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.notification-center-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        ncCurrentType = btn.dataset.ntype || '';
        ncCurrentPage = 1;
        ncSelectedIds = new Set();
        loadNotificationCenterList();
      });
    });

    document.getElementById('ncBatchReadBtn').addEventListener('click', async () => {
      if (ncSelectedIds.size === 0) {
        showToast('请先选择通知', 'error');
        return;
      }
      try {
        await api('/api/notifications/batch-read', {
          method: 'POST',
          body: JSON.stringify({ ids: Array.from(ncSelectedIds) }),
        });
        ncSelectedIds = new Set();
        loadNotificationCenterList();
        showToast('已批量标为已读', 'success');
      } catch (e) {
        showToast('操作失败', 'error');
      }
    });

    document.getElementById('ncBatchDeleteBtn').addEventListener('click', async () => {
      if (ncSelectedIds.size === 0) {
        showToast('请先选择通知', 'error');
        return;
      }
      const ok = await showConfirm('确定删除选中的通知？');
      if (!ok) return;
      try {
        await api('/api/notifications/batch-delete', {
          method: 'POST',
          body: JSON.stringify({ ids: Array.from(ncSelectedIds) }),
        });
        ncSelectedIds = new Set();
        loadNotificationCenterList();
        showToast('已批量删除', 'success');
      } catch (e) {
        showToast('删除失败', 'error');
      }
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .lottery-tag {
      display: inline-block;
      background: rgba(139, 92, 246, 0.15);
      color: #a78bfa;
      font-size: 0.6875rem;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 600;
      margin-left: 6px;
      vertical-align: middle;
    }
    .btn-lottery {
      width: 100%;
      height: 44px;
      margin-top: 4px;
      background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
      color: #fff;
      border: none;
      border-radius: 12px;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 20px rgba(139, 92, 246, 0.35);
      -webkit-appearance: none;
      appearance: none;
    }
    .btn-lottery:hover {
      box-shadow: 0 8px 28px rgba(139, 92, 246, 0.45);
    }
    .btn-lottery:active {
      transform: scale(0.98);
    }
    .lottery-status {
      display: inline-block;
      width: 100%;
      text-align: center;
      padding: 10px 0;
      border-radius: 12px;
      font-size: 0.9375rem;
      font-weight: 600;
      margin-top: 4px;
    }
    .lottery-waiting {
      background: rgba(234, 179, 8, 0.12);
      color: #eab308;
      border: 1px solid rgba(234, 179, 8, 0.25);
    }
    .lottery-won {
      background: rgba(34, 197, 94, 0.12);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.25);
    }
    .lottery-lost {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }
    .badge-dot {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      display: inline-block;
    }
    .ticket-page {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }
    .ticket-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      gap: 16px;
    }
    .ticket-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .tab-btn {
      padding: 8px 20px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--bg-glass-border);
      border-radius: 9999px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      background: rgba(99, 102, 241, 0.1);
      color: var(--text-primary);
    }
    .tab-btn.active {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
      color: #fff;
      border-color: var(--accent-start);
    }
    .ticket-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .ticket-card {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .ticket-card:hover {
      border-color: var(--accent-start);
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15);
    }
    .ticket-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      gap: 12px;
    }
    .ticket-category {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .ticket-cat-course_enrollment {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .ticket-cat-grade_appeal {
      background: rgba(249, 115, 22, 0.15);
      color: #fb923c;
    }
    .ticket-cat-system_fault {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    .ticket-cat-other {
      background: rgba(161, 161, 170, 0.15);
      color: #a1a1aa;
    }
    .ticket-status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .ticket-status-pending {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }
    .ticket-status-processing {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .ticket-status-resolved {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .ticket-status-closed {
      background: rgba(161, 161, 170, 0.15);
      color: #a1a1aa;
    }
    .ticket-card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
    }
    .ticket-card-meta {
      display: flex;
      gap: 24px;
      color: var(--text-secondary);
      font-size: 0.8125rem;
      flex-wrap: wrap;
    }
    .ticket-card-handler {
      margin-top: 8px;
      color: var(--text-secondary);
      font-size: 0.8125rem;
    }
    .ticket-pagination {
      margin-top: 24px;
      text-align: center;
    }
    .pagination {
      display: inline-flex;
      gap: 8px;
    }
    .page-btn {
      min-width: 36px;
      height: 36px;
      padding: 0 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--bg-glass-border);
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;
    }
    .page-btn:hover:not(:disabled) {
      background: rgba(99, 102, 241, 0.1);
      color: var(--text-primary);
    }
    .page-btn.active {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      border-color: transparent;
    }
    .page-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .ticket-detail {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 24px;
    }
    .ticket-detail-header {
      padding-bottom: 20px;
      border-bottom: 1px solid var(--bg-glass-border);
      margin-bottom: 20px;
    }
    .ticket-detail-meta {
      margin-top: 12px;
      display: flex;
      gap: 24px;
      color: var(--text-secondary);
      font-size: 0.875rem;
      flex-wrap: wrap;
    }
    .ticket-detail-body h4 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    .ticket-description p {
      color: var(--text-primary);
      line-height: 1.7;
      margin: 0;
    }
    .ticket-replies {
      margin-top: 24px;
    }
    .ticket-reply {
      margin-bottom: 16px;
      padding: 16px;
      border-radius: 12px;
    }
    .reply-user {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.15);
    }
    .reply-admin {
      background: rgba(34, 197, 94, 0.08);
      border: 1px solid rgba(34, 197, 94, 0.15);
    }
    .reply-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .replyer-name {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 0.9375rem;
    }
    .reply-time {
      color: var(--text-secondary);
      font-size: 0.8125rem;
    }
    .reply-content {
      color: var(--text-primary);
      line-height: 1.6;
    }
    .ticket-reply-section {
      margin-top: 24px;
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .ticket-reply-section textarea {
      width: 100%;
      padding: 12px 16px;
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--bg-glass-border);
      border-radius: 12px;
      color: var(--text-primary);
      font-size: 0.9375rem;
      resize: vertical;
      min-height: 80px;
      margin-bottom: 12px;
      font-family: inherit;
    }
    .ticket-reply-section textarea:focus {
      outline: none;
      border-color: var(--accent-start);
    }
    .floating-notification {
      position: fixed;
      top: 80px;
      right: 24px;
      max-width: 360px;
      background: linear-gradient(135deg, #1e1b4b, #312e81);
      border: 1px solid rgba(99, 102, 241, 0.5);
      border-radius: 12px;
      padding: 16px 20px;
      color: #fff;
      cursor: pointer;
      z-index: 9999;
      transform: translateX(calc(100% + 40px));
      transition: transform 0.3s ease;
      box-shadow: 0 12px 40px rgba(99, 102, 241, 0.3);
    }
    .floating-notification.show {
      transform: translateX(0);
    }
    .floating-notification-title {
      font-weight: 600;
      font-size: 0.9375rem;
      margin-bottom: 4px;
    }
    .floating-notification-content {
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.8);
      line-height: 1.5;
    }
    .notification-panel {
      position: fixed;
      top: 70px;
      right: 24px;
      width: 360px;
      background: var(--bg-glass);
      backdrop-filter: blur(20px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      z-index: 1000;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
      overflow: hidden;
    }
    .notification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--bg-glass-border);
      font-weight: 600;
    }
    .notification-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .notification-item {
      padding: 14px 20px;
      border-bottom: 1px solid var(--bg-glass-border);
      cursor: pointer;
      transition: background 0.2s;
    }
    .notification-item:hover {
      background: rgba(99, 102, 241, 0.1);
    }
    .notification-item.unread {
      background: rgba(99, 102, 241, 0.05);
    }
    .notification-item-title {
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
      font-size: 0.875rem;
    }
    .notification-item-content {
      color: var(--text-secondary);
      font-size: 0.8125rem;
      line-height: 1.5;
    }
    .notification-item-time {
      color: var(--text-secondary);
      font-size: 0.75rem;
      margin-top: 6px;
    }
  `;
  document.head.appendChild(style);

  let calendarInstance = null;
  let editingEvent = null;
  const EVENT_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#7c3aed', '#d946ef', '#ec4899', '#f472b6', '#f59e0b', '#f97316', '#06b6d4'];

  function showCalendarPage() {
    document.querySelector('main.student-main').style.display = 'none';
    document.getElementById('ticketPage').style.display = 'none';
    document.getElementById('ticketDetailPage').style.display = 'none';
    const calPage = document.getElementById('calendarPage');
    calPage.style.display = 'block';
    if (!calendarInstance) {
      calendarInstance = new Calendar('#calendarContainer', {
        view: 'month',
        currentDate: new Date(),
        events: [],
        canCreateCustom: true,
        onCellClick: onCalendarCellClick,
        onEventClick: onCalendarEventClick,
        onDateChange: () => loadCalendarEvents(),
        onViewChange: () => loadCalendarEvents(),
      });
    } else {
      calendarInstance.setDate(new Date());
    }
    loadCalendarEvents();
  }

  function hideCalendarPage() {
    document.getElementById('calendarPage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  async function loadCalendarEvents() {
    if (!calendarInstance || !user) return;
    const { start, end } = calendarInstance.getViewRange();
    const params = new URLSearchParams({
      userId: user.id,
      userRole: user.role,
      start: start.toISOString(),
      end: end.toISOString(),
    });
    try {
      const { data } = await api('/api/calendar/events?' + params.toString());
      if (data && data.ok && Array.isArray(data.data)) {
        calendarInstance.setEvents(data.data);
      }
    } catch (e) {
      showToast('加载日程失败', 'error');
    }
  }

  function onCalendarCellClick(defaultStart) {
    openEventModal(null, defaultStart);
  }

  function onCalendarEventClick(event, el) {
    if (event.category === 'custom') {
      openEventModal(event, null);
    } else {
      openEventViewModal(event);
    }
  }

  function renderColorSwatches(selectedColor) {
    const container = document.getElementById('colorSwatches');
    if (!container) return;
    const active = selectedColor || EVENT_COLORS[0];
    container.innerHTML = EVENT_COLORS.map((c) => `
      <button type="button" class="color-swatch ${c.toLowerCase() === active.toLowerCase() ? 'active' : ''}"
              data-color="${c}" style="background:${c};color:${c};" aria-label="颜色 ${c}"></button>
    `).join('');
    container.querySelectorAll('.color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        container.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
      });
    });
  }

  function getSelectedColor() {
    const active = document.querySelector('#colorSwatches .color-swatch.active');
    return active ? active.dataset.color : EVENT_COLORS[0];
  }

  function openEventViewModal(event) {
    editingEvent = null;
    const modal = document.getElementById('eventModal');
    document.getElementById('eventModalTitle').textContent = event.title || '事件详情';
    const infoRow = document.getElementById('eventInfoRow');
    infoRow.style.display = 'block';
    const s = CalendarUtils.parseISODate(event.startTime);
    const e = CalendarUtils.parseISODate(event.endTime);
    const timeStr = s && e ? `${CalendarUtils.fmtDate(s)} ${CalendarUtils.formatTimeHM(s)} - ${CalendarUtils.formatTimeHM(e)}` : '';
    const cat = event.category || 'custom';
    infoRow.innerHTML = `
      <div class="event-info-row" style="margin-bottom:0;">
        <span class="event-info-label cat-${cat}">${CalendarUtils.categoryLabel(cat)}</span>
        <span class="event-info-time">${timeStr}</span>
      </div>
    `;
    document.getElementById('eventTitleGroup').style.display = 'none';
    document.getElementById('eventTimeGroup').style.display = 'none';
    document.getElementById('eventColorGroup').style.display = 'none';
    document.getElementById('eventDeleteBtn').style.display = 'none';
    document.getElementById('eventSaveBtn').style.display = 'none';
    document.getElementById('eventCancelBtn').textContent = '关闭';
    modal.classList.add('show');
  }

  function openEventModal(event, defaultStart) {
    editingEvent = event && event.category === 'custom' ? event : null;
    const modal = document.getElementById('eventModal');
    const infoRow = document.getElementById('eventInfoRow');
    infoRow.style.display = 'none';
    document.getElementById('eventTitleGroup').style.display = '';
    document.getElementById('eventTimeGroup').style.display = '';
    document.getElementById('eventColorGroup').style.display = '';
    document.getElementById('eventSaveBtn').style.display = '';
    document.getElementById('eventCancelBtn').textContent = '取消';

    if (editingEvent) {
      document.getElementById('eventModalTitle').textContent = '编辑事件';
      document.getElementById('eventTitle').value = editingEvent.title || '';
      const s = CalendarUtils.parseISODate(editingEvent.startTime);
      const e = CalendarUtils.parseISODate(editingEvent.endTime);
      document.getElementById('eventStart').value = s ? CalendarUtils.fmtDateTime(s) : '';
      document.getElementById('eventEnd').value = e ? CalendarUtils.fmtDateTime(e) : '';
      document.getElementById('eventDeleteBtn').style.display = '';
      renderColorSwatches(editingEvent.color);
    } else {
      document.getElementById('eventModalTitle').textContent = '新建事件';
      document.getElementById('eventTitle').value = '';
      const start = defaultStart || new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      document.getElementById('eventStart').value = CalendarUtils.fmtDateTime(start);
      document.getElementById('eventEnd').value = CalendarUtils.fmtDateTime(end);
      document.getElementById('eventDeleteBtn').style.display = 'none';
      renderColorSwatches(EVENT_COLORS[0]);
    }

    modal.classList.add('show');
  }

  function closeEventModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('show');
    editingEvent = null;
  }

  async function saveEvent() {
    const title = document.getElementById('eventTitle').value.trim();
    const startStr = document.getElementById('eventStart').value;
    const endStr = document.getElementById('eventEnd').value;
    const color = getSelectedColor();

    if (!title) {
      showToast('请输入事件标题', 'error');
      return;
    }
    if (!startStr || !endStr) {
      showToast('请选择起止时间', 'error');
      return;
    }
    const start = CalendarUtils.parseISODate(startStr);
    const end = CalendarUtils.parseISODate(endStr);
    if (!start || !end) {
      showToast('时间格式无效', 'error');
      return;
    }
    if (end <= start) {
      showToast('结束时间必须晚于开始时间', 'error');
      return;
    }

    const payload = {
      userId: user.id,
      userRole: user.role,
      title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      color,
    };

    const btn = document.getElementById('eventSaveBtn');
    btn.disabled = true;
    btn.textContent = '保存中...';

    try {
      let resp;
      if (editingEvent) {
        const idMatch = String(editingEvent.id).match(/^custom_(\d+)$/);
        if (!idMatch) throw new Error('无效的事件 ID');
        resp = await api('/api/calendar/events/' + idMatch[1], {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        resp = await api('/api/calendar/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      const { data } = resp;
      if (data && data.ok) {
        showToast(editingEvent ? '已更新' : '已创建', 'success');
        closeEventModal();
        loadCalendarEvents();
      } else {
        showToast((data && data.message) || '保存失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存';
    }
  }

  async function deleteEvent() {
    if (!editingEvent) return;
    const idMatch = String(editingEvent.id).match(/^custom_(\d+)$/);
    if (!idMatch) {
      showToast('该事件无法删除', 'error');
      return;
    }
    const ok = await showConfirm('确定删除该事件？', '删除确认');
    if (!ok) return;
    const btn = document.getElementById('eventDeleteBtn');
    btn.disabled = true;
    btn.textContent = '删除中...';
    try {
      const { data } = await api('/api/calendar/events/' + idMatch[1], {
        method: 'DELETE',
        body: JSON.stringify({ userId: user.id, userRole: user.role }),
      });
      if (data && data.ok) {
        showToast('已删除', 'success');
        closeEventModal();
        loadCalendarEvents();
      } else {
        showToast((data && data.message) || '删除失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '删除';
    }
  }

  const _origInit = init;
  function initWithCalendar() {
    init();

    document.getElementById('calendarBtn').addEventListener('click', showCalendarPage);
    document.getElementById('calendarBackBtn').addEventListener('click', hideCalendarPage);
    document.getElementById('eventCancelBtn').addEventListener('click', closeEventModal);
    document.getElementById('eventSaveBtn').addEventListener('click', saveEvent);
    document.getElementById('eventDeleteBtn').addEventListener('click', deleteEvent);
    document.getElementById('eventModal').addEventListener('click', (e) => {
      if (e.target.id === 'eventModal') closeEventModal();
    });

    const _origHideTicketPage = hideTicketPage;
    window.hideTicketPage = function () {
      document.getElementById('ticketPage').style.display = 'none';
      const calPage = document.getElementById('calendarPage');
      if (calPage && calPage.style.display === 'block') {
        calPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    initBadgePage();
    initForumPage();
  }

  let currentEvaluateCourseId = null;
  let currentEvaluateRating = 0;

  function showBadgePage() {
    hideAllPages();
    document.getElementById('badgePage').style.display = 'block';
    loadBadgeData();
    loadPointRecords();
    loadLeaderboard();
    loadEvaluations();
  }

  function hideBadgePage() {
    document.getElementById('badgePage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  function hideAllPages() {
    document.querySelector('main.student-main').style.display = 'none';
    document.getElementById('ticketPage').style.display = 'none';
    document.getElementById('ticketDetailPage').style.display = 'none';
    document.getElementById('calendarPage').style.display = 'none';
    document.getElementById('badgePage').style.display = 'none';
    document.getElementById('examPage').style.display = 'none';
    document.getElementById('gradePage').style.display = 'none';
    document.getElementById('forumListPage').style.display = 'none';
    document.getElementById('forumDetailPage').style.display = 'none';
    document.getElementById('trainingProgramPage').style.display = 'none';
    document.getElementById('notificationCenterPage').style.display = 'none';
    if (examCountdownTimer) {
      clearInterval(examCountdownTimer);
      examCountdownTimer = null;
    }
  }

  function showTrainingProgramPage() {
    hideAllPages();
    document.getElementById('trainingProgramPage').style.display = 'block';
    loadStudentTrainingProgram();
  }

  function hideTrainingProgramPage() {
    document.getElementById('trainingProgramPage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  async function loadStudentTrainingProgram() {
    const container = document.getElementById('trainingProgramContent');
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">加载中...</div>';
    try {
      const { data } = await api(`/api/training-programs/student/${user.id}`);
      if (data && data.ok && data.data) {
        renderTrainingProgram(data.data);
      } else {
        container.innerHTML = `<div style="text-align:center;padding:48px;">
          <div style="font-size:3rem;margin-bottom:16px;">📋</div>
          <div style="color:var(--text-secondary);font-size:1rem;">${(data && data.message) || '暂无培养方案数据'}</div>
        </div>`;
      }
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">网络错误</div>';
    }
  }

  function renderTrainingProgram(programData) {
    const { program, courses, progress } = programData;
    if (!program) {
      document.getElementById('trainingProgramContent').innerHTML = `
        <div style="text-align:center;padding:48px;">
          <div style="font-size:3rem;margin-bottom:16px;">📋</div>
          <div style="color:var(--text-secondary);font-size:1rem;">暂无培养方案数据</div>
        </div>`;
      return;
    }

    document.getElementById('trainingProgramTitle').textContent = `${program.name} - ${program.enrollmentYear}级 ${program.major}`;

    const categoryMap = {
      required: { label: '必修', color: '#ef4444', key: 'required' },
      limited_elective: { label: '限选', color: '#f59e0b', key: 'limitedElective' },
      elective: { label: '任选', color: '#10b981', key: 'elective' },
    };

    const groupedCourses = courses || { required: [], limited_elective: [], elective: [] };

    let html = '';

    ['required', 'limited_elective', 'elective'].forEach((cat) => {
      const info = categoryMap[cat];
      const list = groupedCourses[cat] || [];
      const requiredCredits = program[`${info.key}Credits`] || 0;
      const earnedKey = `earned${info.key.charAt(0).toUpperCase() + info.key.slice(1)}Credits`;
      const earnedCredits = (progress && progress[earnedKey] !== undefined ? progress[earnedKey] : 0);

      html += `
        <div class="tp-category-section">
          <div class="tp-category-header" style="border-color:${info.color}30;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="tp-category-badge" style="background:${info.color}20;color:${info.color};border-color:${info.color}40;">${info.label}</span>
              <span class="tp-category-title">${info.label}课程</span>
            </div>
            <span class="tp-category-credits" style="color:${info.color};">已修 ${earnedCredits} / 要求 ${requiredCredits} 学分</span>
          </div>
          <div class="tp-course-list">
            ${list.length ? list.map((pc) => {
              const status = pc.status || 'not_taken';
              let statusHtml = '';
              if (status === 'completed') {
                statusHtml = '<span class="tp-status tp-status-completed">✓ 已修过</span>';
              } else if (status === 'studying') {
                statusHtml = '<span class="tp-status tp-status-studying">📖 在修</span>';
              } else {
                statusHtml = '<span class="tp-status tp-status-not-taken">○ 未修</span>';
              }
              return `
                <div class="tp-course-item">
                  <div class="tp-course-info">
                    <div class="tp-course-code">${escapeHtml(pc.code || '')}</div>
                    <div class="tp-course-name">${escapeHtml(pc.name || '')}</div>
                    <div class="tp-course-meta">
                      <span>${pc.credit ?? 0} 学分</span>
                      ${pc.grade != null ? `<span style="color:var(--text-secondary);">成绩：${pc.grade}</span>` : ''}
                    </div>
                  </div>
                  ${statusHtml}
                </div>
              `;
            }).join('') : '<div style="text-align:center;color:var(--text-secondary);padding:24px;">暂无课程</div>'}
          </div>
        </div>
      `;
    });

    html += renderProgressBar(progress, program);

    const container = document.getElementById('trainingProgramContent');
    container.innerHTML = html;

    const style = document.createElement('style');
    style.id = 'trainingProgramStyle';
    if (!document.getElementById('trainingProgramStyle')) {
      style.textContent = `
        .tp-category-section{margin-bottom:24px;}
        .tp-category-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:var(--bg-glass);border-left:4px solid;border-radius:8px 8px 0 0;flex-wrap:wrap;gap:12px;}
        .tp-category-badge{display:inline-block;padding:4px 12px;border-radius:9999px;font-size:0.75rem;font-weight:600;border:1px solid;}
        .tp-category-title{font-size:1.0625rem;font-weight:600;color:var(--text-primary);}
        .tp-category-credits{font-size:0.875rem;font-weight:600;}
        .tp-course-list{background:var(--bg-glass);backdrop-filter:blur(12px);border:1px solid var(--bg-glass-border);border-top:none;border-radius:0 0 var(--radius) var(--radius);padding:4px;}
        .tp-course-item{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bg-glass-border);}
        .tp-course-item:last-child{border-bottom:none;}
        .tp-course-item:hover{background:rgba(255,255,255,0.02);}
        .tp-course-info{flex:1;}
        .tp-course-code{font-size:0.75rem;color:var(--text-secondary);margin-bottom:4px;}
        .tp-course-name{font-size:0.9375rem;font-weight:500;color:var(--text-primary);margin-bottom:4px;}
        .tp-course-meta{font-size:0.8125rem;color:var(--text-secondary);display:flex;gap:16px;}
        .tp-status{display:inline-block;padding:6px 14px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap;}
        .tp-status-completed{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.25);}
        .tp-status-studying{background:rgba(59,130,246,0.12);color:#3b82f6;border:1px solid rgba(59,130,246,0.25);}
        .tp-status-not-taken{background:rgba(107,114,128,0.12);color:#6b7280;border:1px solid rgba(107,114,128,0.25);}
        .tp-progress-section{margin-top:32px;padding:28px;background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08));border:1px solid rgba(99,102,241,0.25);border-radius:var(--radius);}
        .tp-progress-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;}
        .tp-progress-title{font-size:1.0625rem;font-weight:600;color:var(--text-primary);}
        .tp-progress-credits{font-size:1.25rem;font-weight:700;color:#6366f1;}
        .tp-progress-bar-wrap{width:100%;height:16px;background:rgba(255,255,255,0.06);border-radius:9999px;overflow:hidden;margin-bottom:12px;}
        .tp-progress-bar{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:9999px;transition:width 0.5s ease;}
        .tp-progress-info{display:flex;justify-content:space-between;align-items:center;font-size:0.875rem;flex-wrap:wrap;gap:8px;}
        .tp-progress-text{color:var(--text-secondary);}
        .tp-remaining{color:#f59e0b;font-weight:600;}
      `;
      document.head.appendChild(style);
    }
  }

  function renderProgressBar(progress, program) {
    const totalEarned = progress ? progress.earnedTotalCredits || 0 : 0;
    const totalRequired = program ? program.totalCreditsRequired || 0 : 0;
    const remaining = progress ? progress.remainingCredits || Math.max(0, totalRequired - totalEarned) : Math.max(0, totalRequired - totalEarned);
    const percent = progress && progress.progressPercent != null ? progress.progressPercent : (totalRequired > 0 ? Math.min(100, (totalEarned / totalRequired) * 100) : 0);

    return `
      <div class="tp-progress-section">
        <div class="tp-progress-header">
          <div class="tp-progress-title">🎓 毕业进度</div>
          <div class="tp-progress-credits">${totalEarned} / ${totalRequired} 学分</div>
        </div>
        <div class="tp-progress-bar-wrap">
          <div class="tp-progress-bar" style="width:${percent}%;"></div>
        </div>
        <div class="tp-progress-info">
          <span class="tp-progress-text">已完成 ${percent.toFixed(1)}%</span>
          <span class="tp-remaining">距离毕业还差 ${remaining} 学分</span>
        </div>
      </div>
    `;
  }

  let examCountdownTimer = null;
  let currentExams = [];

  const EXAM_TYPE_LABELS = { closed: '闭卷', open: '开卷', computer: '机试' };
  const EXAM_TYPE_COLORS = { closed: '#ef4444', open: '#10b981', computer: '#3b82f6' };

  function showExamPage() {
    hideAllPages();
    document.getElementById('examPage').style.display = 'block';
    loadStudentExamList();
  }

  function hideExamPage() {
    document.getElementById('examPage').style.display = 'none';
    if (examCountdownTimer) {
      clearInterval(examCountdownTimer);
      examCountdownTimer = null;
    }
    document.querySelector('main.student-main').style.display = 'block';
  }

  async function loadStudentExamList() {
    const container = document.getElementById('examList');
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">加载中...</div>';
    try {
      const { data } = await api(`/api/exams/student/${user.id}`);
      if (data && data.ok && Array.isArray(data.data)) {
        currentExams = data.data;
        renderExamList();
        startExamCountdown();
      } else {
        container.innerHTML = `<div style="text-align:center;color:var(--danger);padding:48px;">${(data && data.message) || '加载失败'}</div>`;
      }
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">网络错误</div>';
    }
  }

  function renderExamList() {
    const container = document.getElementById('examList');
    if (!currentExams.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">暂无考试安排</div>';
      return;
    }
    container.innerHTML =
      '<div class="exam-student-list">' +
      currentExams
        .map((exam, idx) => {
          const now = new Date();
          const examTime = new Date(exam.examTime);
          const endTime = new Date(examTime.getTime() + exam.duration * 60 * 1000);
          let status = 'upcoming';
          if (now >= examTime && now <= endTime) status = 'ongoing';
          else if (now > endTime) status = 'ended';
          const typeColor = EXAM_TYPE_COLORS[exam.examType] || '#6b7280';
          const canDownload = now >= examTime && !!exam.paperFile;
          const course = exam.course || {};
          return `
            <div class="exam-student-card status-${status}" data-idx="${idx}">
              <div class="exam-student-header">
                <div>
                  <div class="exam-student-course">${escapeHtml(course.name || '未知课程')}</div>
                  <div class="exam-student-code">${escapeHtml(course.code || '')}</div>
                </div>
                <div class="exam-student-type" style="background:${typeColor}15;color:${typeColor};border:1px solid ${typeColor}30;">
                  ${EXAM_TYPE_LABELS[exam.examType] || exam.examType}
                </div>
              </div>
              <div class="exam-student-info">
                <div class="exam-info-item">
                  <span class="exam-info-icon">🕒</span>
                  <span class="exam-info-label">考试时间</span>
                  <span class="exam-info-value">${formatDateTime(exam.examTime)}</span>
                </div>
                <div class="exam-info-item">
                  <span class="exam-info-icon">⏱️</span>
                  <span class="exam-info-label">考试时长</span>
                  <span class="exam-info-value">${exam.duration} 分钟</span>
                </div>
                <div class="exam-info-item">
                  <span class="exam-info-icon">📍</span>
                  <span class="exam-info-label">考试地点</span>
                  <span class="exam-info-value">${escapeHtml(exam.location) || '待定'}</span>
                </div>
              </div>
              ${
                status === 'upcoming'
                  ? `
                <div class="exam-countdown-wrap">
                  <div class="exam-countdown-title">⏰ 距开考还有</div>
                  <div class="exam-countdown" data-idx="${idx}">
                    <span class="cd-unit"><span class="cd-num cd-days">0</span><span class="cd-label">天</span></span>
                    <span class="cd-sep">:</span>
                    <span class="cd-unit"><span class="cd-num cd-hours">0</span><span class="cd-label">时</span></span>
                    <span class="cd-sep">:</span>
                    <span class="cd-unit"><span class="cd-num cd-mins">0</span><span class="cd-label">分</span></span>
                    <span class="cd-sep">:</span>
                    <span class="cd-unit"><span class="cd-num cd-secs">0</span><span class="cd-label">秒</span></span>
                  </div>
                </div>
                <div class="exam-student-actions">
                  <button type="button" class="btn btn-disabled" disabled title="考试开始后方可下载">
                    🔒 试卷未开放
                  </button>
                </div>`
                  : status === 'ongoing'
                  ? `
                <div class="exam-countdown-wrap" style="background:linear-gradient(135deg,#f59e0b15,#f9731615);border-color:#f59e0b40;">
                  <div class="exam-countdown-title" style="color:#f59e0b;">🔔 考试进行中</div>
                  <div class="exam-countdown" data-idx="${idx}">
                    <span class="cd-unit"><span class="cd-num cd-days" style="color:#f59e0b;">0</span><span class="cd-label">天</span></span>
                    <span class="cd-sep">:</span>
                    <span class="cd-unit"><span class="cd-num cd-hours" style="color:#f59e0b;">0</span><span class="cd-label">时</span></span>
                    <span class="cd-sep">:</span>
                    <span class="cd-unit"><span class="cd-num cd-mins" style="color:#f59e0b;">0</span><span class="cd-label">分</span></span>
                    <span class="cd-sep">:</span>
                    <span class="cd-unit"><span class="cd-num cd-secs" style="color:#f59e0b;">0</span><span class="cd-label">秒</span></span>
                  </div>
                </div>
                <div class="exam-student-actions">
                  ${
                    exam.paperFile
                      ? `<button type="button" class="btn btn-primary" onclick="window.__downloadPaper(${exam.id})">📄 下载试卷</button>`
                      : `<button type="button" class="btn btn-disabled" disabled>📄 教师未上传试卷</button>`
                  }
                </div>`
                  : `
                <div class="exam-countdown-wrap" style="background:linear-gradient(135deg,#6b728010,#4b556310);border-color:#6b728030;">
                  <div class="exam-countdown-title" style="color:#6b7280;">✅ 考试已结束</div>
                  <div style="color:var(--text-secondary);font-size:0.875rem;margin-top:8px;">请前往「我的成绩」查看成绩录入状态</div>
                </div>
                <div class="exam-student-actions">
                  <button type="button" class="btn btn-ghost" onclick="window.__showGradePage()">📊 查看成绩</button>
                </div>`
              }
            </div>`;
        })
        .join('') +
      '</div>';

    const style = document.createElement('style');
    style.id = 'examStudentStyle';
    if (!document.getElementById('examStudentStyle')) {
      style.textContent = `
        .exam-student-list{display:flex;flex-direction:column;gap:20px;}
        .exam-student-card{background:var(--bg-glass);backdrop-filter:blur(12px);border:1px solid var(--bg-glass-border);border-radius:var(--radius);padding:28px;transition:all .25s ease;}
        .exam-student-card.status-upcoming{background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08));border-color:rgba(99,102,241,0.25);}
        .exam-student-card.status-ongoing{background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(249,115,22,0.08));border-color:rgba(245,158,11,0.3);}
        .exam-student-card.status-ended{opacity:.85;}
        .exam-student-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:16px;flex-wrap:wrap;}
        .exam-student-course{font-size:1.25rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;}
        .exam-student-code{font-size:0.875rem;color:var(--text-secondary);}
        .exam-student-type{padding:6px 14px;border-radius:20px;font-size:0.8125rem;font-weight:600;white-space:nowrap;}
        .exam-student-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px;padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;}
        .exam-info-item{display:flex;align-items:center;gap:8px;font-size:0.875rem;}
        .exam-info-icon{font-size:1.1rem;}
        .exam-info-label{color:var(--text-secondary);min-width:60px;}
        .exam-info-value{color:var(--text-primary);font-weight:500;}
        .exam-countdown-wrap{padding:20px;border-radius:12px;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.25);text-align:center;margin-bottom:20px;}
        .exam-countdown-title{font-size:1rem;font-weight:600;color:#6366f1;margin-bottom:12px;}
        .exam-countdown{display:inline-flex;align-items:center;gap:8px;}
        .cd-unit{display:flex;flex-direction:column;align-items:center;min-width:56px;}
        .cd-num{font-size:2rem;font-weight:800;color:#6366f1;font-variant-numeric:tabular-nums;font-family:ui-monospace,Consolas,monospace;line-height:1;}
        .cd-label{font-size:0.75rem;color:var(--text-secondary);margin-top:4px;}
        .cd-sep{font-size:1.5rem;font-weight:700;color:#6366f150;padding-bottom:16px;}
        .exam-student-actions{display:flex;justify-content:flex-end;gap:12px;}
        .btn-disabled{opacity:.5;cursor:not-allowed;}
      `;
      document.head.appendChild(style);
    }
  }

  function startExamCountdown() {
    if (examCountdownTimer) clearInterval(examCountdownTimer);
    updateCountdowns();
    examCountdownTimer = setInterval(updateCountdowns, 1000);
  }

  function updateCountdowns() {
    const now = new Date();
    let needRerender = false;
    currentExams.forEach((exam, idx) => {
      const examTime = new Date(exam.examTime);
      const endTime = new Date(examTime.getTime() + exam.duration * 60 * 1000);
      const cdEl = document.querySelector(`.exam-countdown[data-idx="${idx}"]`);
      if (!cdEl) return;
      let target;
      if (now < examTime) {
        target = examTime;
      } else if (now >= examTime && now <= endTime) {
        target = endTime;
      } else {
        return;
      }
      const diff = target - now;
      if (diff <= 0) {
        needRerender = true;
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      const pad = (n) => String(n).padStart(2, '0');
      const dayEl = cdEl.querySelector('.cd-days');
      const hourEl = cdEl.querySelector('.cd-hours');
      const minEl = cdEl.querySelector('.cd-mins');
      const secEl = cdEl.querySelector('.cd-secs');
      if (dayEl) dayEl.textContent = days;
      if (hourEl) hourEl.textContent = pad(hours);
      if (minEl) minEl.textContent = pad(mins);
      if (secEl) secEl.textContent = pad(secs);
    });
    if (needRerender) {
      renderExamList();
    }
  }

  window.__downloadPaper = function (examId) {
    const a = document.createElement('a');
    a.href = `${API_BASE}/api/exams/${examId}/paper?studentId=${user.id}`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  window.__showGradePage = function () {
    showGradePage();
  };

  function showGradePage() {
    hideAllPages();
    document.getElementById('gradePage').style.display = 'block';
    loadStudentGrades();
  }

  function hideGradePage() {
    document.getElementById('gradePage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  async function loadStudentGrades() {
    const tbody = document.getElementById('gradeTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:48px;">加载中...</td></tr>';
    try {
      const { data } = await api(`/api/exams/student/${user.id}/grades`);
      if (data && data.ok && Array.isArray(data.data)) {
        const list = data.data;
        if (!list.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:48px;">暂无成绩数据</td></tr>';
          return;
        }
        tbody.innerHTML = list
          .map((item) => {
            const course = item.course || {};
            const exam = item.exam || null;
            const statusBadge =
              item.status === 'pending_grade'
                ? '<span class="status-badge status-pending" style="background:#f59e0b20;color:#f59e0b;border:1px solid #f59e0b30;">成绩待录入</span>'
                : item.status === 'graded'
                ? `<span class="status-badge status-success" style="background:#10b98120;color:#10b981;border:1px solid #10b98130;">已发布</span>`
                : '<span class="status-badge" style="background:#6b728020;color:#6b7280;border:1px solid #6b728030;">未考试</span>';
            const gradeText = item.grade != null ? `<span style="font-weight:700;font-size:1.1rem;color:var(--text-primary);">${item.grade}</span>` : '<span style="color:var(--text-secondary);">-</span>';
            return `
              <tr>
                <td>${escapeHtml(course.code || '')}</td>
                <td>${escapeHtml(course.name || '')}</td>
                <td>${course.credit ?? 0}</td>
                <td>${exam ? formatDateTime(exam.examTime) : '<span style="color:var(--text-secondary);">暂无安排</span>'}</td>
                <td>${gradeText}</td>
                <td>${statusBadge}</td>
              </tr>`;
          })
          .join('');

        const style = document.createElement('style');
        style.id = 'gradeStyle';
        if (!document.getElementById('gradeStyle')) {
          style.textContent = `
            .status-badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:0.8125rem;font-weight:600;}
          `;
          document.head.appendChild(style);
        }
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:48px;">${(data && data.message) || '加载失败'}</td></tr>`;
      }
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:48px;">网络错误</td></tr>';
    }
  }

  async function loadBadgeData() {
    const { data } = await api(`/api/badges/${user.id}/badges`);
    if (data && data.ok && data.data) {
      const { badges, totalPoints } = data.data;
      document.getElementById('currentPoints').textContent = totalPoints;
      document.getElementById('earnedCount').textContent = badges.filter((b) => b.earned).length;
      document.getElementById('totalCount').textContent = badges.length;
      renderBadgeGrid(badges);
    } else {
      document.getElementById('badgeGrid').innerHTML =
        '<div style="text-align:center;color:var(--danger);padding:48px;">加载失败</div>';
    }
  }

  function renderBadgeGrid(badges) {
    const container = document.getElementById('badgeGrid');
    if (!badges.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">暂无勋章</div>';
      return;
    }
    container.innerHTML = badges
      .map((b) => {
        const colorVar = `--badge-color:${b.color};`;
        const earnedClass = b.earned ? 'earned' : '';
        const earnedTime = b.earnedAt ? formatDateTime(b.earnedAt) : '';
        return `
          <div class="badge-card ${earnedClass}" data-id="${b.id}" style="${colorVar}">
            <div class="badge-tooltip">
              <div class="badge-tooltip-title">${escapeHtml(b.name)}</div>
              <div class="badge-tooltip-desc">${escapeHtml(b.description)}</div>
              <div class="badge-tooltip-status ${b.earned ? 'earned' : 'locked'}">
                ${b.earned ? '✓ 已获得 · ' + earnedTime : '🔒 未获得'}
              </div>
            </div>
            <div class="badge-card-inner">
              <div class="badge-card-front">
                <div class="badge-icon">${b.icon}</div>
                <div class="badge-name">${escapeHtml(b.name)}</div>
              </div>
              <div class="badge-card-back">
                <div class="badge-back-icon">${b.icon}</div>
                <div class="badge-back-name">${escapeHtml(b.name)}</div>
                <div class="badge-back-desc">${escapeHtml(b.description)}</div>
                <div class="badge-back-points">+${b.points} 积分</div>
                ${b.earned ? `<div class="badge-back-earned">获得于 ${earnedTime}</div>` : ''}
              </div>
            </div>
          </div>`;
      })
      .join('');

    container.querySelectorAll('.badge-card').forEach((card) => {
      card.addEventListener('click', () => {
        card.classList.toggle('flipped');
      });
    });
  }

  const ACTION_ICONS = {
    enroll: '📚',
    signin: '✅',
    evaluate: '⭐',
    lottery_won: '🎰',
    badge_award: '🏅',
  };

  const ACTION_LABELS = {
    enroll: '选课',
    signin: '签到',
    evaluate: '评教',
    lottery_won: '中签',
    badge_award: '获得勋章',
  };

  let pointRecordsPage = 0;
  const POINT_RECORDS_PAGE_SIZE = 10;
  let hasMorePointRecords = false;

  async function loadPointRecords(append) {
    const container = document.getElementById('pointRecords');
    const moreBtn = document.getElementById('pointRecordsMore');
    if (!append) {
      pointRecordsPage = 0;
    }
    const { data } = await api(`/api/badges/${user.id}/points`);
    if (data && data.ok && data.data) {
      const { totalPoints, records } = data.data;
      document.getElementById('currentPoints').textContent = totalPoints;
      if (!records || !records.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:32px;">暂无积分记录</div>';
        if (moreBtn) moreBtn.style.display = 'none';
        return;
      }
      const start = append ? container.querySelectorAll('.point-record-item').length : 0;
      const pageRecords = records.slice(start, start + POINT_RECORDS_PAGE_SIZE);
      hasMorePointRecords = records.length > start + POINT_RECORDS_PAGE_SIZE;

      const html = pageRecords.map((r) => {
        const isPositive = r.points > 0;
        const icon = ACTION_ICONS[r.action] || '💰';
        const actionLabel = ACTION_LABELS[r.action] || r.action;
        const timeStr = formatDateTime(r.createdAt);
        return `
          <div class="point-record-item">
            <div class="point-record-icon ${isPositive ? 'positive' : 'negative'}">${icon}</div>
            <div class="point-record-info">
              <div class="point-record-action">${escapeHtml(actionLabel)}</div>
              <div class="point-record-detail">${escapeHtml(r.actionDetail || '')}</div>
            </div>
            <div class="point-record-value ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${r.points}</div>
            <div class="point-record-time">${timeStr}</div>
          </div>`;
      }).join('');

      if (append) {
        container.insertAdjacentHTML('beforeend', html);
      } else {
        container.innerHTML = html;
      }

      if (moreBtn) {
        moreBtn.style.display = hasMorePointRecords ? 'inline-flex' : 'none';
      }
    } else {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:32px;">加载失败</div>';
      if (moreBtn) moreBtn.style.display = 'none';
    }
  }

  async function loadLeaderboard() {
    const { data } = await api('/api/badges/leaderboard?limit=10');
    const container = document.getElementById('leaderboard');
    if (data && data.ok && Array.isArray(data.data)) {
      const list = data.data;
      if (!list.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:32px;">暂无排行数据</div>';
        return;
      }
      container.innerHTML = list
        .map((item) => {
          const isMe = item.studentId === user.id;
          return `
            <div class="leaderboard-item" style="${isMe ? 'background:rgba(99,102,241,0.08);' : ''}">
              <div class="leaderboard-rank rank-${item.rank}">${item.rank}</div>
              <div class="leaderboard-info">
                <div class="leaderboard-name">${escapeHtml(item.studentName)}${isMe ? ' (我)' : ''}</div>
                <div class="leaderboard-no">${escapeHtml(item.studentNo)}</div>
              </div>
              <div class="leaderboard-points">${item.totalPoints} 💎</div>
            </div>`;
        })
        .join('');
    } else {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:32px;">加载失败</div>';
    }
  }

  async function loadEvaluations() {
    const { data } = await api(`/api/badges/${user.id}/courses-to-evaluate`);
    const container = document.getElementById('evaluationSection');
    if (data && data.ok && Array.isArray(data.data)) {
      const list = data.data;
      if (!list.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:32px;">暂无课程可评教</div>';
        return;
      }
      container.innerHTML =
        '<div class="evaluation-list">' +
        list
          .map((c) => `
            <div class="evaluation-card">
              <div class="evaluation-course-code">${escapeHtml(c.code)}</div>
              <div class="evaluation-course-name">${escapeHtml(c.name)}</div>
              <div class="evaluation-status ${c.evaluated ? 'done' : 'pending'}">
                ${c.evaluated ? '✓ 已完成评教' : '⏳ 待评教'}
              </div>
              ${c.evaluated
                ? ''
                : `<button type="button" class="btn btn-primary btn-sm" data-id="${c.id}" style="height:36px;padding:0 20px;font-size:0.8125rem;width:100%;">
                    去评教
                   </button>`}
            </div>`)
          .join('') +
        '</div>';

      container.querySelectorAll('.btn[data-id]').forEach((btn) => {
        btn.addEventListener('click', () => openEvaluateModal(parseInt(btn.dataset.id, 10)));
      });
    } else {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:32px;">加载失败</div>';
    }
  }

  function openEvaluateModal(courseId) {
    currentEvaluateCourseId = courseId;
    currentEvaluateRating = 0;
    document.querySelectorAll('#ratingStars .rating-star').forEach((s) => s.classList.remove('active'));
    document.getElementById('evaluateComment').value = '';
    document.getElementById('evaluateModal').classList.add('show');
  }

  function closeEvaluateModal() {
    document.getElementById('evaluateModal').classList.remove('show');
    currentEvaluateCourseId = null;
    currentEvaluateRating = 0;
  }

  async function submitEvaluation() {
    if (currentEvaluateRating < 1 || currentEvaluateRating > 5) {
      showToast('请选择评分', 'error');
      return;
    }
    const comment = document.getElementById('evaluateComment').value.trim();
    const btn = document.getElementById('submitEvaluateBtn');
    btn.disabled = true;
    btn.textContent = '提交中...';
    try {
      const { data } = await api(`/api/badges/${user.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({
          courseId: currentEvaluateCourseId,
          rating: currentEvaluateRating,
          comment,
        }),
      });
      if (data && data.ok) {
        showToast('评教成功，积分已增加', 'success');
        closeEvaluateModal();
        loadBadgeData();
        loadPointRecords();
        loadLeaderboard();
        loadEvaluations();
      } else {
        showToast((data && data.message) || '评教失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '提交评教';
    }
  }

  // ========== 讨论区 ==========
  let forumPage = 1;
  let forumPageSize = 10;
  let forumSort = 'active';
  let forumCourseId = '';
  let forumKeyword = '';
  let currentForumPostId = null;
  let forumCourses = [];

  function showForumListPage() {
    hideAllPages();
    document.getElementById('forumListPage').style.display = 'block';
    loadForumCourses();
    loadForumPostList();
  }

  function hideForumListPage() {
    document.getElementById('forumListPage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  function showForumDetailPage(postId) {
    currentForumPostId = postId;
    hideAllPages();
    document.getElementById('forumDetailPage').style.display = 'block';
    loadForumPostDetail(postId);
    loadForumComments(postId);
  }

  function hideForumDetailPage() {
    document.getElementById('forumDetailPage').style.display = 'none';
    document.getElementById('forumListPage').style.display = 'block';
    currentForumPostId = null;
  }

  async function loadForumCourses() {
    const filter = document.getElementById('forumCourseFilter');
    const select = document.getElementById('postCourse');
    if (!filter || !select) return;
    try {
      const { data } = await api('/api/courses');
      if (data && data.ok && Array.isArray(data.data)) {
        forumCourses = data.data;
        const options = '<option value="">全部课程</option>' +
          data.data.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`).join('');
        filter.innerHTML = options;
        const postOptions = '<option value="">不归属任何课程</option>' +
          data.data.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`).join('');
        select.innerHTML = postOptions;
        if (forumCourseId) {
          filter.value = forumCourseId;
        }
      }
    } catch (e) {}
  }

  async function loadForumPostList() {
    const container = document.getElementById('forumPostList');
    const params = new URLSearchParams({
      page: forumPage,
      pageSize: forumPageSize,
      sort: forumSort,
    });
    if (forumCourseId) params.append('courseId', forumCourseId);
    if (forumKeyword) params.append('keyword', forumKeyword);

    try {
      const { data } = await api('/api/forum/posts?' + params.toString());
      if (data && data.ok && data.data) {
        const { list, total, totalPages } = data.data;
        if (!list.length) {
          container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">暂无帖子，快来发布第一篇吧！</div>';
        } else {
          container.innerHTML = list.map((p) => {
            const course = p.course || null;
            const isMine = p.authorId === user.id && p.authorRole === 'student';
            return `
              <div class="forum-post-card" data-id="${p.id}">
                <div class="forum-post-card-header">
                  <div class="forum-post-meta-left">
                    ${p.isPinned ? '<span class="forum-tag forum-tag-pin">📌 置顶</span>' : ''}
                    ${course ? `<span class="forum-tag forum-tag-course">📘 ${escapeHtml(course.name)}</span>` : ''}
                    <span class="forum-post-author">${escapeHtml(p.authorName)}</span>
                    <span class="forum-post-time">${formatDateTime(p.createdAt)}</span>
                  </div>
                  <div class="forum-post-stats">
                    <span>👁 ${p.viewCount ?? 0}</span>
                    <span>👍 ${p.likeCount ?? 0}</span>
                    <span>💬 ${p.commentCount ?? 0}</span>
                    ${isMine ? `<button type="button" class="btn btn-danger btn-sm forum-delete-btn" data-id="${p.id}" style="height:28px;padding:0 12px;font-size:0.75rem;">删除</button>` : ''}
                  </div>
                </div>
                <div class="forum-post-card-title">${escapeHtml(p.title)}</div>
              </div>`;
          }).join('');

          container.querySelectorAll('.forum-post-card[data-id]').forEach((card) => {
            card.addEventListener('click', (e) => {
              if (e.target.classList.contains('forum-delete-btn')) return;
              showForumDetailPage(parseInt(card.dataset.id, 10));
            });
          });

          container.querySelectorAll('.forum-delete-btn').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const ok = await showConfirm('确定删除该帖子？');
              if (!ok) return;
              const id = parseInt(btn.dataset.id, 10);
              try {
                const r = await api('/api/forum/posts/' + id, {
                  method: 'DELETE',
                  body: JSON.stringify({ userId: user.id, userRole: 'student' }),
                });
                if (r.data && r.data.ok) {
                  showToast('删除成功', 'success');
                  loadForumPostList();
                } else {
                  showToast((r.data && r.data.message) || '删除失败', 'error');
                }
              } catch (_) {
                showToast('网络错误', 'error');
              }
            });
          });
        }
        renderForumPagination(total, totalPages);
      } else {
        container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">加载失败</div>';
      }
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">网络错误</div>';
    }
  }

  function renderForumPagination(total, totalPages) {
    const container = document.getElementById('forumPagination');
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${forumPage === 1 ? 'disabled' : ''} data-page="prev">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === forumPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" ${forumPage === totalPages ? 'disabled' : ''} data-page="next">下一页</button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'prev' && forumPage > 1) {
          forumPage--;
        } else if (page === 'next' && forumPage < totalPages) {
          forumPage++;
        } else if (page !== 'prev' && page !== 'next') {
          forumPage = parseInt(page, 10);
        }
        loadForumPostList();
      });
    });
  }

  async function loadForumPostDetail(postId) {
    const container = document.getElementById('forumPostDetail');
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;">加载中...</div>';
    try {
      const { data } = await api('/api/forum/posts/' + postId);
      if (data && data.ok && data.data) {
        const post = data.data;
        const course = post.course || null;
        document.getElementById('forumDetailTitle').textContent = post.title;
        const isMine = post.authorId === user.id && post.authorRole === 'student';

        const likeStatus = await api(`/api/forum/posts/${postId}/like-status?userId=${user.id}&userRole=student`);
        const liked = likeStatus.data && likeStatus.data.ok && likeStatus.data.data ? likeStatus.data.data.liked : false;
        const likeCount = likeStatus.data && likeStatus.data.ok && likeStatus.data.data ? likeStatus.data.data.likeCount : post.likeCount;

        container.innerHTML = `
          <div class="forum-detail-header">
            <div class="forum-detail-tags">
              ${post.isPinned ? '<span class="forum-tag forum-tag-pin">📌 置顶</span>' : ''}
              ${course ? `<span class="forum-tag forum-tag-course">📘 ${escapeHtml(course.name)}</span>` : ''}
            </div>
            <h2 class="forum-detail-title">${escapeHtml(post.title)}</h2>
            <div class="forum-detail-meta">
              <span>作者：${escapeHtml(post.authorName)}</span>
              <span>发布时间：${formatDateTime(post.createdAt)}</span>
              <span>👁 ${post.viewCount ?? 0} 浏览</span>
              <span>💬 ${post.commentCount ?? 0} 评论</span>
            </div>
          </div>
          <div class="forum-detail-content">${post.content}</div>
          <div class="forum-detail-actions">
            <button type="button" class="btn ${liked ? 'btn-primary' : 'btn-ghost'} forum-like-btn" data-id="${post.id}">
              ${liked ? '❤️ 已点赞' : '🤍 点赞'} <span class="forum-like-count">${likeCount}</span>
            </button>
            ${isMine ? `<button type="button" class="btn btn-danger forum-delete-post-btn" data-id="${post.id}">删除帖子</button>` : ''}
          </div>
        `;

        const likeBtn = container.querySelector('.forum-like-btn');
        if (likeBtn) {
          likeBtn.addEventListener('click', async () => {
            try {
              const r = await api('/api/forum/posts/' + postId + '/like', {
                method: 'POST',
                body: JSON.stringify({ userId: user.id, userRole: 'student' }),
              });
              if (r.data && r.data.ok && r.data.data) {
                const { liked: newLiked, likeCount: newCount } = r.data.data;
                likeBtn.innerHTML = `${newLiked ? '❤️ 已点赞' : '🤍 点赞'} <span class="forum-like-count">${newCount}</span>`;
                likeBtn.classList.toggle('btn-primary', newLiked);
                likeBtn.classList.toggle('btn-ghost', !newLiked);
              }
            } catch (_) {
              showToast('网络错误', 'error');
            }
          });
        }

        const deleteBtn = container.querySelector('.forum-delete-post-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async () => {
            const ok = await showConfirm('确定删除该帖子？');
            if (!ok) return;
            try {
              const r = await api('/api/forum/posts/' + postId, {
                method: 'DELETE',
                body: JSON.stringify({ userId: user.id, userRole: 'student' }),
              });
              if (r.data && r.data.ok) {
                showToast('删除成功', 'success');
                hideForumDetailPage();
                loadForumPostList();
              } else {
                showToast((r.data && r.data.message) || '删除失败', 'error');
              }
            } catch (_) {
              showToast('网络错误', 'error');
            }
          });
        }
      } else {
        container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">加载失败或帖子已被删除</div>';
      }
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">网络错误</div>';
    }
  }

  async function loadForumComments(postId) {
    const container = document.getElementById('forumCommentList');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:24px;">加载中...</div>';
    try {
      const { data } = await api('/api/forum/posts/' + postId + '/comments');
      if (data && data.ok && Array.isArray(data.data)) {
        const comments = data.data;
        if (!comments.length) {
          container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:24px;">暂无评论，快来抢沙发吧！</div>';
          return;
        }
        container.innerHTML = renderCommentTree(comments, postId, null);
        bindCommentEvents(container, postId);
      } else {
        container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:24px;">加载失败</div>';
      }
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:24px;">网络错误</div>';
    }
  }

  function renderCommentTree(comments, postId, parentId) {
    return comments.map((c) => {
      const isMine = c.authorId === user.id && c.authorRole === 'student';
      const replyTo = c.replyToName ? `<span class="forum-reply-to">@${escapeHtml(c.replyToName)}</span>` : '';
      return `
        <div class="forum-comment-item" data-id="${c.id}" data-parent="${parentId || ''}">
          <div class="forum-comment-header">
            <span class="forum-comment-author">${escapeHtml(c.authorName)}</span>
            <span class="forum-comment-time">${formatDateTime(c.createdAt)}</span>
            <div class="forum-comment-actions">
              <button type="button" class="forum-reply-btn" data-id="${c.id}" data-name="${escapeHtml(c.authorName)}">回复</button>
              ${isMine ? `<button type="button" class="forum-comment-delete-btn" data-id="${c.id}">删除</button>` : ''}
            </div>
          </div>
          <div class="forum-comment-content">${replyTo} ${escapeHtml(c.content).replace(/\n/g, '<br>')}</div>
          ${c.replies && c.replies.length ? `<div class="forum-comment-replies">${renderCommentTree(c.replies, postId, c.id)}</div>` : ''}
          <div class="forum-reply-form" style="display:none;margin-top:12px;">
            <textarea class="forum-reply-input" placeholder="回复 ${escapeHtml(c.authorName)}..." rows="2"></textarea>
            <div style="text-align:right;margin-top:8px;">
              <button type="button" class="btn btn-ghost btn-sm forum-cancel-reply" style="height:32px;padding:0 16px;font-size:0.8125rem;margin-right:8px;">取消</button>
              <button type="button" class="btn btn-primary btn-sm forum-submit-reply" data-parent="${c.id}" data-reply-to="${c.id}" data-name="${escapeHtml(c.authorName)}" style="height:32px;padding:0 16px;font-size:0.8125rem;">发送</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function bindCommentEvents(container, postId) {
    container.querySelectorAll('.forum-reply-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.forum-comment-item');
        const form = item.querySelector('.forum-reply-form');
        container.querySelectorAll('.forum-reply-form').forEach((f) => {
          if (f !== form) f.style.display = 'none';
        });
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        if (form.style.display === 'block') {
          form.querySelector('.forum-reply-input').focus();
        }
      });
    });

    container.querySelectorAll('.forum-cancel-reply').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('.forum-reply-form').style.display = 'none';
      });
    });

    container.querySelectorAll('.forum-submit-reply').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const form = btn.closest('.forum-reply-form');
        const textarea = form.querySelector('.forum-reply-input');
        const content = textarea.value.trim();
        if (!content) {
          showToast('请输入回复内容', 'error');
          return;
        }
        const parentId = parseInt(btn.dataset.parent, 10);
        const replyToId = parseInt(btn.dataset.replyTo, 10);
        const replyToName = btn.dataset.name;
        btn.disabled = true;
        btn.textContent = '发送中...';
        try {
          const r = await api('/api/forum/posts/' + postId + '/comments', {
            method: 'POST',
            body: JSON.stringify({
              content,
              authorId: user.id,
              authorRole: 'student',
              authorName: user.name,
              parentId,
              replyToId,
              replyToName,
            }),
          });
          if (r.data && r.data.ok) {
            showToast('回复成功', 'success');
            loadForumComments(postId);
          } else {
            showToast((r.data && r.data.message) || '回复失败', 'error');
          }
        } catch (_) {
          showToast('网络错误', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = '发送';
        }
      });
    });

    container.querySelectorAll('.forum-comment-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await showConfirm('确定删除该评论？');
        if (!ok) return;
        const id = parseInt(btn.dataset.id, 10);
        try {
          const r = await api('/api/forum/comments/' + id, {
            method: 'DELETE',
            body: JSON.stringify({ userId: user.id, userRole: 'student' }),
          });
          if (r.data && r.data.ok) {
            showToast('删除成功', 'success');
            loadForumComments(postId);
          } else {
            showToast((r.data && r.data.message) || '删除失败', 'error');
          }
        } catch (_) {
          showToast('网络错误', 'error');
        }
      });
    });
  }

  function openNewPostModal() {
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('postCourse').value = '';
    document.getElementById('newPostModal').classList.add('show');
  }

  function closeNewPostModal() {
    document.getElementById('newPostModal').classList.remove('show');
  }

  async function submitPost() {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const courseId = document.getElementById('postCourse').value;

    if (!title) {
      showToast('请输入标题', 'error');
      return;
    }
    if (!content) {
      showToast('请输入正文', 'error');
      return;
    }

    const btn = document.getElementById('submitPostBtn');
    btn.disabled = true;
    btn.textContent = '发布中...';

    try {
      const { data } = await api('/api/forum/posts', {
        method: 'POST',
        body: JSON.stringify({
          title,
          content,
          authorId: user.id,
          authorRole: 'student',
          authorName: user.name,
          courseId: courseId ? parseInt(courseId, 10) : null,
        }),
      });

      if (data && data.ok) {
        showToast('发布成功', 'success');
        closeNewPostModal();
        forumPage = 1;
        loadForumPostList();
      } else {
        showToast((data && data.message) || '发布失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '发布';
    }
  }

  async function submitForumComment() {
    const content = document.getElementById('forumCommentInput').value.trim();
    if (!content) {
      showToast('请输入评论内容', 'error');
      return;
    }
    if (!currentForumPostId) return;

    const btn = document.getElementById('submitForumCommentBtn');
    btn.disabled = true;
    btn.textContent = '发表中...';

    try {
      const { data } = await api('/api/forum/posts/' + currentForumPostId + '/comments', {
        method: 'POST',
        body: JSON.stringify({
          content,
          authorId: user.id,
          authorRole: 'student',
          authorName: user.name,
        }),
      });

      if (data && data.ok) {
        showToast('评论成功', 'success');
        document.getElementById('forumCommentInput').value = '';
        loadForumComments(currentForumPostId);
        loadForumPostDetail(currentForumPostId);
      } else {
        showToast((data && data.message) || '评论失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '发表评论';
    }
  }

  function initForumPage() {
    const origHideTicketPage = hideTicketPage;
    hideTicketPage = function () {
      document.getElementById('ticketPage').style.display = 'none';
      document.getElementById('ticketDetailPage').style.display = 'none';
      const calPage = document.getElementById('calendarPage');
      const badgePage = document.getElementById('badgePage');
      const examPage = document.getElementById('examPage');
      const gradePage = document.getElementById('gradePage');
      const forumListPage = document.getElementById('forumListPage');
      const forumDetailPage = document.getElementById('forumDetailPage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (calPage && calPage.style.display === 'block') {
        calPage.style.display = 'block';
      } else if (badgePage && badgePage.style.display === 'block') {
        badgePage.style.display = 'block';
      } else if (examPage && examPage.style.display === 'block') {
        examPage.style.display = 'block';
      } else if (gradePage && gradePage.style.display === 'block') {
        gradePage.style.display = 'block';
      } else if (forumListPage && forumListPage.style.display === 'block') {
        forumListPage.style.display = 'block';
      } else if (forumDetailPage && forumDetailPage.style.display === 'block') {
        forumDetailPage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const origHideBadgePage = hideBadgePage;
    hideBadgePage = function () {
      document.getElementById('badgePage').style.display = 'none';
      const forumListPage = document.getElementById('forumListPage');
      const forumDetailPage = document.getElementById('forumDetailPage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (forumListPage && forumListPage.style.display === 'block') {
        forumListPage.style.display = 'block';
      } else if (forumDetailPage && forumDetailPage.style.display === 'block') {
        forumDetailPage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const origHideCalendarPage = hideCalendarPage;
    hideCalendarPage = function () {
      document.getElementById('calendarPage').style.display = 'none';
      const badgePage = document.getElementById('badgePage');
      const examPage = document.getElementById('examPage');
      const gradePage = document.getElementById('gradePage');
      const forumListPage = document.getElementById('forumListPage');
      const forumDetailPage = document.getElementById('forumDetailPage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (badgePage && badgePage.style.display === 'block') {
        badgePage.style.display = 'block';
      } else if (examPage && examPage.style.display === 'block') {
        examPage.style.display = 'block';
      } else if (gradePage && gradePage.style.display === 'block') {
        gradePage.style.display = 'block';
      } else if (forumListPage && forumListPage.style.display === 'block') {
        forumListPage.style.display = 'block';
      } else if (forumDetailPage && forumDetailPage.style.display === 'block') {
        forumDetailPage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const origHideExamPage = hideExamPage;
    hideExamPage = function () {
      document.getElementById('examPage').style.display = 'none';
      if (examCountdownTimer) {
        clearInterval(examCountdownTimer);
        examCountdownTimer = null;
      }
      const forumListPage = document.getElementById('forumListPage');
      const forumDetailPage = document.getElementById('forumDetailPage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (forumListPage && forumListPage.style.display === 'block') {
        forumListPage.style.display = 'block';
      } else if (forumDetailPage && forumDetailPage.style.display === 'block') {
        forumDetailPage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const origHideGradePage = hideGradePage;
    hideGradePage = function () {
      document.getElementById('gradePage').style.display = 'none';
      const forumListPage = document.getElementById('forumListPage');
      const forumDetailPage = document.getElementById('forumDetailPage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (forumListPage && forumListPage.style.display === 'block') {
        forumListPage.style.display = 'block';
      } else if (forumDetailPage && forumDetailPage.style.display === 'block') {
        forumDetailPage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const origHideTrainingProgramPage = hideTrainingProgramPage;
    hideTrainingProgramPage = function () {
      document.getElementById('trainingProgramPage').style.display = 'none';
      const forumListPage = document.getElementById('forumListPage');
      const forumDetailPage = document.getElementById('forumDetailPage');
      if (forumListPage && forumListPage.style.display === 'block') {
        forumListPage.style.display = 'block';
      } else if (forumDetailPage && forumDetailPage.style.display === 'block') {
        forumDetailPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    document.getElementById('forumBtn').addEventListener('click', showForumListPage);
    document.getElementById('forumBackBtn').addEventListener('click', hideForumListPage);
    document.getElementById('forumDetailBackBtn').addEventListener('click', hideForumDetailPage);
    document.getElementById('newPostBtn').addEventListener('click', openNewPostModal);
    document.getElementById('cancelPostBtn').addEventListener('click', closeNewPostModal);
    document.getElementById('submitPostBtn').addEventListener('click', submitPost);
    document.getElementById('submitForumCommentBtn').addEventListener('click', submitForumComment);
    document.getElementById('newPostModal').addEventListener('click', (e) => {
      if (e.target.id === 'newPostModal') closeNewPostModal();
    });

    document.getElementById('forumCourseFilter').addEventListener('change', (e) => {
      forumCourseId = e.target.value;
      forumPage = 1;
      loadForumPostList();
    });

    const kwInput = document.getElementById('forumKeyword');
    if (kwInput) {
      let searchTimer = null;
      kwInput.addEventListener('input', () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          forumKeyword = kwInput.value.trim();
          forumPage = 1;
          loadForumPostList();
        }, 300);
      });
      kwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          forumKeyword = kwInput.value.trim();
          forumPage = 1;
          loadForumPostList();
        }
      });
    }

    document.querySelectorAll('.forum-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.forum-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        forumSort = btn.dataset.sort || 'active';
        forumPage = 1;
        loadForumPostList();
      });
    });

    const forumStyle = document.createElement('style');
    forumStyle.textContent = `
      .forum-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .forum-toolbar-left {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        flex: 1;
      }
      .forum-tabs {
        display: flex;
        gap: 8px;
      }
      .forum-post-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .forum-post-card {
        background: var(--bg-glass);
        backdrop-filter: blur(12px);
        border: 1px solid var(--bg-glass-border);
        border-radius: var(--radius);
        padding: 20px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .forum-post-card:hover {
        border-color: var(--accent-start);
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15);
      }
      .forum-post-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        gap: 12px;
        flex-wrap: wrap;
      }
      .forum-post-meta-left {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      .forum-post-stats {
        display: flex;
        gap: 16px;
        align-items: center;
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }
      .forum-post-author {
        color: var(--text-primary);
        font-weight: 600;
        font-size: 0.875rem;
      }
      .forum-post-time {
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }
      .forum-post-card-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.5;
      }
      .forum-tag {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
      }
      .forum-tag-pin {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .forum-tag-course {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .forum-detail-header {
        padding-bottom: 20px;
        border-bottom: 1px solid var(--bg-glass-border);
        margin-bottom: 20px;
      }
      .forum-detail-tags {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .forum-detail-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 12px 0;
      }
      .forum-detail-meta {
        display: flex;
        gap: 20px;
        color: var(--text-secondary);
        font-size: 0.875rem;
        flex-wrap: wrap;
      }
      .forum-detail-content {
        color: var(--text-primary);
        line-height: 1.8;
        font-size: 0.9375rem;
        padding: 8px 0;
        word-break: break-word;
      }
      .forum-detail-content img {
        max-width: 100%;
        border-radius: 8px;
      }
      .forum-detail-actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid var(--bg-glass-border);
      }
      .forum-like-count {
        margin-left: 4px;
      }
      .forum-post-detail {
        background: var(--bg-glass);
        backdrop-filter: blur(12px);
        border: 1px solid var(--bg-glass-border);
        border-radius: var(--radius);
        padding: 24px;
      }
      .forum-comment-title {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 16px;
      }
      .forum-comment-input {
        background: var(--bg-glass);
        backdrop-filter: blur(12px);
        border: 1px solid var(--bg-glass-border);
        border-radius: var(--radius);
        padding: 16px;
        margin-bottom: 20px;
      }
      .forum-comment-input textarea {
        width: 100%;
        padding: 12px 16px;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--bg-glass-border);
        border-radius: 12px;
        color: var(--text-primary);
        font-size: 0.9375rem;
        resize: vertical;
        min-height: 80px;
        margin-bottom: 12px;
        font-family: inherit;
      }
      .forum-comment-input textarea:focus {
        outline: none;
        border-color: var(--accent-start);
      }
      .forum-comment-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .forum-comment-item {
        background: var(--bg-glass);
        backdrop-filter: blur(12px);
        border: 1px solid var(--bg-glass-border);
        border-radius: var(--radius);
        padding: 16px 20px;
      }
      .forum-comment-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }
      .forum-comment-author {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.875rem;
      }
      .forum-comment-time {
        color: var(--text-secondary);
        font-size: 0.8125rem;
      }
      .forum-comment-actions {
        margin-left: auto;
        display: flex;
        gap: 12px;
      }
      .forum-comment-actions button {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.8125rem;
        padding: 0;
        transition: color 0.2s;
      }
      .forum-comment-actions button:hover {
        color: var(--accent-start);
      }
      .forum-comment-content {
        color: var(--text-primary);
        line-height: 1.6;
        font-size: 0.9375rem;
        word-break: break-word;
      }
      .forum-reply-to {
        color: var(--accent-start);
        font-weight: 500;
      }
      .forum-comment-replies {
        margin-top: 12px;
        margin-left: 24px;
        padding-left: 16px;
        border-left: 2px solid var(--bg-glass-border);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .forum-comment-replies .forum-comment-item {
        padding: 12px 16px;
      }
      .forum-reply-input {
        width: 100%;
        padding: 10px 14px;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--bg-glass-border);
        border-radius: 10px;
        color: var(--text-primary);
        font-size: 0.875rem;
        resize: vertical;
        min-height: 60px;
        font-family: inherit;
      }
      .forum-reply-input:focus {
        outline: none;
        border-color: var(--accent-start);
      }
    `;
    document.head.appendChild(forumStyle);
  }

  function initBadgePage() {
    const _origShowTicketPage = showTicketPage;
    showTicketPage = function () {
      hideAllPages();
      document.getElementById('ticketPage').style.display = 'block';
      loadTicketList();
    };

    const _origHideTicketPage = hideTicketPage;
    hideTicketPage = function () {
      document.getElementById('ticketPage').style.display = 'none';
      document.getElementById('ticketDetailPage').style.display = 'none';
      const calPage = document.getElementById('calendarPage');
      const badgePage = document.getElementById('badgePage');
      const examPage = document.getElementById('examPage');
      const gradePage = document.getElementById('gradePage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (calPage && calPage.style.display === 'block') {
        calPage.style.display = 'block';
      } else if (badgePage && badgePage.style.display === 'block') {
        badgePage.style.display = 'block';
      } else if (examPage && examPage.style.display === 'block') {
        examPage.style.display = 'block';
      } else if (gradePage && gradePage.style.display === 'block') {
        gradePage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const _origShowCalendarPage = showCalendarPage;
    showCalendarPage = function () {
      hideAllPages();
      const calPage = document.getElementById('calendarPage');
      calPage.style.display = 'block';
      if (!calendarInstance) {
        calendarInstance = new Calendar('#calendarContainer', {
          view: 'month',
          currentDate: new Date(),
          events: [],
          canCreateCustom: true,
          onCellClick: onCalendarCellClick,
          onEventClick: onCalendarEventClick,
          onDateChange: () => loadCalendarEvents(),
          onViewChange: () => loadCalendarEvents(),
        });
      } else {
        calendarInstance.setDate(new Date());
      }
      loadCalendarEvents();
    };

    const _origHideCalendarPage = hideCalendarPage;
    hideCalendarPage = function () {
      document.getElementById('calendarPage').style.display = 'none';
      const badgePage = document.getElementById('badgePage');
      const examPage = document.getElementById('examPage');
      const gradePage = document.getElementById('gradePage');
      const trainingProgramPage = document.getElementById('trainingProgramPage');
      if (badgePage && badgePage.style.display === 'block') {
        badgePage.style.display = 'block';
      } else if (examPage && examPage.style.display === 'block') {
        examPage.style.display = 'block';
      } else if (gradePage && gradePage.style.display === 'block') {
        gradePage.style.display = 'block';
      } else if (trainingProgramPage && trainingProgramPage.style.display === 'block') {
        trainingProgramPage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    document.getElementById('badgeBtn').addEventListener('click', showBadgePage);
    document.getElementById('badgeBackBtn').addEventListener('click', hideBadgePage);
    document.getElementById('examBtn').addEventListener('click', showExamPage);
    document.getElementById('examBackBtn').addEventListener('click', hideExamPage);
    document.getElementById('gradeBtn').addEventListener('click', showGradePage);
    document.getElementById('gradeBackBtn').addEventListener('click', hideGradePage);
    document.getElementById('trainingProgramBtn').addEventListener('click', showTrainingProgramPage);
    document.getElementById('trainingProgramBackBtn').addEventListener('click', hideTrainingProgramPage);
    document.getElementById('loadMorePointsBtn').addEventListener('click', () => loadPointRecords(true));
    document.getElementById('cancelEvaluateBtn').addEventListener('click', closeEvaluateModal);
    document.getElementById('submitEvaluateBtn').addEventListener('click', submitEvaluation);
    document.getElementById('evaluateModal').addEventListener('click', (e) => {
      if (e.target.id === 'evaluateModal') closeEvaluateModal();
    });

    document.querySelectorAll('#ratingStars .rating-star').forEach((star) => {
      const value = parseInt(star.dataset.value, 10);
      star.addEventListener('click', () => {
        currentEvaluateRating = value;
        document.querySelectorAll('#ratingStars .rating-star').forEach((s) => {
          s.classList.toggle('active', parseInt(s.dataset.value, 10) <= value);
        });
      });
      star.addEventListener('mouseenter', () => {
        document.querySelectorAll('#ratingStars .rating-star').forEach((s) => {
          s.classList.toggle('active', parseInt(s.dataset.value, 10) <= value);
        });
      });
    });

    document.getElementById('ratingStars').addEventListener('mouseleave', () => {
      document.querySelectorAll('#ratingStars .rating-star').forEach((s) => {
        s.classList.toggle('active', parseInt(s.dataset.value, 10) <= currentEvaluateRating);
      });
    });

    window.hideTicketPage = hideTicketPage;
  }

  initWithCalendar();
})();
