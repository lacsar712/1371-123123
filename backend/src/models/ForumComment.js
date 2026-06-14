const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'ForumComment',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      postId: { type: DataTypes.INTEGER, allowNull: false, field: 'post_id' },
      parentId: { type: DataTypes.INTEGER, allowNull: true, field: 'parent_id', comment: '父评论ID，null表示顶级评论' },
      replyToId: { type: DataTypes.INTEGER, allowNull: true, field: 'reply_to_id', comment: '回复的目标评论ID（仅二级评论使用）' },
      content: { type: DataTypes.TEXT, allowNull: false },
      authorId: { type: DataTypes.INTEGER, allowNull: false, field: 'author_id' },
      authorRole: { type: DataTypes.STRING(16), allowNull: false, field: 'author_role', comment: 'student / teacher / admin' },
      authorName: { type: DataTypes.STRING(64), allowNull: false, field: 'author_name' },
      replyToName: { type: DataTypes.STRING(64), allowNull: true, field: 'reply_to_name', comment: '被回复者姓名' },
      isRemoved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_removed', comment: '管理员下架标记' },
      createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
    },
    { tableName: 'forum_comment', timestamps: false }
  );
};
