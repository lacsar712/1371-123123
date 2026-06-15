const logger = require('./logger');

const clients = new Map();

function addClient(userId, userRole, res) {
  const key = `${userId}:${userRole}`;
  if (!clients.has(key)) {
    clients.set(key, new Set());
  }
  clients.get(key).add(res);

  res.on('close', () => {
    const set = clients.get(key);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(key);
    }
  });
}

function pushToUser(userId, userRole, notification) {
  const key = `${userId}:${userRole}`;
  const set = clients.get(key);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(notification);
  for (const res of set) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (e) {
      logger.warn('SSE push error', { error: e.message });
    }
  }
}

async function createAndPush(userId, userRole, title, content, type, relatedObjectType, relatedObjectId) {
  const { Notification } = require('./models');
  try {
    const notification = await Notification.create({
      userId,
      userRole,
      title,
      content,
      type: type || 'system',
      relatedObjectType: relatedObjectType || null,
      relatedObjectId: relatedObjectId || null,
    });
    const data = notification.toJSON();
    pushToUser(userId, userRole, data);
    return data;
  } catch (e) {
    logger.error('Create and push notification error', { error: e.message });
    return null;
  }
}

function getOnlineCount() {
  let count = 0;
  for (const set of clients.values()) {
    count += set.size;
  }
  return count;
}

module.exports = {
  addClient,
  pushToUser,
  createAndPush,
  getOnlineCount,
};
