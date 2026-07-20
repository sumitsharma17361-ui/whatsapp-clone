const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isOnline: { type: Boolean, default: false },
  profilePic: { type: String, default: "" }, // Base64 data ya link
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
