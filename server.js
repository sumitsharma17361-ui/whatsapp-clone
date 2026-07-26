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

const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  restrictMessages: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Group = mongoose.model('Group', GroupSchema);

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
const io = socketIo(server, { 
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const ONESIGNAL_APP_ID = "45011a3c-d888-453d-a7f3-b7a8e436c09d";
const ONESIGNAL_REST_API_KEY = "Os_v2_app_iuarupgyrbct3j7tw6uoinwatwi6dfkac74udm4fmcr2hewe6qzyxy2ueiaufcte77kptuzp4oghr75rfsth2hjprbwbtdrzwlpmpta";

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected (Optimized Socket & Fast Delivery Ready)'))
  .catch(err => console.error('DB Connection Error:', err));

async function sendPushNotification(subscriptionId, heading, message) {
  try {
    if (!subscriptionId) return;
    const headers = { "Content-Type": "application/json; charset=utf-8", "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}` };
    const body = { app_id: ONESIGNAL_APP_ID, include_player_ids: [subscriptionId], headings: { "en": heading }, contents: { "en": message } };
    await fetch("https://onesignal.com/api/v1/notifications", { method: "POST", headers: headers, body: JSON.stringify(body) });
  } catch (err) { console.error("Push Error:", err); }
}

app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) return res.status(400).json({ error: 'No file data' });
    const buffer = Buffer.from(fileData.split(',')[1], 'base64');
    const uniqueFileName = Date.now() + '-' + fileName;
    fs.writeFileSync(path.join(UPLOADS_DIR, uniqueFileName), buffer);
    res.json({ fileUrl: `/uploads/${uniqueFileName}` });
  } catch (err) { res.status(500).json({ error: 'Upload failed' }); }
});

app.post('/api/profile-pic', async (req, res) => {
  try {
    const decoded = jwt.verify(req.headers['authorization'], JWT_SECRET);
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

app.post('/api/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password changed successfully!' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/friend-request', auth, async (req, res) => {
  const targetUser = await User.findOne({ username: req.body.targetUsername });
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (targetUser.friendRequests.includes(req.user.userId) || targetUser.friends.includes(req.user.userId)) {
    return res.status(400).json({ error: 'Already sent or friends' });
  }
  targetUser.friendRequests.push(req.user.userId);
  await targetUser.save();
  io.to(targetUser._id.toString()).emit('incomingFriendRequest');
  res.json({ message: 'Request sent' });
});

app.delete('/api/friend/:friendId', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const friendId = req.params.friendId;
    await User.findByIdAndUpdate(userId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: userId } });
    res.json({ message: 'Friend removed successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to remove friend' }); }
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

app.post('/api/groups/create', auth, async (req, res) => {
  try {
    const { name, memberIds } = req.body;
    if(!name) return res.status(400).json({ error: 'Group name required' });
    const members = [req.user.userId, ...(memberIds || [])];
    const group = new Group({ name, admin: req.user.userId, members });
    await group.save();
    members.forEach(mId => io.to(mId.toString()).emit('groupUpdated'));
    res.status(201).json({ message: 'Group created successfully' });
  } catch(e) { res.status(500).json({ error: 'Failed to create group' }); }
});

app.get('/api/groups/details/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId).populate('members', 'username profilePic').populate('admin', 'username');
    if(!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/groups/add-member', auth, async (req, res) => {
  try {
    const { groupId, username } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin.toString() !== req.user.userId) return res.status(403).json({ error: 'Only admin can add members' });

    const userToAdd = await User.findOne({ username });
    if (!userToAdd) return res.status(404).json({ error: 'User not found' });
    if (group.members.includes(userToAdd._id)) return res.status(400).json({ error: 'User already in group' });

    group.members.push(userToAdd._id);
    await group.save();
    group.members.forEach(mId => io.to(mId.toString()).emit('groupUpdated'));
    res.json({ message: 'Member added successfully' });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/groups/remove-member', auth, async (req, res) => {
  try {
    const { groupId, memberId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin.toString() !== req.user.userId) return res.status(403).json({ error: 'Only admin can remove members' });

    group.members = group.members.filter(id => id.toString() !== memberId);
    await group.save();
    group.members.forEach(mId => io.to(mId.toString()).emit('groupUpdated'));
    io.to(memberId).emit('groupUpdated');
    res.json({ message: 'Member removed successfully' });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/groups/toggle-restriction', auth, async (req, res) => {
  try {
    const { groupId } = req.body;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin.toString() !== req.user.userId) return res.status(403).json({ error: 'Only admin can change settings' });

    group.restrictMessages = !group.restrictMessages;
    await group.save();
    group.members.forEach(mId => io.to(mId.toString()).emit('groupUpdated'));
    res.json({ message: 'Group settings updated', restrictMessages: group.restrictMessages });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/groups/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.admin.toString() !== req.user.userId) return res.status(403).json({ error: 'Only admin can delete the group' });

    const members = group.members;
    await GroupMessage.deleteMany({ group: group._id });
    await Group.findByIdAndDelete(group._id);
    members.forEach(mId => io.to(mId.toString()).emit('groupUpdated'));
    res.json({ message: 'Group deleted successfully' });
  } catch(e) { res.status(500).json({ error: 'Failed to delete group' }); }
});

