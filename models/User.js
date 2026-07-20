const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  phoneNumber: { type: String, unique: true, sparse: true }, // Mobile number login support
  password: { type: String, required: true },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isOnline: { type: Boolean, default: false },
  profilePic: { type: String, default: "" },
  lastSeen: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
