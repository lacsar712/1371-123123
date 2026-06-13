/**
 * 简单请求体验证：确保 JSON  body 存在且包含必填字段
 */
function requireBody(fields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ ok: false, message: '请求体必须为 JSON 对象' });
    }
    const missing = fields.filter((f) => req.body[f] === undefined || req.body[f] === '');
    if (missing.length) {
      return res.status(400).json({ ok: false, message: `缺少字段: ${missing.join(', ')}` });
    }
    next();
  };
}

module.exports = { requireBody };
