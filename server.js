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
const Status = require('./models/Status');
const CallLog = require('./models/CallLog');

// Group Schema for Group Chats
const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});
const Group = mongoose.model('Group', GroupSchema);

// Group Message Schema
const GroupMessageSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String },
  fileUrl: { type: String },
  fileName: { type: String },
  fileType: { type: String },
  timestamp: { type: Number, default: Date.now }
});
const GroupMessage = mongoose.model('GroupMessage', GroupMessageSchema);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// OneSignal Credentials
const ONESIGNAL_APP_ID = "45011a3c-d888-453d-a7f3-b7a8e436c09d";
const ONESIGNAL_REST_API_KEY = "Os_v2_app_iuarupgyrbct3j7tw6uoinwatwi6dfkac74udm4fmcr2hewe6qzyxy2ueiaufcte77kptuzp4oghr75rfsth2hjprbwbtdrzwlpmpta";

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected (Groups & Status Viewers Ready)'))
  .catch(err => console.error('DB Connection Error:', err));

// Direct Database Push Notification Helper
async function sendPushNotification(subscriptionId, heading, message) {
  try {
    if (!subscriptionId) {
      console.log("Skipping push notification: No subscription ID found for user.");
      return;
    }
    console.log(`Sending direct OneSignal push to player_id: ${subscriptionId}`);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
    };

    const body = {
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: [subscriptionId],
      headings: { "en": heading },
      contents: { "en": message }
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    console.log("Direct Push Notification Sent Response:", JSON.stringify(result));
  } catch (err) {
    console.error("Push Notification Error:", err);
  }
}

app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) return res.status(400).json({ error: 'No file data' });

    const buffer = Buffer.from(fileData.split(',')[1], 'base64');
    const uniqueFileName = Date.now() + '-' + fileName;
    const filePath = path.join(UPLOADS_DIR, uniqueFileName);

    fs.writeFileSync(filePath, buffer);
    res.json({ fileUrl: `/uploads/${uniqueFileName}` });
  } catch (err) { res.status(500).json({ error: 'Upload failed' }); }
});

app.post('/api/profile-pic', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const decoded = jwt.verify(authHeader, JWT_SECRET);
    await User.findByIdAndUpdate(decoded.userId, { profilePic: req.body.profilePic });
    res.json({ message: "Profile updated" });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: 'Registered successfully' });
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
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid' });
    req.user = decoded;
    next();
  });
};

