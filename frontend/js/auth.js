(function () {
  const API_BASE = window.API_BASE || '';

  function showToast(message, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast ' + type + ' show';
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;
    const btn = document.getElementById('submitBtn');

    if (!username || !password || !role) {
      showToast('请填写完整信息', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '登录中...';
    try {
      const res = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      });
      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        // 响应不是 JSON（如 nginx 错误页）
        showToast(res.status === 404 ? '无法连接登录服务，请确认已通过正确地址访问（如 http://localhost:31371）' : '登录服务返回异常，请重试', 'error');
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }
      if (!res.ok) {
        const msg = data.message || (res.status === 404 ? '无法连接登录服务' : res.status === 401 ? '用户名/学号或密码错误' : '登录失败(HTTP ' + res.status + ')');
        showToast(msg, 'error');
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }
      if (!data.ok || !data.data) {
        var errMsg = data.message || ('登录失败，请重试');
        if (!data.ok && !data.message) errMsg = '登录失败(服务器返回格式异常)';
        showToast(errMsg, 'error');
        btn.disabled = false;
        btn.textContent = '登录';
        return;
      }
      sessionStorage.setItem('user', JSON.stringify(data.data));
      if (data.data.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'student.html';
      }
    } catch (err) {
      showToast('网络错误，请检查后端是否启动或地址是否正确', 'error');
      btn.disabled = false;
      btn.textContent = '登录';
    }
  });
})();
