let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFileData = null; // Temporary file storage

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

window.onload = () => { if (token) showDashboard(); };

async function authAction(endpoint) {
  const u = document.getElementById('auth-username').value;
  const p = document.getElementById('auth-password').value;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  
  if (endpoint.includes('login')) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('username', data.username);
    token = data.token; userId = data.userId; username = data.username;
    showDashboard();
  } else {
    alert('Registered! Please login.');
  }
}

function showDashboard() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('current-user-display').innerText = username;
  
  socket = io();
  socket.emit('identify', userId);

  socket.on('receiveMessage', (msg) => {
    if (activeFriendId && (msg.sender === activeFriendId || msg.receiver === activeFriendId)) {
      renderSingleMessage(msg);
    }
  });

  socket.on('statusChanged', ({ userId: changedId, isOnline }) => {
    const statusEl = document.getElementById(`status-${changedId}`);
    if (statusEl) statusEl.innerText = isOnline ? 'Online' : 'Offline';
    if (activeFriendId === changedId) {
      document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : 'Offline';
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  socket.on('requestAccepted', () => loadDashboardData());
  loadDashboardData();
}

async function loadDashboardData() {
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  
  const reqList = document.getElementById('requests-list');
  reqList.innerHTML = '';
  data.friendRequests.forEach(req => {
    reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button onclick="acceptFriend('${req._id}')">Accept</button></div>`;
  });

  const friendsList = document.getElementById('friends-list');
  friendsList.innerHTML = '';
  data.friends.forEach(f => {
    friendsList.innerHTML += `<div class="list-item" onclick="openChat('${f._id}', '${f.username}', ${f.isOnline})"><span>${f.username}</span><span id="status-${f._id}">${f.isOnline ? 'Online' : 'Offline'}</span></div>`;
  });
}

async function sendFriendRequest() {
  const target = document.getElementById('target-username').value;
  const res = await fetch('/api/friend-request', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ targetUsername: target })
  });
  const data = await res.json();
  alert(data.message || data.error);
  document.getElementById('target-username').value = '';
}

async function acceptFriend(requesterId) {
  await fetch('/api/accept-request', { method: 'POST', headers: headers(), body: JSON.stringify({ requesterId }) });
  loadDashboardData();
}

async function openChat(friendId, friendName, isOnline) {
  activeFriendId = friendId;
  document.getElementById('chat-placeholder').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('active-friend-name').innerText = friendName;
  document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : 'Offline';

  const res = await fetch(`/api/messages/${friendId}`, { headers: headers() });
  const messages = await res.json();
  const display = document.getElementById('messages-display');
  display.innerHTML = '';
  messages.forEach(renderSingleMessage);
}

// --- FILE SELECTION SYSTEM ---
function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    selectedFileData = {
      name: file.name,
      type: file.type,
      data: e.target.result // Base64 String
    };
    document.getElementById('message-input').value = `[Selected File: ${file.name}]`;
  };
  reader.readAsDataURL(file);
}

// --- MESSAGE RENDER WITH MEDIA DOWNLOADS ---
function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const type = msg.sender === userId ? 'sent' : 'received';
  
  let contentHtml = '';
  
  // Agar text message hai
  if (msg.text && !msg.fileUrl) {
      contentHtml = `<div>${msg.text}</div>`;
  } 
  // Agar file bheji gayi hai
  else if (msg.fileUrl) {
      if (msg.fileType.startsWith('image/')) {
          contentHtml = `<img src="${msg.fileUrl}" style="max-width: 100%; border-radius: 4px; display: block; margin-bottom: 5px;">`;
      } else if (msg.fileType.startsWith('video/')) {
          contentHtml = `<video src="${msg.fileUrl}" controls style="max-width: 100%; border-radius: 4px; display: block; margin-bottom: 5px;"></video>`;
      } else if (msg.fileType.startsWith('audio/')) {
          contentHtml = `<audio src="${msg.fileUrl}" controls style="max-width: 100%; margin-bottom: 5px;"></audio>`;
      } else {
          contentHtml = `<div style="font-weight: bold; color: #526069;">📄 ${msg.fileName}</div>`;
      }
      // WhatsApp jaisa Download button har media ke liye
      contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="display: inline-block; background: #00a884; color: white; text-decoration: none; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; margin-top: 5px;">⬇️ Download</a>`;
      
      if (msg.text && !msg.text.startsWith('[Selected File:')) {
          contentHtml += `<div style="margin-top: 5px;">${msg.text}</div>`;
      }
  }

  display.innerHTML += `<div class="msg ${type}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

// --- SEND MESSAGE WITH FILE ---
async function sendMessage() {
  const input = document.getElementById('message-input');
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFileData) return;
  if (!activeFriendId) return;

  let uploadedFileUrl = null;
  let nameOfFile = null;
  let typeOfFile = null;

  // Agar user ne koi file select ki hai to pehle upload karenge
  if (selectedFileData) {
      input.value = "Uploading file...";
      const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: selectedFileData.name, fileData: selectedFileData.data })
      });
      const uploadData = await uploadRes.json();
      if (uploadData.fileUrl) {
          uploadedFileUrl = uploadData.fileUrl;
          nameOfFile = selectedFileData.name;
          typeOfFile = selectedFileData.type;
      }
      if (textToSend.startsWith('[Selected File:')) {
          textToSend = ""; // Agar caption nahi tha to text blank kar do
      }
      selectedFileData = null; // Reset temporary storage
      document.getElementById('file-input').value = ""; // Reset file tag
  }

  socket.emit('sendMessage', { 
      senderId: userId, 
      receiverId: activeFriendId, 
      text: textToSend,
      fileUrl: uploadedFileUrl,
      fileName: nameOfFile,
      fileType: typeOfFile
  });
  
  input.value = '';
}

function logout() { localStorage.clear(); window.location.reload(); }
