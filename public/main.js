let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;

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

function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const type = msg.sender === userId ? 'sent' : 'received';
  display.innerHTML += `<div class="msg ${type}">${msg.text}</div>`;
  display.scrollTop = display.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input.value.trim() || !activeFriendId) return;
  socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: input.value });
  input.value = '';
}

function logout() { localStorage.clear(); window.location.reload(); }
