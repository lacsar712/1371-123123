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
      if (notificationTimer) clearInterval(notificationTimer);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_BASE + '/api/auth/logout', '');
      } else {
        fetch(API_BASE + '/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    });

    document.getElementById('startBtn').addEventListener('click', startAttendance);
    document.getElementById('endBtn').addEventListener('click', endAttendance);

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

    loadCourses().then(() => {
      checkActiveSessions();
    });

    checkNotifications();
    notificationTimer = setInterval(checkNotifications, 30000);
  }

  let currentTicketPage = 1;
  let currentTicketStatus = '';
  let currentTicketId = null;
  let notificationTimer = null;
  let lastNotificationId = 0;

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
    const { data } = await api('/api/tickets/' + ticketId);
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
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">加载失败</div>';
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
          submitterRole: 'teacher',
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
          replyerRole: 'teacher',
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
    const params = new URLSearchParams({
      userId: user.id,
      userRole: 'teacher',
    });
    const { data } = await api('/api/notifications/unread-count?' + params.toString());
    if (data && data.ok && data.data) {
      const { unreadCount, latest } = data.data;
      const badge = document.getElementById('ticketBadge');
      if (badge) {
        badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
      }

      if (latest && latest.length) {
        latest.forEach((n) => {
          if (n.id > lastNotificationId) {
            showFloatingNotification(n);
          }
        });
        const maxId = Math.max(...latest.map((n) => n.id));
        if (maxId > lastNotificationId) {
          lastNotificationId = maxId;
        }
      }
    }
  }

  function showFloatingNotification(notification) {
    const el = document.createElement('div');
    el.className = 'floating-notification';
    el.innerHTML = `
      <div class="floating-notification-title">${escapeHtml(notification.title)}</div>
      <div class="floating-notification-content">${escapeHtml(notification.content || '')}</div>
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
      if (notification.ticketId) {
        showTicketPage();
        showTicketDetailPage(notification.ticketId);
      }
    });

    markNotificationRead(notification.id);
  }

  async function markNotificationRead(id) {
    try {
      await api('/api/notifications/' + id + '/read', { method: 'PUT' });
    } catch (e) {}
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

  const style = document.createElement('style');
  style.textContent = `
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
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s, visibility 0.25s;
    }
    .modal-overlay.show {
      opacity: 1;
      visibility: visible;
    }
    .modal {
      background: var(--bg-card);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 32px;
      width: 90%;
      max-width: 500px;
      transform: translateY(20px);
      transition: transform 0.25s;
    }
    .modal-overlay.show .modal {
      transform: translateY(0);
    }
    .modal h2 {
      margin: 0 0 24px 0;
      font-size: 1.25rem;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    .form-group input,
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--bg-glass-border);
      border-radius: 12px;
      color: var(--text-primary);
      font-size: 0.9375rem;
      font-family: inherit;
    }
    .form-group input:focus,
    .form-group textarea:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--accent-start);
    }
    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 24px;
    }
  `;
  document.head.appendChild(style);

  let calendarInstance = null;

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
        canCreateCustom: false,
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

  function onCalendarEventClick(event) {
    const modal = document.getElementById('eventModal');
    document.getElementById('eventModalTitle').textContent = event.title || '事件详情';
    const infoRow = document.getElementById('eventInfoRow');
    infoRow.style.display = 'block';
    const s = CalendarUtils.parseISODate(event.startTime);
    const e = CalendarUtils.parseISODate(event.endTime);
    const timeStr = s && e ? `${CalendarUtils.fmtDate(s)} ${CalendarUtils.formatTimeHM(s)} - ${CalendarUtils.formatTimeHM(e)}` : '';
    const cat = event.category || 'custom';
    let extraInfo = '';
    if (event.courseCode) {
      extraInfo += `<span style="margin-left:8px;color:var(--text-secondary);font-size:0.8125rem;">课程代码：${escapeHtml(event.courseCode)}</span>`;
    }
    if (event.location) {
      extraInfo += `<span style="margin-left:8px;color:var(--text-secondary);font-size:0.8125rem;">📍 ${escapeHtml(event.location)}</span>`;
    }
    infoRow.innerHTML = `
      <div class="event-info-row" style="margin-bottom:0;">
        <span class="event-info-label cat-${cat}">${CalendarUtils.categoryLabel(cat)}</span>
        <span class="event-info-time">${timeStr}</span>
        ${extraInfo}
      </div>
    `;
    const titleGroup = document.getElementById('eventTitleGroup');
    const timeGroup = document.getElementById('eventTimeGroup');
    const colorGroup = document.getElementById('eventColorGroup');
    const titleInput = document.getElementById('eventTitle');
    const startInput = document.getElementById('eventStart');
    const endInput = document.getElementById('eventEnd');
    titleGroup.style.display = '';
    timeGroup.style.display = '';
    colorGroup.style.display = 'none';
    titleInput.value = event.title || '';
    titleInput.readOnly = true;
    titleInput.style.background = 'rgba(255,255,255,0.02)';
    titleInput.style.color = 'var(--text-secondary)';
    if (s) startInput.value = CalendarUtils.fmtDateTime(s);
    if (e) endInput.value = CalendarUtils.fmtDateTime(e);
    startInput.readOnly = true;
    endInput.readOnly = true;
    startInput.style.background = 'rgba(255,255,255,0.02)';
    endInput.style.background = 'rgba(255,255,255,0.02)';
    startInput.style.color = 'var(--text-secondary)';
    endInput.style.color = 'var(--text-secondary)';
    document.getElementById('eventCancelBtn').textContent = '关闭';
    modal.classList.add('show');
  }

  function closeEventModal() {
    const modal = document.getElementById('eventModal');
    modal.classList.remove('show');
    const titleInput = document.getElementById('eventTitle');
    const startInput = document.getElementById('eventStart');
    const endInput = document.getElementById('eventEnd');
    if (titleInput) {
      titleInput.readOnly = false;
      titleInput.style.background = '';
      titleInput.style.color = '';
    }
    if (startInput) {
      startInput.readOnly = false;
      startInput.style.background = '';
      startInput.style.color = '';
    }
    if (endInput) {
      endInput.readOnly = false;
      endInput.style.background = '';
      endInput.style.color = '';
    }
  }

  let editingExamId = null;
  let uploadExamId = null;

  function apiUpload(path, formData) {
    return fetch(API_BASE + path, {
      method: 'POST',
      body: formData,
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })));
  }

  function fmtDateTimeLocal(d) {
    if (!d) return '';
    const date = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function examTypeLabel(t) {
    return { closed: '闭卷', open: '开卷', computer: '机试' }[t] || t;
  }

  function examTypeColorClass(t) {
    return { closed: 'exam-type-closed', open: 'exam-type-open', computer: 'exam-type-computer' }[t] || '';
  }

  function showExamPage() {
    hideAllTeacherPages();
    document.getElementById('examPage').style.display = 'block';
    loadExamList();
  }

  function hideExamPage() {
    document.getElementById('examPage').style.display = 'none';
    document.querySelector('main.student-main').style.display = 'block';
  }

  function hideAllTeacherPages() {
    document.querySelector('main.student-main').style.display = 'none';
    document.getElementById('ticketPage').style.display = 'none';
    document.getElementById('ticketDetailPage').style.display = 'none';
    document.getElementById('calendarPage') && (document.getElementById('calendarPage').style.display = 'none');
    document.getElementById('examPage').style.display = 'none';
  }

  async function loadExamList() {
    const container = document.getElementById('examList');
    const { data } = await api(`/api/exams/teacher/${user.id}`);
    if (data && data.ok && Array.isArray(data.data)) {
      const exams = data.data;
      if (!exams.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:48px;"><div style="font-size:3rem;margin-bottom:16px;opacity:0.5;">📝</div>暂无考试安排，点击右上角「新增考试」创建</div>';
        return;
      }
      container.innerHTML = exams.map((e) => {
        const examTime = new Date(e.examTime);
        const endTime = new Date(examTime.getTime() + e.duration * 60 * 1000);
        const now = new Date();
        let statusBadge = '';
        if (now < examTime) {
          statusBadge = '<span class="exam-status exam-status-pending">未开始</span>';
        } else if (now >= examTime && now < endTime) {
          statusBadge = '<span class="exam-status exam-status-ongoing">进行中</span>';
        } else {
          statusBadge = '<span class="exam-status exam-status-ended">已结束</span>';
        }
        const paperHtml = e.hasPaper
          ? `<span class="exam-paper exam-paper-exists">📎 ${escapeHtml(e.paperFileName || '试卷已上传')}</span>`
          : `<span class="exam-paper exam-paper-none">📎 暂未上传试卷</span>`;
        return `
          <div class="exam-card" data-id="${e.id}">
            <div class="exam-card-header">
              <div>
                <span class="exam-course-name">${escapeHtml(e.course?.name || '')}</span>
                <span class="exam-course-code">${escapeHtml(e.course?.code || '')}</span>
              </div>
              ${statusBadge}
            </div>
            <div class="exam-card-body">
              <div class="exam-info-row">
                <div class="exam-info-item">
                  <span class="exam-info-label">⏰ 考试时间</span>
                  <span class="exam-info-value">${formatDateTime(e.examTime)}</span>
                </div>
                <div class="exam-info-item">
                  <span class="exam-info-label">⏱ 时长</span>
                  <span class="exam-info-value">${e.duration} 分钟</span>
                </div>
                <div class="exam-info-item">
                  <span class="exam-info-label">📍 地点</span>
                  <span class="exam-info-value">${escapeHtml(e.location)}</span>
                </div>
                <div class="exam-info-item">
                  <span class="exam-info-label">📋 类型</span>
                  <span class="exam-type-tag ${examTypeColorClass(e.examType)}">${examTypeLabel(e.examType)}</span>
                </div>
                <div class="exam-info-item" style="flex-basis:100%;margin-top:4px;">
                  ${paperHtml}
                </div>
              </div>
            </div>
            <div class="exam-card-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${e.id}">编辑</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="upload" data-id="${e.id}">${e.hasPaper ? '重新上传试卷' : '上传试卷'}</button>
              <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${e.id}">删除</button>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('.exam-card [data-action="edit"]').forEach((btn) => {
        btn.addEventListener('click', () => openExamModal(parseInt(btn.dataset.id, 10)));
      });
      container.querySelectorAll('.exam-card [data-action="upload"]').forEach((btn) => {
        btn.addEventListener('click', () => openUploadModal(parseInt(btn.dataset.id, 10)));
      });
      container.querySelectorAll('.exam-card [data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', () => deleteExam(parseInt(btn.dataset.id, 10)));
      });
    } else {
      container.innerHTML = '<div style="text-align:center;color:var(--danger);padding:48px;">加载失败</div>';
    }
  }

  function openExamModal(id) {
    editingExamId = id || null;
    const modal = document.getElementById('examModal');
    const titleEl = document.getElementById('examModalTitle');
    const courseSel = document.getElementById('examCourseId');
    courseSel.innerHTML = '<option value="">请选择课程</option>' +
      courses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.code)})</option>`).join('');

    if (id) {
      titleEl.textContent = '编辑考试';
      loadExamDetail(id);
    } else {
      titleEl.textContent = '新增考试';
      document.getElementById('examTime').value = '';
      document.getElementById('examDuration').value = 120;
      document.getElementById('examLocation').value = '';
      document.getElementById('examType').value = 'closed';
    }
    modal.classList.add('show');
  }

  function closeExamModal() {
    editingExamId = null;
    document.getElementById('examModal').classList.remove('show');
  }

  async function loadExamDetail(id) {
    const { data } = await api(`/api/exams/${id}`);
    if (data && data.ok && data.data) {
      const e = data.data;
      document.getElementById('examCourseId').value = e.courseId;
      document.getElementById('examTime').value = fmtDateTimeLocal(e.examTime);
      document.getElementById('examDuration').value = e.duration;
      document.getElementById('examLocation').value = e.location;
      document.getElementById('examType').value = e.examType;
    }
  }

  async function saveExam() {
    const courseId = parseInt(document.getElementById('examCourseId').value, 10);
    const examTime = document.getElementById('examTime').value;
    const duration = parseInt(document.getElementById('examDuration').value, 10);
    const location = document.getElementById('examLocation').value.trim();
    const examType = document.getElementById('examType').value;

    if (!courseId) { showToast('请选择课程', 'error'); return; }
    if (!examTime) { showToast('请选择考试时间', 'error'); return; }
    if (!duration || duration < 1) { showToast('时长必须为正整数', 'error'); return; }
    if (!location) { showToast('请填写考试地点', 'error'); return; }

    const btn = document.getElementById('examSaveBtn');
    btn.disabled = true;
    btn.textContent = '保存中...';

    const payload = { courseId, teacherId: user.id, examTime, duration, location, examType };
    try {
      let resp;
      if (editingExamId) {
        resp = await api(`/api/exams/${editingExamId}`, {
          method: 'PUT',
          body: JSON.stringify({ teacherId: user.id, examTime, duration, location, examType }),
        });
      } else {
        resp = await api('/api/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      const { data } = resp;
      if (data && data.ok) {
        showToast(editingExamId ? '已更新' : '已创建', 'success');
        closeExamModal();
        loadExamList();
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

  async function deleteExam(id) {
    const ok = await showConfirm('确定删除该考试安排吗？此操作不可恢复。', '删除确认');
    if (!ok) return;
    try {
      const { data } = await api(`/api/exams/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ teacherId: user.id }),
      });
      if (data && data.ok) {
        showToast('已删除', 'success');
        loadExamList();
      } else {
        showToast((data && data.message) || '删除失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    }
  }

  function openUploadModal(examId) {
    uploadExamId = examId;
    const modal = document.getElementById('uploadModal');
    document.getElementById('paperFile').value = '';
    const uploadedInfo = document.getElementById('uploadedInfo');
    uploadedInfo.style.display = 'none';
    document.getElementById('uploadedFileName').textContent = '';

    const container = document.getElementById('examList');
    const card = container.querySelector(`.exam-card[data-id="${examId}"]`);
    let infoText = '';
    if (card) {
      infoText = card.querySelector('.exam-course-name').textContent + ' · ' + card.querySelector('.exam-course-code').textContent;
    }
    document.getElementById('uploadExamInfo').textContent = infoText;

    modal.classList.add('show');
  }

  function closeUploadModal() {
    uploadExamId = null;
    document.getElementById('uploadModal').classList.remove('show');
  }

  async function uploadPaper() {
    if (!uploadExamId) return;
    const fileInput = document.getElementById('paperFile');
    const file = fileInput.files[0];
    if (!file) { showToast('请选择文件', 'error'); return; }

    const formData = new FormData();
    formData.append('paper', file);
    formData.append('teacherId', user.id);

    const btn = document.getElementById('uploadSubmitBtn');
    btn.disabled = true;
    btn.textContent = '上传中...';

    try {
      const { data } = await apiUpload(`/api/exams/${uploadExamId}/upload`, formData);
      if (data && data.ok) {
        showToast('上传成功', 'success');
        document.getElementById('uploadedFileName').textContent = data.data.paperFileName || file.name;
        document.getElementById('uploadedInfo').style.display = 'block';
        closeUploadModal();
        loadExamList();
      } else {
        showToast((data && data.message) || '上传失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '上传';
    }
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
      const onOverlayClick = (e) => { if (e.target === overlay) done(false); };
      const onCancel = () => done(false);
      const onOk = () => done(true);
      overlay.addEventListener('click', onOverlayClick);
      document.getElementById('confirmCancel').addEventListener('click', onCancel);
      document.getElementById('confirmOk').addEventListener('click', onOk);
    });
  }

  const _origTeacherInit = init;
  function teacherInitWithCalendar() {
    init();

    document.getElementById('calendarBtn').addEventListener('click', showCalendarPage);
    document.getElementById('calendarBackBtn').addEventListener('click', hideCalendarPage);
    document.getElementById('eventCancelBtn').addEventListener('click', closeEventModal);
    document.getElementById('eventModal').addEventListener('click', (e) => {
      if (e.target.id === 'eventModal') closeEventModal();
    });

    const _origHideTicketPage = hideTicketPage;
    window.hideTicketPage = function () {
      document.getElementById('ticketPage').style.display = 'none';
      const calPage = document.getElementById('calendarPage');
      if (calPage && calPage.style.display === 'block') {
        calPage.style.display = 'block';
      } else if (document.getElementById('examPage').style.display === 'block') {
        document.getElementById('examPage').style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    const examBtn = document.getElementById('examBtn');
    examBtn && examBtn.addEventListener('click', showExamPage);
    const examBackBtn = document.getElementById('examBackBtn');
    examBackBtn && examBackBtn.addEventListener('click', hideExamPage);
    const newExamBtn = document.getElementById('newExamBtn');
    newExamBtn && newExamBtn.addEventListener('click', () => openExamModal(null));
    const examCancelBtn = document.getElementById('examCancelBtn');
    examCancelBtn && examCancelBtn.addEventListener('click', closeExamModal);
    const examSaveBtn = document.getElementById('examSaveBtn');
    examSaveBtn && examSaveBtn.addEventListener('click', saveExam);
    const examModal = document.getElementById('examModal');
    examModal && examModal.addEventListener('click', (e) => {
      if (e.target.id === 'examModal') closeExamModal();
    });
    const uploadCancelBtn = document.getElementById('uploadCancelBtn');
    uploadCancelBtn && uploadCancelBtn.addEventListener('click', closeUploadModal);
    const uploadSubmitBtn = document.getElementById('uploadSubmitBtn');
    uploadSubmitBtn && uploadSubmitBtn.addEventListener('click', uploadPaper);
    const uploadModal = document.getElementById('uploadModal');
    uploadModal && uploadModal.addEventListener('click', (e) => {
      if (e.target.id === 'uploadModal') closeUploadModal();
    });
  }

  const confirmStyle = document.createElement('style');
  confirmStyle.textContent = `
    .exam-card {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 20px 24px;
      margin-bottom: 16px;
      transition: all 0.2s;
    }
    .exam-card:hover {
      border-color: var(--accent-start);
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.12);
    }
    .exam-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      gap: 12px;
    }
    .exam-course-name {
      font-size: 1.125rem;
      font-weight: 700;
      color: var(--text-primary);
      margin-right: 8px;
    }
    .exam-course-code {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    .exam-status {
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .exam-status-pending { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .exam-status-ongoing { background: rgba(249, 115, 22, 0.15); color: #fb923c; }
    .exam-status-ended { background: rgba(161, 161, 170, 0.15); color: #a1a1aa; }
    .exam-card-body { margin-bottom: 16px; }
    .exam-info-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px 32px;
    }
    .exam-info-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .exam-info-label {
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }
    .exam-info-value {
      font-size: 0.9375rem;
      color: var(--text-primary);
      font-weight: 500;
    }
    .exam-type-tag {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 6px;
      font-size: 0.8125rem;
      font-weight: 600;
      width: fit-content;
    }
    .exam-type-closed { background: rgba(239, 68, 68, 0.12); color: #f87171; }
    .exam-type-open { background: rgba(34, 197, 94, 0.12); color: #4ade80; }
    .exam-type-computer { background: rgba(59, 130, 246, 0.12); color: #60a5fa; }
    .exam-paper {
      font-size: 0.875rem;
    }
    .exam-paper-exists { color: #4ade80; }
    .exam-paper-none { color: var(--text-secondary); }
    .exam-card-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      border-top: 1px solid var(--bg-glass-border);
      padding-top: 16px;
    }
    .btn-sm {
      height: 36px;
      padding: 0 16px;
      font-size: 0.875rem;
    }
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s, visibility 0.25s;
    }
    .modal-overlay.show {
      opacity: 1;
      visibility: visible;
    }
    .modal {
      background: var(--bg-card);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 32px;
      width: 90%;
      max-width: 500px;
      transform: translateY(20px);
      transition: transform 0.25s;
    }
    .modal-overlay.show .modal {
      transform: translateY(0);
    }
    .modal h2 {
      margin: 0 0 24px 0;
      font-size: 1.25rem;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    .form-group input,
    .form-group select {
      width: 100%;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--bg-glass-border);
      border-radius: 12px;
      color: var(--text-primary);
      font-size: 0.9375rem;
      font-family: inherit;
    }
    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--accent-start);
    }
    .modal-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 24px;
    }
    .confirm-modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s, visibility 0.25s;
    }
    .confirm-modal.show {
      opacity: 1;
      visibility: visible;
    }
    .modal-confirm {
      max-width: 420px;
    }
    .confirm-title {
      color: var(--text-primary);
    }
    .confirm-message {
      color: var(--text-secondary);
      line-height: 1.6;
      padding: 0 32px 16px;
      margin: 0;
    }
    .confirm-actions {
      padding: 0 32px 32px;
      margin: 0;
    }
    input[type="file"] {
      cursor: pointer;
    }
    input[type="file"]::-webkit-file-upload-button {
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent-start);
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 600;
      margin-right: 12px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(confirmStyle);

  if (!document.getElementById('confirmOverlay')) {
    const confirmHtml = `
      <div id="confirmOverlay" class="modal-overlay confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmMessage">
        <div class="modal modal-confirm">
          <h2 id="confirmTitle" class="confirm-title">确认</h2>
          <p id="confirmMessage" class="confirm-message"></p>
          <div class="modal-actions confirm-actions">
            <button type="button" class="btn btn-ghost" id="confirmCancel">取消</button>
            <button type="button" class="btn btn-danger" id="confirmOk">确定</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', confirmHtml);
  }

  teacherInitWithCalendar();
})();
