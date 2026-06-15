const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Student',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      studentNo: { type: DataTypes.STRING(32), allowNull: false, unique: true, field: 'student_no' },
      name: { type: DataTypes.STRING(64), allowNull: false },
      passwordHash: { type: DataTypes.STRING(64), allowNull: false, field: 'password_hash' },
      major: { type: DataTypes.STRING(64), allowNull: true },
      enrollmentYear: { type: DataTypes.INTEGER, allowNull: true, field: 'enrollment_year' },
    },
    { tableName: 'student' }
  );
};
