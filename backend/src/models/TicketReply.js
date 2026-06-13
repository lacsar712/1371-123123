const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define(
    'TicketReply',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ticketId: { type: DataTypes.INTEGER, allowNull: false, field: 'ticket_id' },
      content: { type: DataTypes.TEXT, allowNull: false },
      replyerId: { type: DataTypes.INTEGER, allowNull: false, field: 'replyer_id' },
      replyerRole: { type: DataTypes.STRING(16), allowNull: false, field: 'replyer_role', comment: 'student / teacher / admin' },
      replyerName: { type: DataTypes.STRING(64), allowNull: false, field: 'replyer_name' },
      createdAt: { type: DataTypes.DATE, field: 'created_at', defaultValue: DataTypes.NOW },
    },
    { tableName: 'ticket_reply', timestamps: false }
  );
};
