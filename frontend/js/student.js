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
    const params = new URLSearchParams({
      userId: user.id,
      userRole: 'student',
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

    checkNotifications();
    notificationTimer = setInterval(checkNotifications, 30000);
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
  const EVENT_COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#ef4444', '#ec4899', '#f97316'];

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
      if (calPage && calPage.style.display === 'block') {
        calPage.style.display = 'block';
      } else if (badgePage && badgePage.style.display === 'block') {
        badgePage.style.display = 'block';
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
      if (badgePage && badgePage.style.display === 'block') {
        badgePage.style.display = 'block';
      } else {
        document.querySelector('main.student-main').style.display = 'block';
      }
    };

    document.getElementById('badgeBtn').addEventListener('click', showBadgePage);
    document.getElementById('badgeBackBtn').addEventListener('click', hideBadgePage);
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
