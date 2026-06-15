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
    document.getElementById('page-forum').style.display = page === 'forum' ? 'block' : 'none';
    document.getElementById('page-training-program').style.display = page === 'training-program' ? 'block' : 'none';
    document.getElementById('page-training-program-detail').style.display = page === 'training-program-detail' ? 'block' : 'none';
    document.getElementById('page-backup').style.display = page === 'backup' ? 'block' : 'none';

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
    } else if (page === 'forum') {
      headerTitle.textContent = '内容审核';
      headerSubtitle.textContent = '审核讨论区帖子与评论内容';
    } else if (page === 'training-program' || page === 'training-program-detail') {
      headerTitle.textContent = '培养方案';
      headerSubtitle.textContent = '管理各专业各年级的培养方案与课程配置';
    } else if (page === 'backup') {
      headerTitle.textContent = '数据备份';
      headerSubtitle.textContent = '一键导出与导入系统核心数据';
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
    if (page === 'forum') {
      loadForumPosts();
    }
    if (page === 'backup') {
      loadBackupRecords();
    }
    if (page === 'training-program') {
      loadTrainingPrograms();
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
          const entries = c.entries ?? 0;
          const hasWaiting = waiting > 0;
          const hasDrawn = won > 0 || lost > 0;
          let btnText, btnDisabled;
          if (hasWaiting) {
            btnText = '执行抽签';
            btnDisabled = false;
          } else if (entries === 0) {
            btnText = '暂无报名';
            btnDisabled = true;
          } else if (hasDrawn) {
            btnText = '已开奖';
            btnDisabled = true;
          } else {
            btnText = '暂无报名';
            btnDisabled = true;
          }
          return `
          <tr>
            <td>${c.id}</td>
            <td>${escapeHtml(c.code)}</td>
            <td>${escapeHtml(c.name)}</td>
            <td>${c.capacity ?? 0}</td>
            <td>${entries}</td>
            <td><span class="badge badge-lottery-waiting">${waiting}</span></td>
            <td><span class="badge badge-lottery-won">${won}</span></td>
            <td><span class="badge badge-lottery-lost">${lost}</span></td>
            <td>
              <button type="button" class="btn btn-primary btn-sm execute-lottery-btn" data-id="${c.id}" ${btnDisabled ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                ${btnText}
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

  let selectedFile = null;

  function formatFileSize(bytes) {
    if (bytes == null) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function sumAffectedRows(obj) {
    if (!obj) return 0;
    return Object.values(obj).reduce((s, v) => s + (Number(v) || 0), 0);
  }

  async function doExport() {
    const btn = document.getElementById('exportBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '正在导出...';
    try {
      const r = await fetch(API_BASE + '/api/backup/export');
      if (!r.ok) throw new Error('导出失败');
      const blob = await r.blob();
      const disp = r.headers.get('Content-Disposition') || '';
      const m = disp.match(/filename="?([^"]+)"?/);
      const filename = m ? m[1] : `backup_${Date.now()}.json.gz`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('导出成功', 'success');
      loadBackupRecords();
    } catch (e) {
      showToast('导出失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '⬇ 导出数据备份';
    }
  }

  function handleFileSelect(file) {
    if (!file) return;
    if (!/\.(json|gz)$/i.test(file.name)) {
      showToast('仅支持 .json.gz 或 .json 格式文件', 'error');
      return;
    }
    selectedFile = file;
    document.getElementById('fileInfo').style.display = 'block';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);
    document.getElementById('importBtn').disabled = false;
  }

  function clearFileInfo() {
    selectedFile = null;
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('fileName').textContent = '';
    document.getElementById('fileSize').textContent = '';
    document.getElementById('importBtn').disabled = true;
    document.getElementById('fileInput').value = '';
  }

  function addImportLog(logsEl, entry) {
    const colors = {
      info: 'var(--text-secondary)',
      success: 'var(--success)',
      error: 'var(--danger)',
      warn: '#eab308',
    };
    const color = colors[entry.level] || 'var(--text-secondary)';
    const time = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false });
    const div = document.createElement('div');
    div.style.color = color;
    div.innerHTML = `<span style="opacity:0.6;">[${time}]</span> ${escapeHtml(entry.message)}`;
    logsEl.appendChild(div);
    logsEl.scrollTop = logsEl.scrollHeight;
  }

  function updateImportProgress(percent, logsEl, estimatedTotalSteps) {
    const bar = document.getElementById('importProgressBar');
    const text = document.getElementById('importProgressText');
    const logCount = logsEl.children.length;
    const realPercent = Math.min(99, Math.max(percent, (logCount / Math.max(estimatedTotalSteps, 20)) * 100));
    bar.style.width = realPercent + '%';
    text.textContent = Math.round(realPercent) + '%';
  }

  async function doImport() {
    if (!selectedFile) {
      showToast('请先选择备份文件', 'error');
      return;
    }
    const modeEl = document.querySelector('input[name="importMode"]:checked');
    const mode = modeEl ? modeEl.value : 'overwrite';
    const confirmMsg = mode === 'overwrite'
      ? '确认使用覆盖模式导入？\n此操作将清空所有现有数据后写入备份文件，不可撤销！'
      : '确认使用增量模式导入？\n此操作将按主键合并数据，已有记录将被更新。';
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('importBtn');
    btn.disabled = true;
    btn.textContent = '正在导入...';

    const progressCard = document.getElementById('importProgressCard');
    const logsEl = document.getElementById('importLogs');
    progressCard.style.display = 'block';
    logsEl.innerHTML = '';
    document.getElementById('importProgressBar').style.width = '0%';
    document.getElementById('importProgressText').textContent = '0%';

    const estimatedTotalSteps = 40;
    let progressTimer;
    let currentPercent = 0;
    progressTimer = setInterval(() => {
      currentPercent = Math.min(currentPercent + 2, 95);
      updateImportProgress(currentPercent, logsEl, estimatedTotalSteps);
    }, 500);

    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('mode', mode);

    try {
      const r = await fetch(API_BASE + '/api/backup/import', { method: 'POST', body: fd });
      const data = await r.json().catch(() => ({}));
      clearInterval(progressTimer);

      if (data && data.data && Array.isArray(data.data.logs)) {
        logsEl.innerHTML = '';
        data.data.logs.forEach((l) => addImportLog(logsEl, l));
      }

      if (data && data.ok) {
        document.getElementById('importProgressBar').style.width = '100%';
        document.getElementById('importProgressText').textContent = '100%';
        showToast('导入成功', 'success');
        clearFileInfo();
        loadBackupRecords();
      } else {
        showToast((data && data.message) || '导入失败', 'error');
      }
    } catch (e) {
      clearInterval(progressTimer);
      addImportLog(logsEl, { time: new Date().toISOString(), level: 'error', message: '网络错误：' + e.message });
      showToast('导入失败：' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '⬆ 开始导入';
    }
  }

  async function loadBackupRecords() {
    const tbody = document.getElementById('backupTableBody');
    if (!tbody) return;
    const { data } = await api('/api/backup/records');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">暂无备份记录</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const typeBadge = r.type === 'export'
          ? '<span class="badge badge-lottery-won">导出</span>'
          : '<span class="badge badge-status-processing">导入</span>';
        const modeBadge = r.mode === 'overwrite'
          ? '<span class="badge badge-absent">覆盖</span>'
          : r.mode === 'incremental'
          ? '<span class="badge badge-lottery-waiting">增量</span>'
          : '<span style="color:var(--text-secondary);">-</span>';
        const statusBadge = r.status === 'success'
          ? '<span class="badge badge-signed">成功</span>'
          : '<span class="badge badge-absent">失败</span>';
        const totalRows = sumAffectedRows(r.affectedRows);
        return `
        <tr>
          <td>${r.id}</td>
          <td>${typeBadge}</td>
          <td>${modeBadge}</td>
          <td>${escapeHtml(r.operator)}</td>
          <td style="font-family:monospace;font-size:0.8125rem;">${r.fileName ? escapeHtml(r.fileName) : '-'}</td>
          <td>${formatFileSize(r.fileSize)}</td>
          <td>${totalRows > 0 ? totalRows + ' 行' : '-'}</td>
          <td>${statusBadge}</td>
          <td style="color:var(--text-secondary);font-size:0.8125rem;">${formatDateTime(r.createdAt)}</td>
        </tr>`;
      })
      .join('');
  }

  function initBackupPage() {
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', doExport);

    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        handleFileSelect(file);
      });
      ['dragenter', 'dragover'].forEach((ev) => {
        dropZone.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.style.borderColor = 'var(--accent-start)';
          dropZone.style.background = 'rgba(99,102,241,0.08)';
        });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        dropZone.addEventListener(ev, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.style.borderColor = 'var(--bg-glass-border)';
          dropZone.style.background = 'transparent';
        });
      });
      dropZone.addEventListener('drop', (e) => {
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        handleFileSelect(file);
      });
    }

    const importBtn = document.getElementById('importBtn');
    if (importBtn) importBtn.addEventListener('click', doImport);
  }

  let forumCurrentTab = 'posts';
  let forumPostPage = 1;
  let forumPostPageSize = 10;
  let forumCommentPage = 1;
  let forumCommentPageSize = 10;
  let forumSearchTimer = null;

  function switchForumTab(tab) {
    forumCurrentTab = tab;
    document.querySelectorAll('.forum-tab-btn').forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
        btn.style.color = '#fff';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      }
    });
    document.getElementById('forumPostsPanel').style.display = tab === 'posts' ? 'block' : 'none';
    document.getElementById('forumCommentsPanel').style.display = tab === 'comments' ? 'block' : 'none';
    document.getElementById('forumPostStatusFilter').style.display = tab === 'posts' ? '' : 'none';
    document.getElementById('forumCommentStatusFilter').style.display = tab === 'comments' ? '' : 'none';
    if (tab === 'posts') {
      loadForumPosts();
    } else {
      loadForumComments();
    }
  }

  async function loadForumPosts() {
    const tbody = document.getElementById('forumPostTableBody');
    if (!tbody) return;
    const statusFilter = document.getElementById('forumPostStatusFilter')?.value || '';
    const keyword = document.getElementById('forumSearchInput')?.value.trim() || '';

    const params = new URLSearchParams({
      page: forumPostPage,
      pageSize: forumPostPageSize,
      userId: user.id,
      userRole: 'admin',
    });
    if (statusFilter) params.append('status', statusFilter);
    if (keyword) params.append('keyword', keyword);

    const { data } = await api('/api/forum/admin/posts?' + params.toString());
    if (!data || !data.ok || !data.data) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }

    const { list, total, totalPages } = data.data;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);">暂无帖子</td></tr>';
    } else {
      tbody.innerHTML = list
        .map((p) => {
          const statusBadge = p.isRemoved
            ? '<span class="badge badge-absent">已下架</span>'
            : '<span class="badge badge-signed">正常</span>';
          const pinBadge = p.isPinned
            ? '<span class="badge badge-lottery-waiting">📌 置顶</span>'
            : '<span style="color:var(--text-secondary);">-</span>';
          return `
          <tr class="${p.isRemoved ? 'row-absent' : ''}">
            <td>${p.id}</td>
            <td style="max-width:260px;">
              <div style="font-weight:600;color:var(--text-primary);">${escapeHtml(p.title)}</div>
              <div style="color:var(--text-secondary);font-size:0.75rem;margin-top:2px;">${p.course ? '📚 ' + escapeHtml(p.course.name) : '🏷️ 综合讨论'}</div>
            </td>
            <td>${escapeHtml(p.authorName)} <span style="color:var(--text-secondary);font-size:0.75rem;">(${p.authorRole})</span></td>
            <td>${p.course ? escapeHtml(p.course.name) : '-'}</td>
            <td>${p.viewCount ?? 0}</td>
            <td>${p.likeCount ?? 0}</td>
            <td>${p.commentCount ?? 0}</td>
            <td>${pinBadge}</td>
            <td>${statusBadge}</td>
            <td style="color:var(--text-secondary);font-size:0.8125rem;">${formatDateTime(p.createdAt)}</td>
            <td>
              <button type="button" class="btn btn-ghost btn-sm forum-pin-btn" data-id="${p.id}" data-pinned="${p.isPinned ? '1' : '0'}">
                ${p.isPinned ? '取消置顶' : '置顶'}
              </button>
              ${p.isRemoved
                ? `<button type="button" class="btn btn-ghost btn-sm forum-restore-btn" data-id="${p.id}">恢复</button>`
                : `<button type="button" class="btn btn-warning btn-sm forum-remove-btn" data-id="${p.id}">下架</button>`
              }
              <button type="button" class="btn btn-danger btn-sm forum-delete-btn" data-id="${p.id}">永久删除</button>
            </td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('.forum-pin-btn').forEach((btn) => {
        btn.addEventListener('click', () => toggleForumPostPin(parseInt(btn.dataset.id, 10), btn.dataset.pinned !== '1'));
      });
      tbody.querySelectorAll('.forum-remove-btn').forEach((btn) => {
        btn.addEventListener('click', () => removeForumPost(parseInt(btn.dataset.id, 10)));
      });
      tbody.querySelectorAll('.forum-restore-btn').forEach((btn) => {
        btn.addEventListener('click', () => restoreForumPost(parseInt(btn.dataset.id, 10)));
      });
      tbody.querySelectorAll('.forum-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteForumPostPermanently(parseInt(btn.dataset.id, 10)));
      });
    }

    renderForumPagination('forumPostPagination', total, totalPages, forumPostPage, (p) => {
      forumPostPage = p;
      loadForumPosts();
    });
  }

  async function loadForumComments() {
    const tbody = document.getElementById('forumCommentTableBody');
    if (!tbody) return;
    const statusFilter = document.getElementById('forumCommentStatusFilter')?.value || '';
    const keyword = document.getElementById('forumSearchInput')?.value.trim() || '';

    const params = new URLSearchParams({
      page: forumCommentPage,
      pageSize: forumCommentPageSize,
      userId: user.id,
      userRole: 'admin',
    });
    if (statusFilter) params.append('status', statusFilter);
    if (keyword) params.append('keyword', keyword);

    const { data } = await api('/api/forum/admin/comments?' + params.toString());
    if (!data || !data.ok || !data.data) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }

    const { list, total, totalPages } = data.data;
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);">暂无评论</td></tr>';
    } else {
      tbody.innerHTML = list
        .map((c) => {
          const statusBadge = c.isRemoved
            ? '<span class="badge badge-absent">已下架</span>'
            : '<span class="badge badge-signed">正常</span>';
          const contentPreview = c.content.length > 80 ? c.content.substring(0, 80) + '...' : c.content;
          return `
          <tr class="${c.isRemoved ? 'row-absent' : ''}">
            <td>${c.id}</td>
            <td style="max-width:300px;">
              <div style="color:var(--text-primary);line-height:1.5;">${escapeHtml(contentPreview)}</div>
            </td>
            <td>${escapeHtml(c.authorName)} <span style="color:var(--text-secondary);font-size:0.75rem;">(${c.authorRole})</span></td>
            <td>
              <span style="color:var(--text-primary);">#${c.postId}</span>
              ${c.post ? `<div style="color:var(--text-secondary);font-size:0.75rem;margin-top:2px;">${escapeHtml(c.post.title || '')}</div>` : ''}
            </td>
            <td>${c.replyToName ? '回复 ' + escapeHtml(c.replyToName) : (c.parentId ? '评论回复' : '-')}</td>
            <td>${statusBadge}</td>
            <td style="color:var(--text-secondary);font-size:0.8125rem;">${formatDateTime(c.createdAt)}</td>
            <td>
              ${c.isRemoved
                ? ''
                : `<button type="button" class="btn btn-warning btn-sm forum-comment-remove-btn" data-id="${c.id}">下架</button>`
              }
              <button type="button" class="btn btn-danger btn-sm forum-comment-delete-btn" data-id="${c.id}">永久删除</button>
            </td>
          </tr>`;
        })
        .join('');

      tbody.querySelectorAll('.forum-comment-remove-btn').forEach((btn) => {
        btn.addEventListener('click', () => removeForumComment(parseInt(btn.dataset.id, 10)));
      });
      tbody.querySelectorAll('.forum-comment-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteForumCommentPermanently(parseInt(btn.dataset.id, 10)));
      });
    }

    renderForumPagination('forumCommentPagination', total, totalPages, forumCommentPage, (p) => {
      forumCommentPage = p;
      loadForumComments();
    });
  }

  function renderForumPagination(containerId, total, totalPages, currentPage, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    let html = '<div class="pagination">';
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} data-page="prev">上一页</button>`;
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} data-page="next">下一页</button>`;
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.page-btn[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'prev' && currentPage > 1) {
          onChange(currentPage - 1);
        } else if (page === 'next' && currentPage < totalPages) {
          onChange(currentPage + 1);
        } else if (page !== 'prev' && page !== 'next') {
          onChange(parseInt(page, 10));
        }
      });
    });
  }

  async function toggleForumPostPin(postId, shouldPin) {
    const confirmMsg = shouldPin ? '确定置顶该帖子？' : '确定取消置顶该帖子？';
    if (!confirm(confirmMsg)) return;
    const { data } = await api(`/api/forum/admin/posts/${postId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ userId: user.id, userRole: 'admin', isPinned: shouldPin }),
    });
    if (data && data.ok) {
      showToast(shouldPin ? '已置顶' : '已取消置顶', 'success');
      loadForumPosts();
    } else {
      showToast((data && data.message) || '操作失败', 'error');
    }
  }

  async function removeForumPost(postId) {
    if (!confirm('确定下架该帖子？下架后学生端将无法看到该帖子。')) return;
    const { data } = await api(`/api/forum/admin/posts/${postId}/remove`, {
      method: 'PUT',
      body: JSON.stringify({ userId: user.id, userRole: 'admin' }),
    });
    if (data && data.ok) {
      showToast('已下架', 'success');
      loadForumPosts();
    } else {
      showToast((data && data.message) || '下架失败', 'error');
    }
  }

  async function restoreForumPost(postId) {
    if (!confirm('确定恢复该帖子？')) return;
    const { data } = await api(`/api/forum/admin/posts/${postId}/restore`, {
      method: 'PUT',
      body: JSON.stringify({ userId: user.id, userRole: 'admin' }),
    });
    if (data && data.ok) {
      showToast('已恢复', 'success');
      loadForumPosts();
    } else {
      showToast((data && data.message) || '恢复失败', 'error');
    }
  }

  async function deleteForumPostPermanently(postId) {
    if (!confirm('⚠️ 确定永久删除该帖子？此操作不可撤销，所有关联的评论和点赞也将被删除！')) return;
    const { data } = await api(`/api/forum/admin/posts/${postId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: user.id, userRole: 'admin' }),
    });
    if (data && data.ok) {
      showToast('已永久删除', 'success');
      loadForumPosts();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  async function removeForumComment(commentId) {
    if (!confirm('确定下架该评论？下架后学生端将无法看到该评论。')) return;
    const { data } = await api(`/api/forum/admin/comments/${commentId}/remove`, {
      method: 'PUT',
      body: JSON.stringify({ userId: user.id, userRole: 'admin' }),
    });
    if (data && data.ok) {
      showToast('已下架', 'success');
      loadForumComments();
    } else {
      showToast((data && data.message) || '下架失败', 'error');
    }
  }

  async function deleteForumCommentPermanently(commentId) {
    if (!confirm('⚠️ 确定永久删除该评论？此操作不可撤销！')) return;
    const { data } = await api(`/api/forum/admin/comments/${commentId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId: user.id, userRole: 'admin' }),
    });
    if (data && data.ok) {
      showToast('已永久删除', 'success');
      loadForumComments();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  function initForumPage() {
    document.querySelectorAll('.forum-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchForumTab(btn.dataset.tab));
    });
    document.querySelectorAll('.forum-tab-btn.active').forEach((btn) => {
      btn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
      btn.style.color = '#fff';
    });

    const postStatusFilter = document.getElementById('forumPostStatusFilter');
    if (postStatusFilter) {
      postStatusFilter.addEventListener('change', () => {
        forumPostPage = 1;
        loadForumPosts();
      });
    }
    const commentStatusFilter = document.getElementById('forumCommentStatusFilter');
    if (commentStatusFilter) {
      commentStatusFilter.addEventListener('change', () => {
        forumCommentPage = 1;
        loadForumComments();
      });
    }

    const searchInput = document.getElementById('forumSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (forumSearchTimer) clearTimeout(forumSearchTimer);
        forumSearchTimer = setTimeout(() => {
          if (forumCurrentTab === 'posts') {
            forumPostPage = 1;
            loadForumPosts();
          } else {
            forumCommentPage = 1;
            loadForumComments();
          }
        }, 400);
      });
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

  // ========== 培养方案管理 ==========
  let currentProgramId = null;
  let currentProgram = null;
  let allCourses = [];
  let programCourses = { required: [], limited_elective: [], elective: [] };
  let draggedCourse = null;

  async function loadTrainingPrograms() {
    const tbody = document.getElementById('programTableBody');
    const { data } = await api('/api/training-programs');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">暂无培养方案</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (p) => `
        <tr>
          <td>${p.id}</td>
          <td>${escapeHtml(p.major)}</td>
          <td>${p.enrollmentYear}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${p.totalCreditsRequired}</td>
          <td>${p.requiredCredits} / ${p.limitedElectiveCredits} / ${p.electiveCredits}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-sm view-program-btn" data-id="${p.id}">配置课程</button>
            <button type="button" class="btn btn-ghost btn-sm edit-program-btn" data-id="${p.id}">编辑</button>
            <button type="button" class="btn btn-danger btn-sm delete-program-btn" data-id="${p.id}">删除</button>
          </td>
        </tr>`
      )
      .join('');

    tbody.querySelectorAll('.view-program-btn').forEach((btn) => {
      btn.addEventListener('click', () => viewProgramDetail(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.edit-program-btn').forEach((btn) => {
      btn.addEventListener('click', () => openProgramEdit(parseInt(btn.dataset.id, 10)));
    });
    tbody.querySelectorAll('.delete-program-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteProgram(parseInt(btn.dataset.id, 10)));
    });
  }

  const programModal = document.getElementById('programModalOverlay');
  const programForm = document.getElementById('programForm');
  const programModalTitle = document.getElementById('programModalTitle');

  function openProgramAdd() {
    document.getElementById('programId').value = '';
    document.getElementById('programMajor').value = '';
    document.getElementById('programYear').value = '';
    document.getElementById('programName').value = '';
    document.getElementById('totalCredits').value = '';
    document.getElementById('requiredCredits').value = '';
    document.getElementById('limitedElectiveCredits').value = '';
    document.getElementById('electiveCredits').value = '';
    programModalTitle.textContent = '新增培养方案';
    programModal.classList.add('show');
  }

  async function openProgramEdit(id) {
    const { data } = await api('/api/training-programs/' + id);
    if (!data || !data.ok) {
      showToast('加载失败', 'error');
      return;
    }
    const p = data.data;
    document.getElementById('programId').value = id;
    document.getElementById('programMajor').value = p.major;
    document.getElementById('programYear').value = p.enrollmentYear;
    document.getElementById('programName').value = p.name;
    document.getElementById('totalCredits').value = p.totalCreditsRequired;
    document.getElementById('requiredCredits').value = p.requiredCredits;
    document.getElementById('limitedElectiveCredits').value = p.limitedElectiveCredits;
    document.getElementById('electiveCredits').value = p.electiveCredits;
    programModalTitle.textContent = '编辑培养方案';
    programModal.classList.add('show');
  }

  function closeProgramModal() {
    programModal.classList.remove('show');
  }

  async function deleteProgram(id) {
    if (!confirm('确定删除该培养方案？关联的课程配置也将被删除。')) return;
    const { data } = await api('/api/training-programs/' + id, { method: 'DELETE' });
    if (data && data.ok) {
      showToast('已删除', 'success');
      loadTrainingPrograms();
    } else {
      showToast((data && data.message) || '删除失败', 'error');
    }
  }

  programForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('programId').value.trim();
    const payload = {
      major: document.getElementById('programMajor').value.trim(),
      enrollmentYear: parseInt(document.getElementById('programYear').value, 10),
      name: document.getElementById('programName').value.trim(),
      totalCreditsRequired: parseInt(document.getElementById('totalCredits').value, 10),
      requiredCredits: parseInt(document.getElementById('requiredCredits').value, 10),
      limitedElectiveCredits: parseInt(document.getElementById('limitedElectiveCredits').value, 10),
      electiveCredits: parseInt(document.getElementById('electiveCredits').value, 10),
    };

    if (!payload.major || !payload.name || Number.isNaN(payload.enrollmentYear) || Number.isNaN(payload.totalCreditsRequired)) {
      showToast('请填写完整且有效的字段', 'error');
      return;
    }

    let result;
    if (id) {
      result = await api('/api/training-programs/' + id, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      result = await api('/api/training-programs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }

    if (result.data && result.data.ok) {
      showToast('保存成功', 'success');
      closeProgramModal();
      loadTrainingPrograms();
    } else {
      showToast((result.data && result.data.message) || '保存失败', 'error');
    }
  });

  async function viewProgramDetail(id) {
    currentProgramId = id;
    const [programResult, coursesResult] = await Promise.all([
      api('/api/training-programs/' + id),
      api('/api/courses'),
    ]);

    if (!programResult.data || !programResult.data.ok) {
      showToast('加载培养方案失败', 'error');
      return;
    }
    if (!coursesResult.data || !coursesResult.data.ok) {
      showToast('加载课程列表失败', 'error');
      return;
    }

    const program = programResult.data.data;
    currentProgram = program;
    allCourses = coursesResult.data.data || [];
    programCourses = program.courses || { required: [], limited_elective: [], elective: [] };

    document.getElementById('programDetailTitle').textContent = program.name;
    document.getElementById('programInfoContent').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;">
        <div>
          <div style="color:var(--text-secondary);font-size:0.8125rem;margin-bottom:4px;">专业</div>
          <div style="font-weight:600;">${escapeHtml(program.major)}</div>
        </div>
        <div>
          <div style="color:var(--text-secondary);font-size:0.8125rem;margin-bottom:4px;">入学年份</div>
          <div style="font-weight:600;">${program.enrollmentYear}</div>
        </div>
        <div>
          <div style="color:var(--text-secondary);font-size:0.8125rem;margin-bottom:4px;">毕业总学分要求</div>
          <div style="font-weight:600;color:var(--accent-start);">${program.totalCreditsRequired} 学分</div>
        </div>
        <div>
          <div style="color:var(--text-secondary);font-size:0.8125rem;margin-bottom:4px;">必修最低学分</div>
          <div style="font-weight:600;color:#ef4444;">${program.requiredCredits} 学分</div>
        </div>
        <div>
          <div style="color:var(--text-secondary);font-size:0.8125rem;margin-bottom:4px;">限选最低学分</div>
          <div style="font-weight:600;color:#f59e0b;">${program.limitedElectiveCredits} 学分</div>
        </div>
        <div>
          <div style="color:var(--text-secondary);font-size:0.8125rem;margin-bottom:4px;">任选最低学分</div>
          <div style="font-weight:600;color:#22c55e;">${program.electiveCredits} 学分</div>
        </div>
      </div>
    `;

    renderAvailableCourses();
    renderProgramCourses();
    updateCreditInfo();
    showPage('training-program-detail');
  }

  function renderAvailableCourses() {
    const container = document.getElementById('availableCourses');
    const keyword = (document.getElementById('courseSearch')?.value || '').toLowerCase();

    const assignedCourseIds = new Set([
      ...programCourses.required.map((c) => c.courseId),
      ...programCourses.limited_elective.map((c) => c.courseId),
      ...programCourses.elective.map((c) => c.courseId),
    ]);

    const available = allCourses.filter(
      (c) =>
        !assignedCourseIds.has(c.id) &&
        (!keyword || c.name.toLowerCase().includes(keyword) || c.code.toLowerCase().includes(keyword))
    );

    if (!available.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-secondary);padding:24px;">暂无可用课程</div>';
      return;
    }

    container.innerHTML = available
      .map(
        (c) => `
        <div class="drag-course-item" draggable="true" data-course-id="${c.id}" style="background:rgba(255,255,255,0.04);border:1px solid var(--bg-glass-border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:grab;transition:all 0.2s;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:600;">${escapeHtml(c.name)}</div>
              <div style="color:var(--text-secondary);font-size:0.8125rem;">${escapeHtml(c.code)}</div>
            </div>
            <span class="badge" style="background:rgba(99,102,241,0.15);color:#a78bfa;">${c.credit} 学分</span>
          </div>
        </div>`
      )
      .join('');

    container.querySelectorAll('.drag-course-item').forEach((item) => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
    });
  }

  function renderProgramCourses() {
    renderCategoryCourses('required', 'requiredCourses');
    renderCategoryCourses('limited_elective', 'limitedElectiveCourses');
    renderCategoryCourses('elective', 'electiveCourses');
  }

  function renderCategoryCourses(category, containerId) {
    const container = document.getElementById(containerId);
    const list = programCourses[category] || [];

    if (!list.length) {
      container.innerHTML = `<div style="text-align:center;color:var(--text-secondary);padding:24px;font-size:0.8125rem;">拖拽课程到此处</div>`;
      return;
    }

    container.innerHTML = list
      .map(
        (c) => `
        <div class="drag-course-item" draggable="true" data-program-course-id="${c.id}" data-course-id="${c.courseId}" data-category="${category}" style="background:rgba(255,255,255,0.04);border:1px solid var(--bg-glass-border);border-radius:10px;padding:12px;margin-bottom:8px;cursor:grab;transition:all 0.2s;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:600;">${escapeHtml(c.name)}</div>
              <div style="color:var(--text-secondary);font-size:0.8125rem;">${escapeHtml(c.code)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="badge" style="background:rgba(99,102,241,0.15);color:#a78bfa;">${c.credit} 学分</span>
              <button type="button" class="remove-course-btn" data-id="${c.id}" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:4px;font-size:1rem;transition:color 0.2s;" title="移除">✕</button>
            </div>
          </div>
        </div>`
      )
      .join('');

    container.querySelectorAll('.drag-course-item').forEach((item) => {
      item.addEventListener('dragstart', handleDragStart);
      item.addEventListener('dragend', handleDragEnd);
    });

    container.querySelectorAll('.remove-course-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCourseFromProgram(parseInt(btn.dataset.id, 10), category);
      });
    });
  }

  function updateCreditInfo() {
    const sumCredits = (list) => list.reduce((sum, c) => sum + (c.credit || 0), 0);

    const requiredSum = sumCredits(programCourses.required);
    const limitedSum = sumCredits(programCourses.limited_elective);
    const electiveSum = sumCredits(programCourses.elective);

    const req = currentProgram || {};

    document.getElementById('requiredCreditInfo').textContent = `${requiredSum} / ${req.requiredCredits || 0} 学分`;
    document.getElementById('limitedElectiveCreditInfo').textContent = `${limitedSum} / ${req.limitedElectiveCredits || 0} 学分`;
    document.getElementById('electiveCreditInfo').textContent = `${electiveSum} / ${req.electiveCredits || 0} 学分`;
  }

  function handleDragStart(e) {
    draggedCourse = {
      courseId: parseInt(e.target.dataset.courseId, 10),
      programCourseId: e.target.dataset.programCourseId ? parseInt(e.target.dataset.programCourseId, 10) : null,
      category: e.target.dataset.category || null,
    };
    e.target.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(e) {
    e.target.style.opacity = '1';
    draggedCourse = null;
    document.querySelectorAll('.drop-zone').forEach((zone) => {
      zone.style.borderStyle = 'dashed';
      zone.style.transform = 'scale(1)';
    });
  }

  function initDragAndDrop() {
    document.querySelectorAll('.drop-zone').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.style.borderStyle = 'solid';
        zone.style.transform = 'scale(1.01)';
        zone.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
      });

      zone.addEventListener('dragleave', () => {
        zone.style.borderStyle = 'dashed';
        zone.style.transform = 'scale(1)';
        zone.style.boxShadow = 'none';
      });

      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.style.borderStyle = 'dashed';
        zone.style.transform = 'scale(1)';
        zone.style.boxShadow = 'none';

        if (!draggedCourse || !currentProgramId) return;

        const targetCategory = zone.dataset.category;

        if (draggedCourse.programCourseId && draggedCourse.category) {
          if (draggedCourse.category === targetCategory) return;

          const { data } = await api(`/api/training-programs/${currentProgramId}/courses/${draggedCourse.programCourseId}`, {
            method: 'PUT',
            body: JSON.stringify({ category: targetCategory }),
          });

          if (data && data.ok) {
            const course = programCourses[draggedCourse.category].find((c) => c.id === draggedCourse.programCourseId);
            if (course) {
              course.category = targetCategory;
              course.categoryText = { required: '必修', limited_elective: '限选', elective: '任选' }[targetCategory];
              programCourses[draggedCourse.category] = programCourses[draggedCourse.category].filter((c) => c.id !== draggedCourse.programCourseId);
              programCourses[targetCategory].push(course);
              renderAvailableCourses();
              renderProgramCourses();
              updateCreditInfo();
              showToast('已移动到' + { required: '必修', limited_elective: '限选', elective: '任选' }[targetCategory], 'success');
            }
          } else {
            showToast((data && data.message) || '移动失败', 'error');
          }
        } else {
          const { data } = await api(`/api/training-programs/${currentProgramId}/courses`, {
            method: 'POST',
            body: JSON.stringify({ courseId: draggedCourse.courseId, category: targetCategory }),
          });

          if (data && data.ok) {
            programCourses[targetCategory].push(data.data);
            renderAvailableCourses();
            renderProgramCourses();
            updateCreditInfo();
            showToast('已添加到' + { required: '必修', limited_elective: '限选', elective: '任选' }[targetCategory], 'success');
          } else {
            showToast((data && data.message) || '添加失败', 'error');
          }
        }
      });
    });
  }

  async function removeCourseFromProgram(pcId, category) {
    if (!confirm('确定从培养方案中移除该课程？')) return;

    const { data } = await api(`/api/training-programs/${currentProgramId}/courses/${pcId}`, {
      method: 'DELETE',
    });

    if (data && data.ok) {
      programCourses[category] = programCourses[category].filter((c) => c.id !== pcId);
      renderAvailableCourses();
      renderProgramCourses();
      updateCreditInfo();
      showToast('已移除', 'success');
    } else {
      showToast((data && data.message) || '移除失败', 'error');
    }
  }

  function initProgramPage() {
    document.getElementById('addProgramBtn').addEventListener('click', openProgramAdd);
    document.getElementById('programModalCancel').addEventListener('click', closeProgramModal);
    document.getElementById('programModalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeProgramModal();
    });
    document.getElementById('backToProgramList').addEventListener('click', () => {
      currentProgramId = null;
      showPage('training-program');
    });
    document.getElementById('editProgramBtn').addEventListener('click', () => {
      if (currentProgramId) openProgramEdit(currentProgramId);
    });

    const courseSearch = document.getElementById('courseSearch');
    if (courseSearch) {
      courseSearch.addEventListener('input', () => {
        renderAvailableCourses();
      });
    }

    initDragAndDrop();
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
    initForumPage();
    initBackupPage();
    initProgramPage();

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
    .card-backup {
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card-backup:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    #dropZone {
      transition: all 0.2s ease;
    }
    #dropZone:hover {
      border-color: rgba(99, 102, 241, 0.5);
      background: rgba(99, 102, 241, 0.04);
    }
    .btn-warning {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn-warning:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
    }
    .btn-warning:active {
      transform: translateY(0);
    }
    .forum-tab-btn:hover:not(.active) {
      background: rgba(255, 255, 255, 0.06) !important;
      color: var(--text-primary) !important;
    }
  `;
  document.head.appendChild(style);

  init();
})();
