const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'BackupRecord',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      type: { type: DataTypes.STRING(16), allowNull: false },
      mode: { type: DataTypes.STRING(16), allowNull: true },
      operator: { type: DataTypes.STRING(64), allowNull: false },
      fileName: { type: DataTypes.STRING(255), allowNull: true, field: 'file_name' },
      fileSize: { type: DataTypes.BIGINT, allowNull: true, field: 'file_size' },
      affectedRows: { type: DataTypes.TEXT, allowNull: true, field: 'affected_rows' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'success' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    { tableName: 'backup_record', timestamps: false }
  );
};
