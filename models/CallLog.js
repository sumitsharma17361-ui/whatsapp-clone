const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
  direction: { type: String, enum: ['incoming', 'outgoing', 'missed'], default: 'outgoing' },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CallLog', callLogSchema);
