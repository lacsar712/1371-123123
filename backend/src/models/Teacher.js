const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Teacher',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      teacherNo: { type: DataTypes.STRING(32), allowNull: false, unique: true, field: 'teacher_no' },
      name: { type: DataTypes.STRING(64), allowNull: false },
      passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    },
    { tableName: 'teacher', timestamps: false }
  );
};