app.get('/api/groups/messages/:groupId', auth, async (req, res) => {
  try {
    const messages = await GroupMessage.find({ group: req.params.groupId })
      .populate('sender', 'username profilePic')
      .sort('timestamp');
    res.json(messages);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/status', auth, async (req, res) => {
  try {
    const { mediaUrl, mediaType, text, bgColor } = req.body;
    const status = new Status({ user: req.user.userId, mediaUrl: mediaUrl || '', mediaType: mediaType || 'text', text: text || '', bgColor: bgColor || '#111b21', viewers: [] });
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
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/calls', auth, async (req, res) => {
  try {
    const logs = await CallLog.find({ $or: [{ caller: req.user.userId }, { receiver: req.user.userId }] })
      .populate('caller', 'username profilePic')
      .populate('receiver', 'username profilePic')
      .sort('-timestamp');
    res.json(logs);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/calls/clear', auth, async (req, res) => {
  try {
    await CallLog.deleteMany({ $or: [{ caller: req.user.userId }, { receiver: req.user.userId }] });
    res.json({ message: 'Call history cleared successfully' });
  } catch (err) { res.status(500).json({ error: 'Failed to clear call history' }); }
});

app.get('/api/messages/:friendId', auth, async (req, res) => {
  await Message.updateMany({ sender: req.params.friendId, receiver: req.user.userId, status: { $ne: 'read' } }, { $set: { status: 'read' } });
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
    socket.join(userId); // Har user apne userId ke room me join ho jata hai

    await User.findByIdAndUpdate(userId, { 
      isOnline: true, 
      ...(subscriptionId ? { onesignalSubscriptionId: subscriptionId } : {}) 
    });

    // Sabhi ko turant broadcast karein ki user online ho gaya hai
    io.emit('statusChanged', { userId, isOnline: true });
  });

  socket.on('joinGroup', (groupId) => { 
    if (groupId) socket.join(groupId); 
  });

  socket.on('sendGroupMessage', async (data) => {
    const { groupId, senderId, text, fileUrl, fileName, fileType } = data;
    const group = await Group.findById(groupId);
    if (!group) return;

    if (group.restrictMessages && group.admin.toString() !== senderId) {
      socket.emit('errorMessage', { error: 'Only admin can send messages in this group.' });
      return;
    }

    const msg = new GroupMessage({ group: groupId, sender: senderId, text, fileUrl, fileName, fileType });
    await msg.save();
    const populatedMsg = await GroupMessage.findById(msg._id).populate('sender', 'username profilePic');
    io.to(groupId).emit('receiveGroupMessage', populatedMsg);
  });

  socket.on('sendMessage', async (data) => {
    // Check karein ki receiver online hai ya nahi (room me active hai)
    const receiverSocketId = onlineUsers.get(data.receiverId);
    const status = receiverSocketId ? 'delivered' : 'sent';

    const msg = new Message({ 
      sender: data.senderId, 
      receiver: data.receiverId, 
      text: data.text, 
      fileUrl: data.fileUrl, 
      fileName: data.fileName, 
      fileType: data.fileType,
      status: status, 
      isEncrypted: data.isEncrypted || false
    });
    
    await msg.save();
    const msgDataToSend = msg.toObject();
    if(data.replyTo) msgDataToSend.replyTo = data.replyTo;

    // Turant dono users ke rooms par emit karein
    io.to(data.receiverId).emit('receiveMessage', msgDataToSend);
    io.to(data.senderId).emit('receiveMessage', msgDataToSend);

    if (!receiverSocketId) {
      try {
        const receiverUser = await User.findById(data.receiverId);
        if (receiverUser && receiverUser.onesignalSubscriptionId) {
          await sendPushNotification(receiverUser.onesignalSubscriptionId, "New Message", data.text ? (data.text.length > 50 ? data.text.substring(0, 50) + '...' : data.text) : "Sent an attachment");
        }
      } catch (dbErr) { console.error("Push Error:", dbErr); }
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

  socket.on('iceCandidate', ({ candidate, to }) => { io.to(to).emit('iceCandidate', { candidate }); });
  socket.on('endCall', ({ to }) => { io.to(to).emit('callEnded'); });
  socket.on('typing', ({ receiverId, isTyping }) => { io.to(receiverId).emit('typingEmit', { senderId: currentUserId, isTyping }); });
  
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

  socket.on('clearChatEmit', ({ receiverId }) => { io.to(receiverId).emit('chatClearedEvent'); }
    );
        io.emit('statusChanged', { userId: currentUserId, isOnline: false, lastSeen: now });
      }
    }
  });
});

const PORT = process.env.PORT || `3000`;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
