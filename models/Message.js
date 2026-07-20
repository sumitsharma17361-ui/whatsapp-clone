const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String }, // Text optional ho gaya kyuki sirf file bhi bhej sakte hain
  fileUrl: { type: String, default: null },   // File ka download link
  fileName: { type: String, default: null },  // File ka asli naam
  fileType: { type: String, default: null },  // image, video, audio, document etc.
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
