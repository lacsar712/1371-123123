const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'ForumPost',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false, comment: '富文本正文' },
      authorId: { type: DataTypes.INTEGER, allowNull: false, field: 'author_id' },
      authorRole: { type: DataTypes.STRING(16), allowNull: false, field: 'author_role', comment: 'student / teacher / admin' },
      authorName: { type: DataTypes.STRING(64), allowNull: false, field: 'author_name' },
      courseId: { type: DataTypes.INTEGER, allowNull: true, field: 'course_id', comment: '可选归属课程' },
      viewCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'view_count' },
      likeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'like_count' },
      commentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'comment_count' },
      isPinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_pinned' },
      isRemoved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_removed', comment: '管理员下架标记' },
      createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
      lastActiveAt: { type: DataTypes.DATE, field: 'last_active_at', defaultValue: DataTypes.NOW, comment: '最近评论时间，用于排序' },
    },
    { tableName: 'forum_post', timestamps: false }
  );
};
