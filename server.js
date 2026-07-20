require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('DB Connection Error:', err));

// --- FILE UPLOAD API ---
app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) return res.status(400).json({ error: 'No file data' });
    const buffer = Buffer.from(fileData.split(',')[1], 'base64');
    const uniqueFileName = Date.now() + '-' + fileName;
    const filePath = path.join(UPLOADS_DIR, uniqueFileName);
    fs.writeFileSync(filePath, buffer);
    res.json({ fileUrl: `/uploads/${uniqueFileName}` });
  } catch (err) { res.status(500).json({ error: 'File upload failed' }); }
});

// --- UPDATE PROFILE PICTURE ---
app.post('/api/profile-pic', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const decoded = jwt.verify(authHeader, JWT_SECRET);
    await User.findByIdAndUpdate(decoded.userId, { profilePic: req.body.profilePic });
    res.json({ message: "Profile updated successfully" });
  } catch (err) { res.status(500).json({ error: "Failed to update profile pic" }); }
});

// --- REST ROUTING PIPELINES ---
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) { res.status(400).json({ error: 'Username already exists' }); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET);
  res.json({ token, userId: user._id, username: user.username, profilePic: user.profilePic });
});

const auth = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

app.post('/api/friend-request', auth, async (req, res) => {
  const { targetUsername } = req.body;
  const targetUser = await User.findOne({ username: targetUsername });
  if (!targetUser || targetUser.friendRequests.includes(req.user.userId) || targetUser.friends.includes(req.user.userId)) {
    return res.status(400).json({ error: 'Failed to send request' });
  }
  targetUser.friendRequests.push(req.user.userId);
  await targetUser.save();
  io.to(targetUser._id.toString()).emit('incomingFriendRequest');
  res.json({ message: 'Friend request sent' });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const user = await User.findById(req.user.userId)
    .populate('friends', 'username isOnline profilePic lastSeen')
    .populate('friendRequests', 'username');
  res.json({ friends: user.friends, friendRequests: user.friendRequests });
});

app.get('/api/messages/:friendId', auth, async (req, res) => {
  await Message.updateMany(
    { sender: req.params.friendId, receiver: req.user.userId, status: { $ne: 'read' } },
    { $set: { status: 'read' } }
  );
  io.to(req.params.friendId).emit('messagesMarkedRead', { by: req.user.userId });
  const messages = await Message.find({
    $or: [{ sender: req.user.userId, receiver: req.params.friendId }, { sender: req.params.friendId, receiver: req.user.userId }]
  }).sort('timestamp');
  res.json(messages);
});

// --- CORE SOCKET & FIX WEBRTC CHANNELS ---
const onlineUsers = new Map();

io.on('connection', (socket) => {
  let currentUserId = null;

  socket.on('identify', async (userId) => {
    currentUserId = userId;
    onlineUsers.set(userId, socket.id);
    socket.join(userId);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    socket.broadcast.emit('statusChanged', { userId, isOnline: true });
  });

  socket.on('sendMessage', async (data) => {
    const receiverOnline = onlineUsers.has(data.receiverId);
    const msg = new Message({
      sender: data.senderId, receiver: data.receiverId, text: data.text,
      fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType,
      status: receiverOnline ? 'delivered' : 'sent'
    });
    await msg.save();
    io.to(data.receiverId).emit('receiveMessage', msg);
    io.to(data.senderId).emit('receiveMessage', msg);
  });

  socket.on('readEmit', async ({ msgId, senderId }) => {
     await Message.findByIdAndUpdate(msgId, { status: 'read' });
     io.to(senderId).emit('msgStatusUpdate', { msgId, status: 'read' });
  });

  // Calling logic routing channels
  socket.on('callUser', ({ to, from, signalData, type }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incomingCall', { from: from, fromId: currentUserId, signal: signalData, type });
    }
  });

  socket.on('answerCall', ({ to, signal }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit('callAccepted', signal);
  });

  socket.on('iceCandidateEmit', ({ to, candidate }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit('iceCandidateReceive', candidate);
  });

  socket.on('endCallEmit', ({ to }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit('callEnded');
  });

  socket.on('disconnect', async () => {
    if (currentUserId) {
      onlineUsers.delete(currentUserId);
      const now = new Date();
      await User.findByIdAndUpdate(currentUserId, { isOnline: false, lastSeen: now });
      io.emit('statusChanged', { userId: currentUserId, isOnline: false, lastSeen: now });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
