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
    document.getElementById('page-tickets').style.display = page === 'tickets' ? 'block' : 'none';
    document.getElementById('page-ticket-detail').style.display = page === 'ticket-detail' ? 'block' : 'none';

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
    } else if (page === 'tickets' || page === 'ticket-detail') {
      headerTitle.textContent = '工单中心';
      headerSubtitle.textContent = '处理学生与教师提交的问题反馈';
    }

    if (page === 'lottery') {
      loadLotteryCourses();
    }
    if (page === 'attendance') {
      loadAttendanceList();
    }
    if (page === 'tickets') {
      loadTickets();
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

  let ticketPage = 1;
  let ticketPageSize = 10;
  let currentTicketId = null;
  let selectedTicketIds = new Set();
  let notificationTimer = null;
  let lastNotificationId = 0;

  async function loadTickets() {
    const tbody = document.getElementById('ticketTableBody');
    const statusFilter = document.getElementById('ticketStatusFilter')?.value || '';
    const categoryFilter = document.getElementById('ticketCategoryFilter')?.value || '';

    const params = new URLSearchParams({
      page: ticketPage,
      pageSize: ticketPageSize,
    });
    if (statusFilter) params.append('status', statusFilter);
    if (categoryFilter) params.append('category', categoryFilter);

    const { data } = await api('/api/tickets?' + params.toString());
    if (!data || !data.ok || !data.data) {
      tbody.innerHTML =
        '<tr><td colspan="10" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }

    const { list, total, totalPages } = data.data;
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="10" style="text-align:center;color:var(--text-secondary);">暂无工单</td></tr>';
    } else {
      tbody.innerHTML = list
        .map(
          (t) => `
        <tr>
          <td><input type="checkbox" class="ticket-checkbox" data-id="${t.id}" ${selectedTicketIds.has(t.id) ? 'checked' : ''} /></td>
          <td>${t.id}</td>
          <td>${escapeHtml(t.title)}</td>
          <td><span class="badge badge-cat-${t.category}">${escapeHtml(t.categoryText || t.category)}</span></td>
          <td><span class="badge badge-status-${t.status}">${escapeHtml(t.statusText || t.status)}</span></td>
          <td>${escapeHtml(t.submitterName)} <span style="color:var(--text-secondary);font-size:0.8125rem;">(${t.submitterRole})</span></td>
          <td>${t.handlerName ? escapeHtml(t.handlerName) : '<span style="color:var(--text-secondary);">未分配</span>'}</td>
          <td style="color:var(--text-secondary);font-size:0.875rem;">${formatDateTime(t.createdAt)}</td>
          <td style="color:var(--text-secondary);font-size:0.875rem;">${formatDateTime(t.lastReplyAt)}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm view-ticket-btn" data-id="${t.id}">查看详情</button>
          </td>
        </tr>`
        )
        .join('');

      tbody.querySelectorAll('.view-ticket-btn').forEach((btn) => {
        btn.addEventListener('click', () => viewTicketDetail(parseInt(btn.dataset.id, 10)));
      });

      tbody.querySelectorAll('.ticket-checkbox').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          const id = parseInt(e.target.dataset.id, 10);
          if (e.target.checked) {
            selectedTicketIds.add(id);
          } else {
            selectedTicketIds.delete(id);
          }
          updateBatchAssignBtn();
        });
      });
    }

    renderTicketPagination(total, totalPages);
    updateBatchAssignBtn();
    document.getElementById('selectAllTickets').checked = false;
  }

  function updateBatchAssignBtn() {
    const btn = document.getElementById('batchAssignBtn');
    if (btn) {
      btn.disabled = selectedTicketIds.size === 0;
    }
  }

  function renderTicketPagination(total, totalPages) {
    const container = document.getElementById('ticketPagination');
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${ticketPage === 1 ? 'disabled' : ''} data-page="prev">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === ticketPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" ${ticketPage === totalPages ? 'disabled' : ''} data-page="next">下一页</button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'prev' && ticketPage > 1) {
          ticketPage--;
        } else if (page === 'next' && ticketPage < totalPages) {
          ticketPage++;
        } else if (page !== 'prev' && page !== 'next') {
          ticketPage = parseInt(page, 10);
        }
        loadTickets();
      });
    });
  }

  async function viewTicketDetail(ticketId) {
    currentTicketId = ticketId;
    const { data } = await api('/api/tickets/' + ticketId);
    if (!data || !data.ok || !data.data) {
      showToast('加载失败', 'error');
      return;
    }

    const ticket = data.data;
    document.getElementById('ticketDetailTitle').textContent = ticket.title;
    document.getElementById('ticketStatusChange').value = ticket.status;

    let html = `
      <div class="ticket-detail-admin">
        <div class="ticket-detail-header-admin">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <span class="badge badge-cat-${ticket.category}">${escapeHtml(ticket.categoryText || ticket.category)}</span>
            <span class="badge badge-status-${ticket.status}">${escapeHtml(ticket.statusText || ticket.status)}</span>
          </div>
          <div class="ticket-detail-meta-admin">
            <span>提交人：${escapeHtml(ticket.submitterName)} (${ticket.submitterRole})</span>
            <span>提交时间：${formatDateTime(ticket.createdAt)}</span>
            ${ticket.handlerName ? `<span>处理人：${escapeHtml(ticket.handlerName)}</span>` : ''}
            <span>最后回复：${formatDateTime(ticket.lastReplyAt)}</span>
          </div>
        </div>
        <div class="ticket-detail-body-admin">
          <div class="ticket-description-admin">
            <h4>问题描述</h4>
            <p>${escapeHtml(ticket.description).replace(/\n/g, '<br>')}</p>
          </div>
    `;

    if (ticket.replies && ticket.replies.length) {
      html += '<div class="ticket-replies-admin"><h4>回复记录</h4>';
      ticket.replies.forEach((reply) => {
        const isAdmin = reply.replyerRole === 'admin';
        html += `
          <div class="ticket-reply-admin ${isAdmin ? 'reply-admin' : 'reply-user'}">
            <div class="reply-header-admin">
              <span class="replyer-name-admin">${escapeHtml(reply.replyerName)} ${isAdmin ? '(管理员)' : '(' + reply.replyerRole + ')'}</span>
              <span class="reply-time-admin">${formatDateTime(reply.createdAt)}</span>
            </div>
            <div class="reply-content-admin">${escapeHtml(reply.content).replace(/\n/g, '<br>')}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    html += '</div></div>';
    document.getElementById('ticketDetailContent').innerHTML = html;

    showPage('ticket-detail');
  }

  async function submitAdminReply() {
    const content = document.getElementById('adminReplyContent').value.trim();
    if (!content) {
      showToast('请输入回复内容', 'error');
      return;
    }
    if (!currentTicketId) return;

    const btn = document.getElementById('adminSubmitReplyBtn');
    btn.disabled = true;
    btn.textContent = '发送中...';

    try {
      const { data } = await api(`/api/tickets/${currentTicketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          replyerId: user.id,
          replyerRole: 'admin',
          replyerName: user.username,
        }),
      });

      if (data && data.ok) {
        showToast('回复成功', 'success');
        document.getElementById('adminReplyContent').value = '';
        viewTicketDetail(currentTicketId);
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

  async function changeTicketStatus() {
    const status = document.getElementById('ticketStatusChange').value;
    if (!currentTicketId || !status) return;

    try {
      const { data } = await api(`/api/tickets/${currentTicketId}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status,
          operatorId: user.id,
          operatorName: user.username,
        }),
      });

      if (data && data.ok) {
        showToast('状态已更新', 'success');
        viewTicketDetail(currentTicketId);
      } else {
        showToast((data && data.message) || '更新失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    }
  }

  async function batchAssign() {
    if (selectedTicketIds.size === 0) return;

    const handlerName = prompt('请输入处理人姓名：', user.username);
    if (!handlerName || !handlerName.trim()) return;

    try {
      const { data } = await api('/api/tickets/batch-assign', {
        method: 'POST',
        body: JSON.stringify({
          ticketIds: Array.from(selectedTicketIds),
          handlerId: user.id,
          handlerName: handlerName.trim(),
        }),
      });

      if (data && data.ok) {
        showToast(data.message || '分配成功', 'success');
        selectedTicketIds.clear();
        loadTickets();
      } else {
        showToast((data && data.message) || '分配失败', 'error');
      }
    } catch (e) {
      showToast('网络错误', 'error');
    }
  }

  async function checkNotifications() {
    if (!user) return;
    const params = new URLSearchParams({
      userId: user.id,
      userRole: 'admin',
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
    el.className = 'floating-notification-admin';
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
        showPage('tickets');
        viewTicketDetail(notification.ticketId);
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

    const ticketStatusFilter = document.getElementById('ticketStatusFilter');
    if (ticketStatusFilter) {
      ticketStatusFilter.addEventListener('change', () => {
        ticketPage = 1;
        loadTickets();
      });
    }
    const ticketCategoryFilter = document.getElementById('ticketCategoryFilter');
    if (ticketCategoryFilter) {
      ticketCategoryFilter.addEventListener('change', () => {
        ticketPage = 1;
        loadTickets();
      });
    }

    const selectAllCheckbox = document.getElementById('selectAllTickets');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.ticket-checkbox');
        checkboxes.forEach((cb) => {
          cb.checked = e.target.checked;
          const id = parseInt(cb.dataset.id, 10);
          if (e.target.checked) {
            selectedTicketIds.add(id);
          } else {
            selectedTicketIds.delete(id);
          }
        });
        updateBatchAssignBtn();
      });
    }

    const batchAssignBtn = document.getElementById('batchAssignBtn');
    if (batchAssignBtn) {
      batchAssignBtn.addEventListener('click', batchAssign);
    }

    const backToTicketListBtn = document.getElementById('backToTicketList');
    if (backToTicketListBtn) {
      backToTicketListBtn.addEventListener('click', () => {
        currentTicketId = null;
        showPage('tickets');
        loadTickets();
      });
    }

    const ticketStatusChange = document.getElementById('ticketStatusChange');
    if (ticketStatusChange) {
      ticketStatusChange.addEventListener('change', changeTicketStatus);
    }

    const adminSubmitReplyBtn = document.getElementById('adminSubmitReplyBtn');
    if (adminSubmitReplyBtn) {
      adminSubmitReplyBtn.addEventListener('click', submitAdminReply);
    }

    loadCourses();

    checkNotifications();
    notificationTimer = setInterval(checkNotifications, 30000);
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
    .badge-dot-nav {
      position: absolute;
      top: 14px;
      right: 20px;
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      display: inline-block;
    }
    .sidebar-nav a {
      position: relative;
    }
    .badge-cat-course_enrollment {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .badge-cat-grade_appeal {
      background: rgba(249, 115, 22, 0.15);
      color: #fb923c;
    }
    .badge-cat-system_fault {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    .badge-cat-other {
      background: rgba(161, 161, 170, 0.15);
      color: #a1a1aa;
    }
    .badge-status-pending {
      background: rgba(234, 179, 8, 0.15);
      color: #eab308;
    }
    .badge-status-processing {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .badge-status-resolved {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }
    .badge-status-closed {
      background: rgba(161, 161, 170, 0.15);
      color: #a1a1aa;
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
    .ticket-detail-admin {
      background: var(--bg-glass);
      backdrop-filter: blur(12px);
      border: 1px solid var(--bg-glass-border);
      border-radius: var(--radius);
      padding: 24px;
    }
    .ticket-detail-header-admin {
      padding-bottom: 20px;
      border-bottom: 1px solid var(--bg-glass-border);
      margin-bottom: 20px;
    }
    .ticket-detail-meta-admin {
      margin-top: 12px;
      display: flex;
      gap: 24px;
      color: var(--text-secondary);
      font-size: 0.875rem;
      flex-wrap: wrap;
    }
    .ticket-detail-body-admin h4 {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 12px;
    }
    .ticket-description-admin p {
      color: var(--text-primary);
      line-height: 1.7;
      margin: 0;
    }
    .ticket-replies-admin {
      margin-top: 24px;
    }
    .ticket-reply-admin {
      margin-bottom: 16px;
      padding: 16px;
      border-radius: 12px;
    }
    .ticket-reply-admin.reply-user {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.15);
    }
    .ticket-reply-admin.reply-admin {
      background: rgba(34, 197, 94, 0.08);
      border: 1px solid rgba(34, 197, 94, 0.15);
    }
    .reply-header-admin {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .replyer-name-admin {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 0.9375rem;
    }
    .reply-time-admin {
      color: var(--text-secondary);
      font-size: 0.8125rem;
    }
    .reply-content-admin {
      color: var(--text-primary);
      line-height: 1.6;
    }
    .floating-notification-admin {
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
    .floating-notification-admin.show {
      transform: translateX(0);
    }
    .floating-notification-admin .floating-notification-title {
      font-weight: 600;
      font-size: 0.9375rem;
      margin-bottom: 4px;
    }
    .floating-notification-admin .floating-notification-content {
      font-size: 0.8125rem;
      color: rgba(255,255,255,0.8);
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);

  init();
})();
