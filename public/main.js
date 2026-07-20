let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFile = null;

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

window.onload = () => { if (token) showDashboard(); };

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  if(window.innerWidth <= 768) {
    if(show) sidebar.classList.remove('mobile-hidden');
    else sidebar.classList.add('mobile-hidden');
  }
}

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
    window.location.reload();
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
    reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button class="btn-small" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
  });

  const friendsList = document.getElementById('friends-list');
  friendsList.innerHTML = '';
  data.friends.forEach(f => {
    friendsList.innerHTML += `<div class="list-item" onclick="openChat('${f._id}', '${f.username}', ${f.isOnline})"><span>${f.username}</span><span id="status-${f._id}" style="color:${f.isOnline ? '#25d366':'#8696a0'}">${f.isOnline ? 'Online' : 'Offline'}</span></div>`;
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
  toggleSidebar(false);
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

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  selectedFile = file;
  document.getElementById('message-input').value = `📷 ${file.name} (Ready to send)`;
}

function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const type = msg.sender === userId ? 'sent' : 'received';
  let contentHtml = '<div class="media-box">';
  
  if (msg.fileUrl) {
      if (msg.fileType.startsWith('image/')) {
          contentHtml += `<img src="${msg.fileUrl}">`;
      } else if (msg.fileType.startsWith('video/')) {
          contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
      } else {
          contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
      }
      contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:#00a884; text-decoration:none; font-size:12px; font-weight:bold; display:block; margin-top:4px;">⬇ Download</a>`;
  }
  
  if (msg.text && !msg.text.includes('(Ready to send)')) {
      contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;
  }
  contentHtml += '</div>';

  display.innerHTML += `<div class="msg ${type}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

// INSTANT UPLOAD VIA WEBSOCKET BINARY UPLOAD
async function sendMessage() {
  const input = document.getElementById('message-input');
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

  if (selectedFile) {
    input.value = "Sending instantly...";
    const reader = new FileReader();
    reader.onload = function(e) {
      if (textToSend.includes('(Ready to send)')) textToSend = "";
      
      // Direct WebSocket fast upload channel
      socket.emit('sendMessage', { 
          senderId: userId, 
          receiverId: activeFriendId, 
          text: textToSend,
          fileUrl: e.target.result, // Base64 raw socket data
          fileName: selectedFile.name,
          fileType: selectedFile.type
      });
      selectedFile = null;
      document.getElementById('file-input').value = "";
      input.value = '';
    };
    reader.readAsDataURL(selectedFile);
  } else {
    socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: textToSend });
    input.value = '';
  }
}

function logout() { localStorage.clear(); window.location.reload(); }
