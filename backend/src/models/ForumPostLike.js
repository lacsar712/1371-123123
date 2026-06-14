const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'ForumPostLike',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      postId: { type: DataTypes.INTEGER, allowNull: false, field: 'post_id' },
      userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
      userRole: { type: DataTypes.STRING(16), allowNull: false, field: 'user_role', comment: 'student / teacher / admin' },
      createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
    },
    { tableName: 'forum_post_like', timestamps: false, indexes: [{ unique: true, fields: ['post_id', 'user_id', 'user_role'] }] }
  );
};
