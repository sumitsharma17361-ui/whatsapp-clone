const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://admin:admin@cluster0.abcde.mongodb.net/whatsapplite?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'SuperSecretJwtKey12345';

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.log('DB Connection Error:', err));

// Database Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: '' },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: String,
  fileUrl: String,
  fileName: String,
  fileType: String,
  timestamp: { type: Number, default: Date.now },
  isEncrypted: { type: Boolean, default: true },
  replyTo: String,
  status: { type: String, default: 'sent' }
});
const Message = mongoose.model('Message', messageSchema);

const statusSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  mediaType: { type: String, enum: ['text', 'image', 'video'], default: 'text' },
  mediaUrl: String,
  text: String,
  bgColor: { type: String, default: '#111b21' },
  createdAt: { type: Date, default: Date.now, expires: 86400 }
});
const Status = mongoose.model('Status', statusSchema);

const callLogSchema = new mongoose.Schema({
  caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  callType: { type: String, enum: ['audio', 'video'] },
  timestamp: { type: Date, default: Date.now }
});
const CallLog = mongoose.model('CallLog', callLogSchema);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// REST API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'All fields required' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already taken' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid username or password' });

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET);
    res.json({ token, userId: user._id, username: user.username, profilePic: user.profilePic });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Change Password Route
app.post('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Please provide old and new password' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'Password changed successfully!' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/profile-pic', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.userId, { profilePic: req.body.profilePic });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).populate('friends', 'username profilePic isOnline lastSeen').populate('friendRequests', 'username');
    res.json({ friends: user.friends, friendRequests: user.friendRequests });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/friend-request', authenticateToken, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    const target = await User.findOne({ username: targetUsername });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target._id.toString() === req.user.userId) return res.status(400).json({ error: 'Cannot add yourself' });
    if (target.friendRequests.includes(req.user.userId) || target.friends.includes(req.user.userId)) {
      return res.status(400).json({ error: 'Already sent request or already friends' });
    }
    target.friendRequests.push(req.user.userId);
    await target.save();
    io.to(target._id.toString()).emit('incomingFriendRequest');
    res.json({ message: 'Friend request sent!' });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/accept-request', authenticateToken, async (req, res) => {
  try {
    const { requesterId } = req.body;
    const currentUser = await User.findById(req.user.userId);
    const requester = await User.findById(requesterId);

    currentUser.friendRequests = currentUser.friendRequests.filter(id => id.toString() !== requesterId);
    currentUser.friends.push(requesterId);
    requester.friends.push(req.user.userId);

    await currentUser.save();
    await requester.save();
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/messages/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    const messages = await Message.find({
      $or: [
        { sender: req.user.userId, receiver: friendId },
        { sender: friendId, receiver: req.user.userId }
      ]
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/messages/clear/:friendId', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.params;
    await Message.deleteMany({
      $or: [
        { sender: req.user.userId, receiver: friendId },
        { sender: friendId, receiver: req.user.userId }
      ]
    });
    res.json({ message: 'Chat cleared successfully' });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/upload', authenticateToken, (req, res) => {
  try {
    const { fileData, fileName } = req.body;
    res.json({ fileUrl: fileData, fileName });
  } catch(e) { res.status(500).json({ error: 'Upload failed' }); }
});

app.get('/api/status', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const allowedUsers = [...user.friends, req.user.userId];
    const statuses = await Status.find({ user: { $in: allowedUsers } }).populate('user', 'username profilePic').sort({ createdAt: -1 });
    res.json(statuses);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/status', authenticateToken, async (req, res) => {
  try {
    const { mediaType, mediaUrl, text, bgColor } = req.body;
    const newStatus = new Status({ user: req.user.userId, mediaType, mediaUrl, text, bgColor });
    await newStatus.save();
    io.emit('statusUpdated');
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/status/:id', authenticateToken, async (req, res) => {
  try {
    await Status.findOneAndDelete({ _id: req.params.id, user: req.user.userId });
    io.emit('statusUpdated');
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/calls', authenticateToken, async (req, res) => {
  try {
    const logs = await CallLog.find({
      $or: [{ caller: req.user.userId }, { receiver: req.user.userId }]
    }).populate('caller receiver', 'username profilePic').sort({ timestamp: -1 }).limit(20);
    res.json(logs);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Socket.io Real-time Handling
const activeSockets = new Map();

io.on('connection', (socket) => {
  socket.on('identify', async (userId) => {
    activeSockets.set(userId, socket.id);
    socket.userId = userId;
    await User.findByIdAndUpdate(userId, { isOnline: true });
    io.emit('statusChanged', { userId, isOnline: true });
  });

  socket.on('sendMessage', async (data) => {
    try {
      const msg = new Message({
        sender: data.senderId,
        receiver: data.receiverId,
        text: data.text,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileType: data.fileType,
        timestamp: data.timestamp || Date.now(),
        isEncrypted: data.isEncrypted,
        replyTo: data.replyTo,
        status: activeSockets.has(data.receiverId) ? 'delivered' : 'sent'
      });
      await msg.save();

      io.to(activeSockets.get(data.receiverId)).emit('receiveMessage', msg);
      io.to(socket.id).emit('receiveMessage', msg);
    } catch(e) {}
  });

  socket.on('callUser', async (data) => {
    const targetSocket = activeSockets.get(data.userToCall);
    if (targetSocket) {
      io.to(targetSocket).emit('incomingCall', { signal: data.signalData, from: data.from, name: data.name, callType: data.callType });
    }
    const log = new CallLog({ caller: data.from, receiver: data.userToCall, callType: data.callType });
    await log.save();
  });

  socket.on('answerCall', (data) => {
    const targetSocket = activeSockets.get(data.to);
    if (targetSocket) {
      io.to(targetSocket).emit('callAccepted', data.signal);
    }
  });

  socket.on('iceCandidate', (data) => {
    const targetSocket = activeSockets.get(data.to);
    if (targetSocket) {
      io.to(targetSocket).emit('iceCandidate', { candidate: data.candidate });
    }
  });

  socket.on('endCall', (data) => {
    const targetSocket = activeSockets.get(data.to);
    if (targetSocket) {
      io.to(targetSocket).emit('callEnded');
    }
  });

  socket.on('typing', (data) => {
    const targetSocket = activeSockets.get(data.receiverId);
    if (targetSocket) {
      io.to(targetSocket).emit('typingEmit', { senderId: socket.userId, isTyping: data.isTyping });
    }
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      activeSockets.delete(socket.userId);
      const lastSeen = new Date();
      await User.findByIdAndUpdate(socket.userId, { isOnline: false, lastSeen });
      io.emit('statusChanged', { userId: socket.userId, isOnline: false, lastSeen });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