// CHANGE PASSWORD API ROUTE
app.post('/api/change-password', auth, async (req, res) => {
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

app.post('/api/friend-request', auth, async (req, res) => {
  const { targetUsername } = req.body;
  const targetUser = await User.findOne({ username: targetUsername });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (targetUser.friendRequests.includes(req.user.userId) || targetUser.friends.includes(req.user.userId)) {
    return res.status(400).json({ error: 'Already sent or friends' });
  }
  targetUser.friendRequests.push(req.user.userId);
  await targetUser.save();
  io.to(targetUser._id.toString()).emit('incomingFriendRequest');
  res.json({ message: 'Request sent' });
});

app.get('/api/dashboard', auth, async (req, res) => {
  const user = await User.findById(req.user.userId)
    .populate('friends', 'username isOnline profilePic lastSeen')
    .populate('friendRequests', 'username');
  
  const groups = await Group.find({ members: req.user.userId }).populate('members', 'username profilePic');
  res.json({ friends: user.friends, friendRequests: user.friendRequests, groups });
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

// GROUP APIs
app.post('/api/groups/create', auth, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if(!name) return res.status(400).json({ error: 'Group name required' });
    const members = [req.user.userId, ...(memberIds || [])];
    const group = new Group({ name, admin: req.user.userId, members });
    await group.save();
    members.forEach(mId => io.to(mId.toString()).emit('groupCreated'));
    res.status(201).json({ message: 'Group created successfully' });
  } catch(e) { res.status(500).json({ error: 'Failed to create group' }); }
});

app.get('/api/groups/messages/:groupId', auth, async (req, res) => {
  try {
    const messages = await GroupMessage.find({ group: req.params.groupId })
      .populate('sender', 'username profilePic')
      .sort('timestamp');
    res.json(messages);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// STATUS APIs with Viewers List
app.post('/api/status', auth, async (req, res) => {
  try {
    const { mediaUrl, mediaType, text, bgColor } = req.body;
    const status = new Status({ 
      user: req.user.userId, 
      mediaUrl: mediaUrl || '', 
      mediaType: mediaType || 'text', 
      text: text || '', 
      bgColor: bgColor || '#111b21',
      viewers: []
    });
    await status.save();
    io.emit('statusUpdated');
    res.status(201).json({ message: 'Status uploaded' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const visibleUserIds = [...user.friends, req.user.userId];
    const statuses = await Status.find({ user: { $in: visibleUserIds } })
      .populate('user', 'username profilePic')
      .populate('viewers', 'username profilePic')
      .sort('-createdAt');
    res.json(statuses);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/status/view/:statusId', auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);
    if(status && !status.viewers.includes(req.user.userId)) {
      status.viewers.push(req.user.userId);
      await status.save();
    }
    res.json({ message: 'Viewed' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/status/:statusId', auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);
    if (!status) return res.status(404).json({ error: 'Status not found' });
    if (status.user.toString() !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });
    
    await Status.findByIdAndDelete(req.params.statusId);
    io.emit('statusUpdated');
    res.json({ message: 'Status deleted successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete status' }); }
});

// CALL LOGS APIs
app.get('/api/calls', auth, async (req, res) => {
  try {
    const logs = await CallLog.find({ $or: [{ caller: req.user.userId }, { receiver: req.user.userId }] })
      .populate('caller', 'username profilePic')
      .populate('receiver', 'username profilePic')
      .sort('-timestamp');
    res.json(logs);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
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

app.delete('/api/messages/clear/:friendId', auth, async (req, res) => {
  try {
    await Message.deleteMany({
      $or: [{ sender: req.user.userId, receiver: req.params.friendId }, { sender: req.params.friendId, receiver: req.user.userId }]
    });
    res.json({ message: 'Chat cleared successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

const onlineUsers = new Map();
io.on('connection', (socket) => {
  let currentUserId = null;
  
  socket.on('identify', async (data) => {
    const userId = typeof data === 'object' ? data.userId : data;
    const subscriptionId = typeof data === 'object' ? data.subscriptionId : null;

    if (!userId) return;
    currentUserId = userId; 
    onlineUsers.set(userId, socket.id); 
    socket.join(userId);

    const updateFields = { isOnline: true };
    if (subscriptionId) {
      updateFields.onesignalSubscriptionId = subscriptionId;
    }
    await User.findByIdAndUpdate(userId, updateFields);
    socket.broadcast.emit('statusChanged', { userId, isOnline: true });
  });

  socket.on('joinGroup', (groupId) => {
    socket.join(groupId);
  });

  socket.on('sendGroupMessage', async (data) => {
    const { groupId, senderId, text, fileUrl, fileName, fileType, isEncrypted } = data;
    const msg = new GroupMessage({ group: groupId, sender: senderId, text, fileUrl, fileName, fileType });
    await msg.save();
    const populatedMsg = await GroupMessage.findById(msg._id).populate('sender', 'username profilePic');
    io.to(groupId).emit('receiveGroupMessage', populatedMsg);
  });

  socket.on('sendMessage', async (data) => {
    const receiverOnline = onlineUsers.has(data.receiverId);
    console.log(`Message from ${data.senderId} to ${data.receiverId}. Receiver Online Status: ${receiverOnline}`);

    const msg = new Message({ 
      sender: data.senderId, receiver: data.receiverId, 
      text: data.text, fileUrl: data.fileUrl, fileName: data.fileName, fileType: data.fileType,
      status: receiverOnline ? 'delivered' : 'sent', isEncrypted: data.isEncrypted || false
    });
    await msg.save();
    const msgDataToSend = msg.toObject();
    if(data.replyTo) msgDataToSend.replyTo = data.replyTo;

    io.to(data.receiverId).emit('receiveMessage', msgDataToSend);
    io.to(data.senderId).emit('receiveMessage', msgDataToSend);

    if (!receiverOnline) {
      console.log(`Receiver ${data.receiverId} is offline. Fetching token from DB for direct push.`);
      try {
        const receiverUser = await User.findById(data.receiverId);
        if (receiverUser && receiverUser.onesignalSubscriptionId) {
          await sendPushNotification(
            receiverUser.onesignalSubscriptionId, 
            "New Message", 
            data.text ? (data.text.length > 50 ? data.text.substring(0, 50) + '...' : data.text) : "Sent an attachment"
          );
        } else {
          console.log("No onesignalSubscriptionId found in database for receiver.");
        }
      } catch (dbErr) {
        console.error("Error fetching receiver token from DB:", dbErr);
      }
    }
  });

  socket.on('callUser', async ({ userToCall, signalData, from, name, callType }) => {
    const log = new CallLog({ caller: from, receiver: userToCall, callType, direction: 'outgoing' });
    await log.save();
    io.to(userToCall).emit('incomingCall', { signal: signalData, from, name, callType, logId: log._id });
  });

  socket.on('answerCall', async (data) => {
    const log = new CallLog({ caller: data.from, receiver: data.to, callType: data.callType, direction: 'incoming' });
    await log.save();
    io.to(data.to).emit('callAccepted', data.signal);
  });

  socket.on('iceCandidate', ({ candidate, to }) => {
    io.to(to).emit('iceCandidate', { candidate });
  });

  socket.on('endCall', ({ to }) => {
    io.to(to).emit('callEnded');
  });

  socket.on('typing', ({ receiverId, isTyping }) => {
    io.to(receiverId).emit('typingEmit', { senderId: currentUserId, isTyping });
  });

  socket.on('reactionEmit', async ({ msgId, emoji, receiverId }) => {
    await Message.findByIdAndUpdate(msgId, { reaction: emoji });
    io.to(receiverId).emit('reactionReceived', { msgId, emoji });
    io.to(currentUserId).emit('reactionReceived', { msgId, emoji });
  });

  socket.on('deleteMsgEmit', async ({ msgId, receiverId }) => {
    await Message.findByIdAndUpdate(msgId, { text: '🚫 This message was deleted', fileUrl: null, fileName: null, fileType: null, isEncrypted: false });
    io.to(receiverId).emit('msgDeleted', { msgId });
    io.to(currentUserId).emit('msgDeleted', { msgId });
  });

  socket.on('clearChatEmit', ({ receiverId }) => {
    io.to(receiverId).emit('chatClearedEvent');
  });

  socket.on('readEmit', async ({ msgId, senderId }) => {
     await Message.findByIdAndUpdate(msgId, { status: 'read' });
     io.to(senderId).emit('msgStatusUpdate', { msgId, status: 'read' });
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

const PORT = process.env.PORT || `3000`;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
                         
