const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'Badge',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(256), allowNull: false },
      icon: { type: DataTypes.STRING(64), allowNull: false },
      color: { type: DataTypes.STRING(16), allowNull: false, defaultValue: '#6366f1' },
      ruleType: { type: DataTypes.STRING(32), allowNull: false, field: 'rule_type' },
      ruleConfig: { type: DataTypes.TEXT, allowNull: true, field: 'rule_config' },
      points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 10 },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'created_at' },
    },
    { tableName: 'badge', timestamps: false }
  );
};
