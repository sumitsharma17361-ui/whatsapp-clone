const mongoose = require('mongoose');

const statusSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mediaUrl: { type: String, default: '' },
  mediaType: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
  text: { type: String, default: '' },
  bgColor: { type: String, default: '#00a884' },
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours
});

module.exports = mongoose.model('Status', statusSchema);
