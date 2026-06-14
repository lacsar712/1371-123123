const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { Op, literal } = require('sequelize');
const router = express.Router();
const { ForumPost, ForumComment, ForumPostLike, Course, sequelize } = require('../models');
const logger = require('../logger');

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(body));
}

const SORT_OPTIONS = ['latest', 'hottest', 'active'];

// ========== 帖子相关接口 ==========

// 创建帖子
const createPostValidators = [
  body('title').trim().notEmpty().withMessage('标题不能为空').isLength({ max: 200 }).withMessage('标题不能超过200字'),
  body('content').trim().notEmpty().withMessage('正文不能为空'),
  body('authorId').isInt({ min: 1 }).withMessage('无效的作者ID'),
  body('authorRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的作者角色'),
  body('authorName').trim().notEmpty().withMessage('作者姓名不能为空'),
  body('courseId').optional().isInt({ min: 1 }).withMessage('无效的课程ID'),
];

router.post('/posts', createPostValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const { title, content, authorId, authorRole, authorName, courseId } = req.body;
  try {
    if (courseId) {
      const course = await Course.findByPk(courseId);
      if (!course) {
        return sendJson(res, 404, { ok: false, message: '课程不存在' });
      }
    }
    const post = await ForumPost.create({
      title: title.trim(),
      content: content.trim(),
      authorId,
      authorRole,
      authorName: authorName.trim(),
      courseId: courseId || null,
    });
    return sendJson(res, 201, { ok: true, data: post.toJSON() });
  } catch (e) {
    logger.error('Create forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 删除自己的帖子
router.delete('/posts/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { userId, userRole } = req.body || {};
  try {
    const post = await ForumPost.findByPk(id);
    if (!post) {
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    if (post.isRemoved) {
      return sendJson(res, 400, { ok: false, message: '帖子已被下架' });
    }
    if (!userId || !userRole || post.authorId !== parseInt(userId, 10) || post.authorRole !== userRole) {
      return sendJson(res, 403, { ok: false, message: '无权删除该帖子' });
    }
    await post.destroy();
    return sendJson(res, 200, { ok: true, message: '删除成功' });
  } catch (e) {
    logger.error('Delete forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 帖子点赞/取消点赞
router.post('/posts/:id/like', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { userId, userRole } = req.body || {};
  if (!userId || !userRole) {
    return sendJson(res, 400, { ok: false, message: '缺少用户信息' });
  }
  const t = await sequelize.transaction();
  try {
    const post = await ForumPost.findByPk(id, { transaction: t });
    if (!post) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    if (post.isRemoved) {
      await t.rollback();
      return sendJson(res, 400, { ok: false, message: '帖子已被下架' });
    }
    const existing = await ForumPostLike.findOne({
      where: { postId: id, userId: parseInt(userId, 10), userRole },
      transaction: t,
    });
    let liked;
    if (existing) {
      await existing.destroy({ transaction: t });
      await post.decrement('likeCount', { transaction: t });
      liked = false;
    } else {
      await ForumPostLike.create({
        postId: id,
        userId: parseInt(userId, 10),
        userRole,
      }, { transaction: t });
      await post.increment('likeCount', { transaction: t });
      liked = true;
    }
    await t.commit();
    const updated = await ForumPost.findByPk(id);
    return sendJson(res, 200, { ok: true, data: { liked, likeCount: updated ? updated.likeCount : post.likeCount } });
  } catch (e) {
    await t.rollback();
    logger.error('Like forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 查询点赞状态
router.get('/posts/:id/like-status', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { userId, userRole } = req.query;
  try {
    const post = await ForumPost.findByPk(id);
    if (!post) {
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    let liked = false;
    if (userId && userRole) {
      const existing = await ForumPostLike.findOne({
        where: { postId: id, userId: parseInt(userId, 10), userRole },
      });
      liked = !!existing;
    }
    return sendJson(res, 200, { ok: true, data: { liked, likeCount: post.likeCount } });
  } catch (e) {
    logger.error('Get like status error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 帖子详情
router.get('/posts/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const t = await sequelize.transaction();
  try {
    const post = await ForumPost.findByPk(id, {
      include: [{ model: Course, as: 'course', attributes: ['id', 'name', 'code'] }],
      transaction: t,
    });
    if (!post) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    if (post.isRemoved) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '帖子不存在或已被下架' });
    }
    await post.increment('viewCount', { transaction: t });
    await t.commit();
    const updated = await ForumPost.findByPk(id, {
      include: [{ model: Course, as: 'course', attributes: ['id', 'name', 'code'] }],
    });
    return sendJson(res, 200, { ok: true, data: updated.toJSON() });
  } catch (e) {
    await t.rollback();
    logger.error('Get forum post detail error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 帖子分页列表
const listPostValidators = [
  query('page').optional().isInt({ min: 1 }).withMessage('页码必须为正整数'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('每页数量必须在1-100之间'),
  query('courseId').optional().isInt({ min: 1 }).withMessage('无效的课程ID'),
  query('keyword').optional().trim(),
  query('sort').optional().isIn(SORT_OPTIONS).withMessage('无效的排序方式'),
];

router.get('/posts', listPostValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const { courseId, keyword } = req.query;
  const sort = req.query.sort || 'active';

  try {
    const where = { isRemoved: false };
    if (courseId) where.courseId = parseInt(courseId, 10);
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { content: { [Op.like]: `%${keyword}%` } },
      ];
    }

    let order;
    if (sort === 'latest') {
      order = [
        ['isPinned', 'DESC'],
        ['createdAt', 'DESC'],
      ];
    } else if (sort === 'hottest') {
      order = [
        ['isPinned', 'DESC'],
        ['likeCount', 'DESC'],
        ['commentCount', 'DESC'],
        ['createdAt', 'DESC'],
      ];
    } else {
      order = [
        ['isPinned', 'DESC'],
        ['lastActiveAt', 'DESC'],
      ];
    }

    const { count, rows } = await ForumPost.findAndCountAll({
      where,
      include: [{ model: Course, as: 'course', attributes: ['id', 'name', 'code'] }],
      order,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        list: rows.map((r) => r.toJSON()),
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (e) {
    logger.error('List forum posts error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 评论相关接口 ==========

// 新增评论
const createCommentValidators = [
  body('content').trim().notEmpty().withMessage('评论内容不能为空'),
  body('authorId').isInt({ min: 1 }).withMessage('无效的作者ID'),
  body('authorRole').isIn(['student', 'teacher', 'admin']).withMessage('无效的作者角色'),
  body('authorName').trim().notEmpty().withMessage('作者姓名不能为空'),
  body('parentId').optional().isInt({ min: 1 }).withMessage('无效的父评论ID'),
  body('replyToId').optional().isInt({ min: 1 }).withMessage('无效的回复目标ID'),
  body('replyToName').optional().trim(),
];

router.post('/posts/:id/comments', param('id').isInt({ min: 1 }), createCommentValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const postId = parseInt(req.params.id, 10);
  const { content, authorId, authorRole, authorName, parentId, replyToId, replyToName } = req.body;
  const t = await sequelize.transaction();
  try {
    const post = await ForumPost.findByPk(postId, { transaction: t });
    if (!post) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    if (post.isRemoved) {
      await t.rollback();
      return sendJson(res, 400, { ok: false, message: '帖子已被下架，无法评论' });
    }

    let effectiveParentId = null;
    let effectiveReplyToId = null;
    let effectiveReplyToName = null;

    if (parentId) {
      const parent = await ForumComment.findByPk(parseInt(parentId, 10), { transaction: t });
      if (!parent || parent.postId !== postId) {
        await t.rollback();
        return sendJson(res, 404, { ok: false, message: '父评论不存在' });
      }
      if (parent.parentId) {
        effectiveParentId = parent.parentId;
        effectiveReplyToId = parent.id;
        effectiveReplyToName = parent.authorName;
      } else {
        effectiveParentId = parent.id;
        if (replyToId) {
          const replyTo = await ForumComment.findByPk(parseInt(replyToId, 10), { transaction: t });
          if (replyTo && replyTo.postId === postId && replyTo.parentId === parent.id) {
            effectiveReplyToId = replyTo.id;
            effectiveReplyToName = replyTo.authorName;
          }
        } else {
          effectiveReplyToName = parent.authorName;
        }
      }
    }

    if (replyToName) {
      effectiveReplyToName = replyToName;
    }

    const comment = await ForumComment.create({
      postId,
      content: content.trim(),
      authorId,
      authorRole,
      authorName: authorName.trim(),
      parentId: effectiveParentId,
      replyToId: effectiveReplyToId,
      replyToName: effectiveReplyToName,
    }, { transaction: t });

    await post.increment('commentCount', { transaction: t });
    await ForumPost.update({ lastActiveAt: new Date() }, { where: { id: postId }, transaction: t });

    await t.commit();
    return sendJson(res, 201, { ok: true, data: comment.toJSON() });
  } catch (e) {
    await t.rollback();
    logger.error('Create forum comment error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 删除自己的评论
router.delete('/comments/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { userId, userRole } = req.body || {};
  const t = await sequelize.transaction();
  try {
    const comment = await ForumComment.findByPk(id, { transaction: t });
    if (!comment) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '评论不存在' });
    }
    if (comment.isRemoved) {
      await t.rollback();
      return sendJson(res, 400, { ok: false, message: '评论已被下架' });
    }
    if (!userId || !userRole || comment.authorId !== parseInt(userId, 10) || comment.authorRole !== userRole) {
      await t.rollback();
      return sendJson(res, 403, { ok: false, message: '无权删除该评论' });
    }
    const postId = comment.postId;
    await comment.destroy({ transaction: t });
    await ForumPost.decrement('commentCount', { where: { id: postId }, transaction: t });
    await t.commit();
    return sendJson(res, 200, { ok: true, message: '删除成功' });
  } catch (e) {
    await t.rollback();
    logger.error('Delete forum comment error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 获取帖子评论树
router.get('/posts/:id/comments', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const postId = parseInt(req.params.id, 10);
  try {
    const post = await ForumPost.findByPk(postId);
    if (!post) {
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    const comments = await ForumComment.findAll({
      where: { postId, isRemoved: false },
      order: [['createdAt', 'ASC']],
    });

    const commentMap = {};
    const roots = [];
    comments.forEach((c) => {
      const json = c.toJSON();
      json.replies = [];
      commentMap[json.id] = json;
    });
    comments.forEach((c) => {
      const json = commentMap[c.id];
      if (c.parentId && commentMap[c.parentId]) {
        commentMap[c.parentId].replies.push(json);
      } else if (!c.parentId) {
        roots.push(json);
      }
    });

    return sendJson(res, 200, { ok: true, data: roots });
  } catch (e) {
    logger.error('Get forum comments error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// ========== 管理员接口 ==========

// 管理员查看所有帖子
router.get('/admin/posts', listPostValidators, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const { courseId, keyword, status } = req.query;
  const sort = req.query.sort || 'active';

  try {
    const where = {};
    if (courseId) where.courseId = parseInt(courseId, 10);
    if (status === 'normal') where.isRemoved = false;
    if (status === 'removed') where.isRemoved = true;
    if (keyword) {
      where[Op.or] = [
        { title: { [Op.like]: `%${keyword}%` } },
        { content: { [Op.like]: `%${keyword}%` } },
      ];
    }

    let order;
    if (sort === 'latest') {
      order = [['isPinned', 'DESC'], ['createdAt', 'DESC']];
    } else if (sort === 'hottest') {
      order = [['isPinned', 'DESC'], ['likeCount', 'DESC'], ['commentCount', 'DESC'], ['createdAt', 'DESC']];
    } else {
      order = [['isPinned', 'DESC'], ['lastActiveAt', 'DESC']];
    }

    const { count, rows } = await ForumPost.findAndCountAll({
      where,
      include: [{ model: Course, as: 'course', attributes: ['id', 'name', 'code'] }],
      order,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        list: rows.map((r) => r.toJSON()),
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (e) {
    logger.error('Admin list forum posts error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员查看所有评论
router.get('/admin/comments', [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
  query('postId').optional().isInt({ min: 1 }),
  query('status').optional().isIn(['normal', 'removed']),
  query('keyword').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 20;
  const { postId, status, keyword } = req.query;

  try {
    const where = {};
    if (postId) where.postId = parseInt(postId, 10);
    if (status === 'normal') where.isRemoved = false;
    if (status === 'removed') where.isRemoved = true;
    if (keyword) {
      where.content = { [Op.like]: `%${keyword}%` };
    }

    const { count, rows } = await ForumComment.findAndCountAll({
      where,
      include: [{ model: ForumPost, as: 'post', attributes: ['id', 'title'] }],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    return sendJson(res, 200, {
      ok: true,
      data: {
        list: rows.map((r) => r.toJSON()),
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (e) {
    logger.error('Admin list forum comments error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员下架帖子
router.put('/admin/posts/:id/remove', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  try {
    const post = await ForumPost.findByPk(id);
    if (!post) {
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    await post.update({ isRemoved: true });
    return sendJson(res, 200, { ok: true, message: '已下架', data: post.toJSON() });
  } catch (e) {
    logger.error('Admin remove forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员恢复帖子
router.put('/admin/posts/:id/restore', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  try {
    const post = await ForumPost.findByPk(id);
    if (!post) {
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    await post.update({ isRemoved: false });
    return sendJson(res, 200, { ok: true, message: '已恢复', data: post.toJSON() });
  } catch (e) {
    logger.error('Admin restore forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员置顶/取消置顶
router.put('/admin/posts/:id/pin', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const { isPinned } = req.body || {};
  try {
    const post = await ForumPost.findByPk(id);
    if (!post) {
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    const newPinned = typeof isPinned === 'boolean' ? isPinned : !post.isPinned;
    await post.update({ isPinned: newPinned });
    return sendJson(res, 200, { ok: true, message: newPinned ? '已置顶' : '已取消置顶', data: post.toJSON() });
  } catch (e) {
    logger.error('Admin pin forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员永久删除帖子
router.delete('/admin/posts/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const t = await sequelize.transaction();
  try {
    const post = await ForumPost.findByPk(id, { transaction: t });
    if (!post) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '帖子不存在' });
    }
    await ForumComment.destroy({ where: { postId: id }, transaction: t });
    await ForumPostLike.destroy({ where: { postId: id }, transaction: t });
    await post.destroy({ transaction: t });
    await t.commit();
    return sendJson(res, 200, { ok: true, message: '永久删除成功' });
  } catch (e) {
    await t.rollback();
    logger.error('Admin delete forum post error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员下架评论
router.put('/admin/comments/:id/remove', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const t = await sequelize.transaction();
  try {
    const comment = await ForumComment.findByPk(id, { transaction: t });
    if (!comment) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '评论不存在' });
    }
    await comment.update({ isRemoved: true }, { transaction: t });
    await ForumPost.decrement('commentCount', { where: { id: comment.postId }, transaction: t });
    await t.commit();
    return sendJson(res, 200, { ok: true, message: '已下架' });
  } catch (e) {
    await t.rollback();
    logger.error('Admin remove forum comment error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

// 管理员永久删除评论
router.delete('/admin/comments/:id', param('id').isInt({ min: 1 }), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendJson(res, 400, { ok: false, message: errors.array()[0].msg });
  }
  const id = parseInt(req.params.id, 10);
  const t = await sequelize.transaction();
  try {
    const comment = await ForumComment.findByPk(id, { transaction: t });
    if (!comment) {
      await t.rollback();
      return sendJson(res, 404, { ok: false, message: '评论不存在' });
    }
    const postId = comment.postId;
    await ForumComment.destroy({ where: { id, parentId: id }, transaction: t });
    await ForumPost.decrement('commentCount', { where: { id: postId }, transaction: t });
    await t.commit();
    return sendJson(res, 200, { ok: true, message: '永久删除成功' });
  } catch (e) {
    await t.rollback();
    logger.error('Admin delete forum comment error', { error: e.message });
    return sendJson(res, 500, { ok: false, message: '服务器错误' });
  }
});

module.exports = router;
