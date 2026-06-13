(function () {
  const API_BASE = window.API_BASE || '';
  let user = null;

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
    }).then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, data: d })));
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function loadCourses() {
    const tbody = document.getElementById('courseTableBody');
    const { data } = await api('/api/admin/courses');
    if (!data || !data.ok || !Array.isArray(data.data)) {
      tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--danger);">加载失败</td></tr>';
      return;
    }
    const rows = data.data;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);">暂无课程</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (c) => `
        <tr>
          <td>${c.id}</td>
          <td>${escapeHtml(c.code)}</td>
          <td>${escapeHtml(c.name)}</td>
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
    modalTitle.textContent = '新增课程';
    modal.classList.remove('modal-editing');
    modal.classList.add('show');
  }

  function openEdit(id) {
    const row = Array.from(document.querySelectorAll('#courseTableBody tr')).find(
      (tr) => tr.querySelector('.edit-btn')?.dataset.id === String(id)
    );
    if (!row) return;
    const cells = row.querySelectorAll('td');
    document.getElementById('courseId').value = id;
    document.getElementById('code').value = cells[1].textContent;
    document.getElementById('name').value = cells[2].textContent;
    document.getElementById('credit').value = cells[3].textContent;
    document.getElementById('capacity').value = cells[4].textContent;
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
    if (!code || !name || Number.isNaN(credit) || credit < 0 || Number.isNaN(capacity) || capacity < 0) {
      showToast('请填写完整且有效的字段', 'error');
      return;
    }
    const payload = { code, name, credit, capacity };
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
    // 不 preventDefault，让 <a href> 原生跳转，Chrome 下更可靠
  });

  function init() {
    user = getStoredUser();
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    loadCourses();
  }

  init();
})();
