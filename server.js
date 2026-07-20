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

const app = report = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)){ fs.mkdirSync(UPLOADS_DIR, { recursive: true }); }

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('DB Connection Error:', err));

app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    const buffer = Buffer.from(fileData.split(',')[1], 'base64');
    const uniqueFileName = Date.now() + '-' + fileName;
    fs.writeFileSync(path.join(UPLOADS_DIR, uniqueFileName), buffer);
    res.json({ fileUrl: `/uploads/${uniqueFileName}` });
  } catch (err) { res.status(500).json({ error: 'Upload failed' }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Registered' });
  } catch (err) { res.status(400).json({ error: 'Exists' }); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Invalid' });
  const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET);
  res.json({ token, userId: user._id, username: user.username });
});

const auth = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid' });
    req.user = decoded;
    next();
  });
};

app.post('/api/friend-request', auth, async (req, res) => {
  const { targetUsername } = req.body;
  const targetUser = await User.findOne({ username: targetUsername });
  if (!targetUser || targetUser.friendRequests.includes(req.user.userId)) return res.status(400).json({ error: 'Error' });
  targetUser.friendRequests.push(req.user.userId);
  await targetUser.save();
  io.to(targetUser._id.toString()).emit('incomingFriendRequest');
  res.json({ message: 'Sent' });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const user = await User.findById(req.user.userId).populate('friends', 'username isOnline').populate('friendRequests', 'username');
  res.json({ friends: user.friends, friendRequests: user.friendRequests });
});

app.post('/api/accept-request', auth, async (req, res) => {
  const { requesterId } = req.body;
  const user = await User.findById(req.user.userId);
  const requester = await User.findById(requesterId);
  user.friendRequests = user.friendRequests.filter(id => id.toString() !== requesterId);
  user.friends.push(requesterId);
  requester.friends.push(user._id);
  await user.save(); await requester.save();
  io.to(requesterId).emit('requestAccepted');
  res.json({ message: 'Accepted' });
});

app.get('/api/messages/:friendId', auth, async (req, res) => {
  const messages = await Message.find({ $or: [{ sender: req.user.userId, receiver: req.params.friendId }, { sender: req.params.friendId, receiver: req.user.userId }] }).sort('timestamp');
  res.json(messages);
});

const onlineUsers = new Map();
io.on('connection', (socket) => {
  let currentUserId = null;
  socket.on('identify', async (userId) => {
    currentUserId = userId; onlineUsers.set(userId, socket.id); socket.join(userId);
    await User.findByIdAndUpdate(userId, { isOnline: true });
    socket.broadcast.emit('statusChanged', { userId, isOnline: true });
  });

  socket.on('sendMessage', async ({ senderId, receiverId, text, fileUrl, fileName, fileType }) => {
    const msg = new Message({ sender: senderId, receiver: receiverId, text, fileUrl, fileName, fileType });
    await msg.save(); io.to(receiverId).emit('receiveMessage', msg); io.to(senderId).emit('receiveMessage', msg);
  });

  // Native calling socket channels routing
  socket.on('callUser', ({ to, from, type }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit('incomingCall', { from, fromId: currentUserId, type });
  });
  socket.on('answerCall', ({ to }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit('callAccepted');
  });
  socket.on('endCallEmit', ({ to }) => {
    const targetSocketId = onlineUsers.get(to);
    if (targetSocketId) io.to(targetSocketId).emit('callEnded');
  });

  socket.on('disconnect', async () => {
    if (currentUserId) {
      onlineUsers.delete(currentUserId);
      await User.findByIdAndUpdate(currentUserId, { isOnline: false });
      io.emit('statusChanged', { userId: currentUserId, isOnline: false });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
