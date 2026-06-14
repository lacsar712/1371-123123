const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'StudentBadge',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      badgeId: { type: DataTypes.INTEGER, allowNull: false, field: 'badge_id' },
      earnedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'earned_at' },
    },
    {
      tableName: 'student_badge',
      timestamps: false,
      indexes: [
        { unique: true, fields: ['student_id', 'badge_id'] },
      ],
    }
  );
};
