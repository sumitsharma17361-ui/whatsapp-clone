// ============================================================
// BM GROUP CHAT PORTAL — FULL BACKEND (Single File)
// Production Ready for Render + MongoDB Atlas
// ============================================================

// ============================================================
// 🔥 DOTENV — MUST BE FIRST LINE (before any process.env usage)
// ============================================================
require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');

// ============================================================
// CONFIG — from environment variables
// ============================================================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'bm_chat_fallback_secret_2026';

// 🔍 Debug logs (start me dikhega)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔧 ENVIRONMENT CHECK');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('PORT:', PORT);
console.log('MONGO_URI:', MONGO_URI ? '✅ SET (' + MONGO_URI.substring(0, 40) + '...)' : '❌ NOT SET');
console.log('JWT_SECRET:', JWT_SECRET ? '✅ SET (' + JWT_SECRET.substring(0, 15) + '...)' : '❌ NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!MONGO_URI) {
  console.error('❌ FATAL: MONGO_URI is not set in environment variables!');
  console.error('👉 Render Dashboard → Environment → Add MONGO_URI');
  process.exit(1);
}

// ============================================================
// UPLOADS DIRECTORY
// ============================================================
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log('📁 Created uploads directory:', UPLOAD_DIR);
}

// ============================================================
// EXPRESS + SOCKET.IO SETUP
// ============================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50 * 1024 * 1024 // 50MB
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ============================================================
// MONGODB CONNECT
// ============================================================
console.log('🔌 Connecting to MongoDB...');
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000
})
.then(() => {
  console.log('✅ ✅ ✅ MongoDB CONNECTED SUCCESSFULLY ✅ ✅ ✅');
})
.catch(err => {
  console.error('❌ MongoDB connection FAILED:', err.message);
  console.error('👉 Check: MONGO_URI, IP whitelist (0.0.0.0/0), username/password');
  process.exit(1);
});

mongoose.connection.on('connected', () => console.log('🟢 Mongoose connected'));
mongoose.connection.on('error', (err) => console.error('🔴 Mongoose error:', err.message));
mongoose.connection.on('disconnected', () => console.warn('🟡 Mongoose disconnected'));

// ============================================================
// SCHEMAS & MODELS
// ============================================================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  rollNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'faculty', 'admin'], default: 'student' },
  branch: { type: String, default: 'CSE' },
  profilePic: { type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  onesignalId: { type: String, default: null }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  fileType: { type: String, default: null },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
  reaction: { type: String, default: '' },
  replyTo: { type: String, default: null },
  isEncrypted: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const groupMessageSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  fileUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  fileType: { type: String, default: null },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const statusSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mediaUrl: { type: String, default: '' },
  mediaType: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
  text: { type: String, default: '' },
  bgColor: { type: String, default: '#2563eb' },
  viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now, expires: 86400 }
}, { timestamps: true });

const callLogSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  callType: { type: String, enum: ['audio', 'video'], default: 'audio' },
  direction: { type: String, enum: ['incoming', 'outgoing', 'missed'], default: 'outgoing' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const Group = mongoose.model('Group', groupSchema);
const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);
const Status = mongoose.model('Status', statusSchema);
const CallLog = mongoose.model('CallLog', callLogSchema);

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/register', async (req, res) => {
  try {
    const { rollNo, password, name, role, branch } = req.body;
    if (!rollNo || !password || !name) {
      return res.status(400).json({ error: 'Roll No, Name and Password required' });
    }
    const cleanRoll = rollNo.trim().toUpperCase();
    const existing = await User.findOne({ rollNo: cleanRoll });
    if (existing) return res.status(400).json({ error: 'Roll No already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      rollNo: cleanRoll,
      password: hashed,
      role: role || 'student',
      branch: branch || 'CSE'
    });

    console.log(`✅ New user registered: ${cleanRoll} (${user.name})`);
    res.json({ message: 'Registered successfully', userId: user._id });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { rollNo, password } = req.body;
    if (!rollNo || !password) return res.status(400).json({ error: 'Roll No and Password required' });

    const cleanRoll = rollNo.trim().toUpperCase();
    const user = await User.findOne({ rollNo: cleanRoll });
    if (!user) return res.status(400).json({ error: 'Roll No not registered' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '30d' });

    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    console.log(`🔐 Login: ${cleanRoll}`);
    res.json({
      token,
      userId: user._id,
      rollNo: user.rollNo,
      name: user.name,
      role: user.role,
      branch: user.branch,
      profilePic: user.profilePic
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/change-password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password too short (min 6)' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ error: 'Current password incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profile-pic', authMiddleware, async (req, res) => {
  try {
    const { profilePic } = req.body;
    if (!profilePic) return res.status(400).json({ error: 'No image provided' });
    await User.findByIdAndUpdate(req.userId, { profilePic });
    res.json({ message: 'Profile pic updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate('friends', 'name rollNo profilePic isOnline lastSeen role branch')
      .populate('friendRequests', 'name rollNo profilePic role branch');

    const groups = await Group.find({ members: req.userId }).select('name admin members');

    res.json({
      friends: user.friends || [],
      friendRequests: user.friendRequests || [],
      groups: groups || []
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FRIENDS
// ============================================================
app.post('/api/friend-request', authMiddleware, async (req, res) => {
  try {
    const { targetRollNo } = req.body;
    if (!targetRollNo) return res.status(400).json({ error: 'Roll No required' });

    const target = await User.findOne({ rollNo: targetRollNo.trim().toUpperCase() });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (String(target._id) === String(req.userId)) return res.status(400).json({ error: 'Cannot add yourself' });

    const me = await User.findById(req.userId);
    if (me.friends.includes(target._id)) return res.status(400).json({ error: 'Already friends' });
    if (target.friendRequests.includes(req.userId)) return res.status(400).json({ error: 'Request already sent' });

    target.friendRequests.push(req.userId);
    await target.save();

    const targetSocketId = userSockets.get(String(target._id));
    if (targetSocketId) io.to(targetSocketId).emit('incomingFriendRequest');

    res.json({ message: `Friend request sent to ${target.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accept-request', authMiddleware, async (req, res) => {
  try {
    const { requesterId } = req.body;
    if (!requesterId) return res.status(400).json({ error: 'Requester ID required' });

    const me = await User.findById(req.userId);
    const requester = await User.findById(requesterId);
    if (!requester) return res.status(404).json({ error: 'Requester not found' });

    if (!me.friends.includes(requester._id)) me.friends.push(requester._id);
    if (!requester.friends.includes(me._id)) requester.friends.push(me._id);

    me.friendRequests = me.friendRequests.filter(id => String(id) !== String(requesterId));

    await me.save();
    await requester.save();

    const requesterSocketId = userSockets.get(String(requester._id));
    if (requesterSocketId) io.to(requesterSocketId).emit('groupUpdated');

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/friend/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    const me = await User.findById(req.userId);
    const friend = await User.findById(friendId);

    me.friends = me.friends.filter(id => String(id) !== String(friendId));
    await me.save();

    if (friend) {
      friend.friends = friend.friends.filter(id => String(id) !== String(req.userId));
      await friend.save();
    }

    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MESSAGES
// ============================================================
app.get('/api/messages/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: req.userId, receiver: friendId },
        { sender: friendId, receiver: req.userId }
      ]
    })
      .populate('sender', 'name rollNo profilePic')
      .populate('receiver', 'name rollNo profilePic')
      .sort({ timestamp: 1 })
      .limit(500);

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages/clear/:friendId', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.params;
    await Message.deleteMany({
      $or: [
        { sender: req.userId, receiver: friendId },
        { sender: friendId, receiver: req.userId }
      ]
    });
    res.json({ message: 'Chat cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FILE UPLOAD
// ============================================================
app.post('/api/upload', authMiddleware, async (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) return res.status(400).json({ error: 'fileName and fileData required' });

    const matches = fileData.match(/^data:(.+?);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid file format' });

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = (fileName.split('.').pop() || 'bin').toLowerCase();
    const safeName = `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeName);

    fs.writeFileSync(filePath, buffer);
    const fileUrl = `/uploads/${safeName}`;

    res.json({ fileUrl, mimeType });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// STATUS
// ============================================================
app.get('/api/status', authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.userId);
    const friendIds = me.friends;

    const statuses = await Status.find({
      user: { $in: [...friendIds, req.userId] }
    })
      .populate('user', 'name rollNo profilePic')
      .populate('viewers', 'name rollNo profilePic')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/status', authMiddleware, async (req, res) => {
  try {
    const { mediaType, mediaUrl, text, bgColor } = req.body;
    const status = await Status.create({
      user: req.userId,
      mediaType: mediaType || 'text',
      mediaUrl: mediaUrl || '',
      text: text || '',
      bgColor: bgColor || '#2563eb'
    });

    const me = await User.findById(req.userId);
    me.friends.forEach(fid => {
      const sid = userSockets.get(String(fid));
      if (sid) io.to(sid).emit('statusUpdated');
    });

    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/status/view/:id', authMiddleware, async (req, res) => {
  try {
    await Status.findByIdAndUpdate(req.params.id, {
      $addToSet: { viewers: req.userId }
    });
    res.json({ message: 'Viewed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/status/:id', authMiddleware, async (req, res) => {
  try {
    const status = await Status.findById(req.params.id);
    if (!status) return res.status(404).json({ error: 'Not found' });
    if (String(status.user) !== String(req.userId)) return res.status(403).json({ error: 'Not yours' });

    await Status.findByIdAndDelete(req.params.id);
    res.json({ message: 'Status deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CALL LOGS
// ============================================================
app.get('/api/calls', authMiddleware, async (req, res) => {
  try {
    const logs = await CallLog.find({
      $or: [{ caller: req.userId }, { receiver: req.userId }]
    })
      .populate('caller', 'name rollNo profilePic')
      .populate('receiver', 'name rollNo profilePic')
      .sort({ timestamp: -1 })
      .limit(100);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/calls/clear', authMiddleware, async (req, res) => {
  try {
    await CallLog.deleteMany({
      $or: [{ caller: req.userId }, { receiver: req.userId }]
    });
    res.json({ message: 'Call logs cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GROUPS
// ============================================================
app.post('/api/groups/create', authMiddleware, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Group name required' });

    const members = [req.userId, ...(memberIds || []).filter(id => String(id) !== String(req.userId))];
    const group = await Group.create({
      name,
      admin: req.userId,
      members
    });

    members.forEach(mid => {
      const sid = userSockets.get(String(mid));
      if (sid) io.to(sid).emit('groupUpdated');
    });

    res.json({ message: 'Group created', group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups/messages/:groupId', authMiddleware, async (req, res) => {
  try {
    const messages = await GroupMessage.find({ group: req.params.groupId })
      .populate('sender', 'name rollNo profilePic')
      .sort({ timestamp: 1 })
      .limit(500);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/groups/details/:groupId', authMiddleware, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('admin', 'name rollNo')
      .populate('members', 'name rollNo profilePic');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups/add-member', authMiddleware, async (req, res) => {
  try {
    const { groupId, rollNo } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (String(group.admin) !== String(req.userId)) return res.status(403).json({ error: 'Only admin can add' });

    const user = await User.findOne({ rollNo: rollNo.trim().toUpperCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (group.members.includes(user._id)) return res.status(400).json({ error: 'Already a member' });

    group.members.push(user._id);
    await group.save();

    group.members.forEach(mid => {
      const sid = userSockets.get(String(mid));
      if (sid) io.to(sid).emit('groupUpdated');
    });

    res.json({ message: 'Member added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups/remove-member', authMiddleware, async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (String(group.admin) !== String(req.userId)) return res.status(403).json({ error: 'Only admin can remove' });

    group.members = group.members.filter(m => String(m) !== String(memberId));
    await group.save();

    group.members.forEach(mid => {
      const sid = userSockets.get(String(mid));
      if (sid) io.to(sid).emit('groupUpdated');
    });

    res.json({ message: 'Member removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (String(group.admin) !== String(req.userId)) return res.status(403).json({ error: 'Only admin can delete' });

    const memberIds = group.members.slice();
    await Group.findByIdAndDelete(req.params.groupId);
    await GroupMessage.deleteMany({ group: req.params.groupId });

    memberIds.forEach(mid => {
      const sid = userSockets.get(String(mid));
      if (sid) io.to(sid).emit('groupUpdated');
    });

    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SOCKET.IO — REALTIME
// ============================================================
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('identify', async ({ userId, subscriptionId }) => {
    if (!userId) return;
    userSockets.set(String(userId), socket.id);
    socket.userId = String(userId);

    try {
      const update = { isOnline: true, lastSeen: new Date() };
      if (subscriptionId) update.onesignalId = subscriptionId;
      await User.findByIdAndUpdate(userId, update);

      const user = await User.findById(userId).populate('friends', '_id');
      (user.friends || []).forEach(f => {
        const sid = userSockets.get(String(f._id));
        if (sid) io.to(sid).emit('statusChanged', { userId, isOnline: true, lastSeen: new Date() });
      });
    } catch (e) { console.warn('identify error:', e.message); }
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { senderId, receiverId, text, fileUrl, fileName, fileType, timestamp, isEncrypted, replyTo } = data;

      const msg = await Message.create({
        sender: senderId,
        receiver: receiverId,
        text: text || '',
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        status: 'sent',
        replyTo: replyTo || null,
        isEncrypted: !!isEncrypted,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      });

      const populated = await Message.findById(msg._id)
        .populate('sender', 'name rollNo profilePic')
        .populate('receiver', 'name rollNo profilePic');

      const senderSocket = userSockets.get(String(senderId));
      const receiverSocket = userSockets.get(String(receiverId));

      if (senderSocket) io.to(senderSocket).emit('receiveMessage', populated);
      if (receiverSocket && receiverSocket !== senderSocket) {
        io.to(receiverSocket).emit('receiveMessage', populated);
      }
    } catch (err) {
      console.error('sendMessage error:', err.message);
      socket.emit('errorMessage', { error: 'Failed to send message' });
    }
  });

  socket.on('sendGroupMessage', async (data) => {
    try {
      const { groupId, senderId, text, fileUrl, fileName, fileType } = data;

      const msg = await GroupMessage.create({
        group: groupId,
        sender: senderId,
        text: text || '',
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null
      });

      const populated = await GroupMessage.findById(msg._id)
        .populate('sender', 'name rollNo profilePic');

      const group = await Group.findById(groupId).select('members');
      if (group) {
        group.members.forEach(mid => {
          const sid = userSockets.get(String(mid));
          if (sid) io.to(sid).emit('receiveGroupMessage', populated);
        });
      }
    } catch (err) {
      console.error('sendGroupMessage error:', err.message);
    }
  });

  socket.on('joinGroup', (groupId) => {
    if (groupId) socket.join(`group_${groupId}`);
  });

  socket.on('typing', ({ receiverId, isTyping }) => {
    const sid = userSockets.get(String(receiverId));
    if (sid) io.to(sid).emit('typingEmit', { senderId: socket.userId, isTyping });
  });

  socket.on('reactionEmit', async ({ msgId, emoji, receiverId }) => {
    try {
      await Message.findByIdAndUpdate(msgId, { reaction: emoji });
      const sid = userSockets.get(String(receiverId));
      if (sid) io.to(sid).emit('reactionReceived', { msgId, emoji });
    } catch (e) {}
  });

  socket.on('deleteMsgEmit', async ({ msgId, receiverId }) => {
    try {
      await Message.findByIdAndDelete(msgId);
      const sid = userSockets.get(String(receiverId));
      if (sid) io.to(sid).emit('msgDeleted', { msgId });
      socket.emit('msgDeleted', { msgId });
    } catch (e) {}
  });

  socket.on('clearChatEmit', ({ receiverId }) => {
    const sid = userSockets.get(String(receiverId));
    if (sid) io.to(sid).emit('chatClearedEvent');
  });

  socket.on('readEmit', async ({ msgId, senderId }) => {
    try {
      await Message.findByIdAndUpdate(msgId, { status: 'read' });
      const sid = userSockets.get(String(senderId));
      if (sid) io.to(sid).emit('reactionReceived', { msgId, emoji: '✓✓' });
    } catch (e) {}
  });

  socket.on('disconnect', async () => {
    console.log('❌ Socket disconnected:', socket.id);
    if (socket.userId) {
      userSockets.delete(socket.userId);
      try {
        await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen: new Date() });
        const user = await User.findById(socket.userId).populate('friends', '_id');
        (user?.friends || []).forEach(f => {
          const sid = userSockets.get(String(f._id));
          if (sid) io.to(sid).emit('statusChanged', { userId: socket.userId, isOnline: false, lastSeen: new Date() });
        });
      } catch (e) {}
    }
  });
});

// ============================================================
// FALLBACK — serve index.html for all other routes
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// ERROR HANDLERS
// ============================================================
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err.message);
});

// ============================================================
// START SERVER
// ============================================================
server.listen(PORT, '0.0.0.0', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 BM Chat server running on port ${PORT}`);
  console.log(`📁 Uploads: ${UPLOAD_DIR}`);
  console.log(`🔐 JWT: ${JWT_SECRET.substring(0, 15)}...`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
