const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'PointRecord',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentId: { type: DataTypes.INTEGER, allowNull: false, field: 'student_id' },
      action: { type: DataTypes.STRING(64), allowNull: false },
      actionDetail: { type: DataTypes.STRING(256), allowNull: true, field: 'action_detail' },
      points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    {
      tableName: 'point_record',
      timestamps: false,
      indexes: [
        { fields: ['student_id'] },
        { fields: ['created_at'] },
      ],
    }
  );
};
