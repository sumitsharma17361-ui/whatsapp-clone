// ============================================================
// BM GROUP CHAT PORTAL — ALL JS COMBINED
// Contains: main + chat-wallpaper + cyber-mode + secret-vault
// ============================================================

// ============================================================
// PART 1: GLOBAL STATE
// ============================================================
let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let userRollNo = localStorage.getItem('userRollNo');
let userName = localStorage.getItem('userName');
let userRole = localStorage.getItem('userRole');
let activeFriendId = null;
let activeGroupId = null;
let selectedFile = null;
let replyMessageData = null;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let typingTimeout = null;
let pinnedFriends = JSON.parse(localStorage.getItem('pinnedFriends') || '[]');

let peer = null;
let currentPeerCall = null;
let localStream = null;
let remoteStream = null;
let callTimerInterval = null;
let callSeconds = 0;
let useFrontCamera = true;
let currentFacingMode = 'user';

const mockEncryptionKey = "BMGroupChatSecretKey12345";

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

const notifySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// ============================================================
// PART 2: WINDOW LOAD
// ============================================================
window.onload = () => {
  if (token && userRollNo) {
    showDashboard();
    if (localStorage.getItem('profilePic')) {
      const av = document.getElementById('my-avatar');
      if (av) av.src = localStorage.getItem('profilePic');
    }
  }
  setupMic();
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }

  // Restore cyber mode if previously enabled
  if (localStorage.getItem('cyberMode') === 'true') {
    setTimeout(() => applyCyberTheme(true, true), 1500);
  }
};

// ============================================================
// PART 3: AUTH — Roll No based
// ============================================================
let isRegisterMode = false;

function toggleRegisterMode() {
  isRegisterMode = !isRegisterMode;
  document.getElementById('reg-name-wrap').classList.toggle('hidden', !isRegisterMode);
  document.getElementById('reg-role-wrap').classList.toggle('hidden', !isRegisterMode);
  document.getElementById('login-btn').textContent = isRegisterMode ? 'Register' : 'Login';
  document.getElementById('register-btn').textContent = isRegisterMode ? 'Back to Login' : 'Register';
  if (isRegisterMode) {
    document.getElementById('login-btn').setAttribute('onclick', "authAction('register')");
    document.getElementById('register-btn').setAttribute('onclick', "toggleRegisterMode()");
  } else {
    document.getElementById('login-btn').setAttribute('onclick', "authAction('login')");
    document.getElementById('register-btn').setAttribute('onclick', "toggleRegisterMode()");
  }
}

async function authAction(type) {
  const rollNo = document.getElementById('auth-rollno').value.trim().toUpperCase();
  const password = document.getElementById('auth-password').value.trim();
  if (!rollNo || !password) return alert("Please fill Roll No and Password");

  let body = { rollNo, password };

  if (type === 'register') {
    const name = document.getElementById('auth-name').value.trim();
    const role = document.getElementById('auth-role').value;
    const branch = document.getElementById('auth-branch').value;
    if (!name) return alert("Please enter your full name");
    body = { rollNo, password, name, role, branch };
  }

  const btn = type === 'login' ? document.getElementById('login-btn') : document.getElementById('register-btn');
  const originalText = btn.innerText;
  btn.innerText = type === 'login' ? 'Logging in...' : 'Registering...';
  btn.disabled = true;

  const endpoint = type === 'login' ? '/api/login' : '/api/register';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (data.error) {
      alert(data.error);
      btn.innerText = originalText;
      btn.disabled = false;
      return;
    }

    if (type === 'login') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('userRollNo', data.rollNo);
      localStorage.setItem('userName', data.name);
      localStorage.setItem('userRole', data.role);
      if (data.profilePic) localStorage.setItem('profilePic', data.profilePic);

      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          await OneSignal.login(data.userId);
        });
      }
      window.location.reload();
    } else {
      alert('Registered successfully! Now click Login.');
      toggleRegisterMode();
      btn.innerText = originalText;
      btn.disabled = false;
    }
  } catch (err) {
    alert("Connection error. Please try again.");
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

async function changePassword() {
  const oldPassword = prompt("Enter your current password:");
  if (!oldPassword) return;
  const newPassword = prompt("Enter your new password:");
  if (!newPassword) return;
  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    else alert(data.message);
  } catch (err) { alert("Failed to change password."); }
}

async function uploadProfilePic(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    document.getElementById('my-avatar').src = base64;
    localStorage.setItem('profilePic', base64);
    await fetch('/api/profile-pic', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ profilePic: base64 })
    });
  };
  reader.readAsDataURL(file);
}

function toggleTheme() {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
  }
}

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const chatArea = document.getElementById('chat-area');
  if (window.innerWidth <= 768) {
    if (show) { sidebar.classList.remove('mobile-hidden'); chatArea.classList.add('mobile-hidden'); }
    else { sidebar.classList.add('mobile-hidden'); chatArea.classList.remove('mobile-hidden'); }
  }
}

function switchTab(tab) {
  const tabs = { chats: 'tab-chats-btn', status: 'tab-status-btn', calls: 'tab-calls-btn' };
  Object.values(tabs).forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(tabs[tab])?.classList.add('active');

  ['friends-list', 'status-view-container', 'calls-view-container'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });

  if (tab === 'chats') document.getElementById('friends-list').classList.remove('hidden');
  else if (tab === 'status') { document.getElementById('status-view-container').classList.remove('hidden'); loadStatuses(); }
  else if (tab === 'calls') { document.getElementById('calls-view-container').classList.remove('hidden'); loadCallLogs(); }
}

// ============================================================
// PART 4: DASHBOARD & SOCKET
// ============================================================
function showDashboard() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('current-user-display').innerText = userName || 'User';
  document.getElementById('current-user-roll').innerText = userRollNo || '—';

  if (window.OneSignalDeferred && userId) {
    window.OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.login(userId);
    });
  }

  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    timeout: 20000
  });

  socket.on('connect', () => {
    identifySocket();
    if (activeGroupId) socket.emit('joinGroup', activeGroupId);
  });

  initPeerJS();

  socket.on('receiveMessage', (msg) => {
    const msgSender = String(msg.sender._id || msg.sender);
    const msgReceiver = String(msg.receiver._id || msg.receiver);
    if (msgSender !== String(userId)) { try { notifySound.play(); } catch(e){} }

    if (activeFriendId && (msgSender === String(activeFriendId) || msgReceiver === String(activeFriendId))) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
      if (msg.text && msg.isEncrypted) msg.text = decryptText(msg.text);
      renderSingleMessage(msg);
      if (msgSender === String(activeFriendId)) socket.emit('readEmit', { msgId: msg._id, senderId: msgSender });
    }
  });

  socket.on('receiveGroupMessage', (msg) => {
    if (activeGroupId && String(msg.group) === String(activeGroupId)) {
      if (String(msg.sender._id) !== String(userId)) { try { notifySound.play(); } catch(e){} }
      renderGroupMessage(msg);
    }
  });

  socket.on('errorMessage', (data) => alert(data.error));
  socket.on('groupUpdated', () => loadDashboardData());
  socket.on('typingEmit', ({ senderId, isTyping }) => {
    if (String(activeFriendId) === String(senderId)) {
      const el = document.getElementById('active-friend-status');
      if (isTyping) el.innerText = 'typing...';
      else el.innerText = 'Online';
    }
  });

  socket.on('reactionReceived', ({ msgId, emoji }) => {
    const el = document.getElementById(`reaction-badge-${msgId}`);
    if (el) { el.innerText = emoji; el.classList.remove('hidden'); }
  });

  socket.on('msgDeleted', ({ msgId }) => {
    const el = document.getElementById(`msg-container-${msgId}`);
    if (el) el.innerHTML = '<p style="font-style:italic; color:#94a3b8; font-size:13px; margin:2px 0;">🚫 This message was deleted</p>';
  });

  socket.on('chatClearedEvent', () => {
    const display = document.getElementById('messages-display');
    if (display) display.innerHTML = '';
  });

  socket.on('statusUpdated', () => loadStatuses());
  socket.on('statusChanged', ({ userId: changedId, isOnline, lastSeen }) => {
    loadDashboardData();
    if (String(activeFriendId) === String(changedId)) {
      document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  loadDashboardData();

  // Add custom header action buttons (wallpaper, cyber, vault, AI bot)
  setTimeout(attachCustomHeaderButtons, 800);
}

function identifySocket() {
  if (!userId || !socket) return;
  function sendTokenWithRetry(retries = 5) {
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async function(OneSignal) {
        try {
          let subId = OneSignal.User.PushSubscription.id;
          socket.emit('identify', { userId: userId, subscriptionId: subId || null });
        } catch(e) {
          if (retries > 0) setTimeout(() => sendTokenWithRetry(retries - 1), 2000);
          else socket.emit('identify', { userId: userId, subscriptionId: null });
        }
      });
    } else {
      socket.emit('identify', { userId: userId, subscriptionId: null });
    }
  }
  sendTokenWithRetry();
}

// ============================================================
// PART 5: PEERJS
// ============================================================
function initPeerJS() {
  peer = new Peer(userId, { host: '0.peerjs.com', port: 443, secure: true });
  peer.on('open', (id) => console.log('Peer connected:', id));
  peer.on('call', async (call) => {
    currentPeerCall = call;
    const callType = call.metadata?.callType || 'audio';
    const callerName = call.metadata?.callerName || 'Friend';
    document.getElementById('incoming-caller-name').innerText = `${callerName} (${callType} call)`;
    document.getElementById('incoming-call-modal').classList.remove('hidden');
    window.incomingPeerCallObj = call;
    window.incomingCallType = callType;
  });
}

// ============================================================
// PART 6: CALLS
// ============================================================
function startCallTimer() {
  callSeconds = 0;
  const timerEl = document.getElementById('call-timer');
  timerEl.classList.remove('hidden');
  timerEl.innerText = "00:00";
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const mins = Math.floor(callSeconds / 60).toString().padStart(2, '0');
    const secs = (callSeconds % 60).toString().padStart(2, '0');
    timerEl.innerText = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  document.getElementById('call-timer').classList.add('hidden');
}

function setupDraggableVideo() {
  const draggable = document.getElementById('local-video');
  let isDragging = false, startX, startY, initialX, initialY;
  draggable.onmousedown = dragStart; draggable.ontouchstart = dragStart;
  function dragStart(e) {
    isDragging = true;
    startX = e.clientX || e.touches[0].clientX;
    startY = e.clientY || e.touches[0].clientY;
    initialX = draggable.offsetLeft; initialY = draggable.offsetTop;
    document.onmousemove = dragMove; document.ontouchmove = dragMove;
    document.onmouseup = dragEnd; document.ontouchend = dragEnd;
  }
  function dragMove(e) {
    if (!isDragging) return;
    const dx = (e.clientX || e.touches[0].clientX) - startX;
    const dy = (e.clientY || e.touches[0].clientY) - startY;
    draggable.style.left = (initialX + dx) + 'px';
    draggable.style.top = (initialY + dy) + 'px';
  }
  function dragEnd() {
    isDragging = false;
    document.onmousemove = null; document.ontouchmove = null;
    document.onmouseup = null; document.ontouchend = null;
  }
}

async function startCall(callType) {
  if (!activeFriendId) return;
  document.getElementById('call-screen').classList.remove('hidden');
  document.getElementById('call-username').innerText = document.getElementById('active-friend-name').innerText;
  document.getElementById('call-avatar').src = document.getElementById('active-friend-avatar').src;
  document.getElementById('call-status-text').innerText = 'Calling...';

  if (callType === 'video') {
    document.getElementById('video-container').classList.remove('hidden');
    document.getElementById('cam-switch-btn').classList.remove('hidden');
    setupDraggableVideo();
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: callType === 'video' ? { facingMode: currentFacingMode } : false,
      audio: true
    });
    if (callType === 'video') document.getElementById('local-video').srcObject = localStream;
    const call = peer.call(activeFriendId, localStream, { metadata: { callType, callerName: userName } });
    currentPeerCall = call;
    call.on('stream', (stream) => {
      document.getElementById('call-status-text').innerText = 'Connected';
      startCallTimer();
      remoteStream = stream;
      document.getElementById('remote-video').srcObject = remoteStream;
    });
    call.on('close', () => closeCallScreen());
    call.on('error', () => closeCallScreen());
  } catch (err) { alert("Camera/Mic unavailable"); closeCallScreen(); }
}

async function acceptIncomingCall() {
  document.getElementById('incoming-call-modal').classList.add('hidden');
  document.getElementById('call-screen').classList.remove('hidden');
  const callType = window.incomingCallType || 'audio';
  document.getElementById('call-status-text').innerText = 'Connecting...';
  if (callType === 'video') {
    document.getElementById('video-container').classList.remove('hidden');
    document.getElementById('cam-switch-btn').classList.remove('hidden');
    setupDraggableVideo();
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: callType === 'video' ? { facingMode: currentFacingMode } : false,
      audio: true
    });
    if (callType === 'video') document.getElementById('local-video').srcObject = localStream;
    const call = window.incomingPeerCallObj;
    if (call) {
      call.answer(localStream);
      currentPeerCall = call;
      call.on('stream', (stream) => {
        document.getElementById('call-status-text').innerText = 'Connected';
        startCallTimer();
        remoteStream = stream;
        document.getElementById('remote-video').srcObject = remoteStream;
      });
      call.on('close', () => closeCallScreen());
    }
  } catch(e) { alert("Camera/Mic permission denied"); closeCallScreen(); }
}

async function switchCamera() {
  if (!localStream) return;
  useFrontCamera = !useFrontCamera;
  currentFacingMode = useFrontCamera ? 'user' : 'environment';
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: true });
    const videoTrack = newStream.getVideoTracks()[0];
    if (currentPeerCall && currentPeerCall.peerConnection) {
      const sender = currentPeerCall.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(videoTrack);
    }
    localStream.getVideoTracks()[0].stop();
    localStream = newStream;
    document.getElementById('local-video').srcObject = localStream;
  } catch (err) { alert("Could not switch camera"); }
}

function rejectIncomingCall() {
  document.getElementById('incoming-call-modal').classList.add('hidden');
  if (window.incomingPeerCallObj) window.incomingPeerCallObj.close();
  window.incomingPeerCallObj = null;
}

function endCall() {
  if (currentPeerCall) { currentPeerCall.close(); currentPeerCall = null; }
  closeCallScreen();
}

function closeCallScreen() {
  stopCallTimer();
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  document.getElementById('call-screen').classList.add('hidden');
  document.getElementById('incoming-call-modal').classList.add('hidden');
  document.getElementById('video-container').classList.add('hidden');
  document.getElementById('cam-switch-btn').classList.add('hidden');
  document.getElementById('local-video').srcObject = null;
  document.getElementById('remote-video').srcObject = null;
  window.incomingPeerCallObj = null;
}

function toggleMute() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('mute-btn').style.background = audioTrack.enabled ? 'rgba(255,255,255,0.2)' : '#e11d48';
    }
  }
}

function toggleVideo() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('video-toggle-btn').style.background = videoTrack.enabled ? 'rgba(255,255,255,0.2)' : '#e11d48';
    }
  }
}

// ============================================================
// PART 7: ENCRYPTION & TYPING
// ============================================================
function encryptText(text) { return btoa(encodeURIComponent(text)); }
function decryptText(encodedText) {
  try { return decodeURIComponent(atob(encodedText)); }
  catch(e) { return "🔒 Decryption Failed"; }
}

function handleTyping() {
  if (!activeFriendId) return;
  socket.emit('typing', { receiverId: activeFriendId, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', { receiverId: activeFriendId, isTyping: false }), 1500);
}

// ============================================================
// PART 8: FRIEND MANAGEMENT
// ============================================================
function togglePinFriend(e, friendId) {
  e.stopPropagation();
  if (pinnedFriends.includes(friendId)) pinnedFriends = pinnedFriends.filter(id => id !== friendId);
  else pinnedFriends.push(friendId);
  localStorage.setItem('pinnedFriends', JSON.stringify(pinnedFriends));
  loadDashboardData();
}

async function removeFriend(e, friendId, friendName) {
  e.stopPropagation();
  if (!confirm(`Remove ${friendName} from friends?`)) return;
  try {
    const res = await fetch(`/api/friend/${friendId}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (data.message) {
      alert("Friend removed");
      if (activeFriendId === friendId) {
        activeFriendId = null;
        document.getElementById('active-chat').classList.add('hidden');
        document.getElementById('chat-placeholder').classList.remove('hidden');
      }
      loadDashboardData();
    } else alert(data.error || "Failed");
  } catch (err) { alert("Error removing friend"); }
}

async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard', { headers: headers() });
    const data = await res.json();

    const reqList = document.getElementById('requests-list');
    reqList.innerHTML = '';
    (data.friendRequests || []).forEach(req => {
      reqList.innerHTML += `<div class="list-item"><span><b>${req.name}</b><br><span style="font-size:10.5px; color:var(--slate-500);">${req.rollNo}</span></span><button class="btn-primary" style="padding:6px 12px; font-size:11px;" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
    });

    const chatsSublist = document.getElementById('chats-sublist');
    chatsSublist.innerHTML = '';

    if (data.groups && data.groups.length > 0) {
      chatsSublist.innerHTML += `<div style="padding:8px 16px 4px; font-size:10.5px; font-weight:800; color:var(--brand-700); text-transform:uppercase; letter-spacing:.06em;">GROUPS</div>`;
      data.groups.forEach(g => {
        chatsSublist.innerHTML += `
          <div class="list-item" onclick="openGroupChat('${g._id}', '${g.name.replace(/'/g, "\\'")}')">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:40px; height:40px; border-radius:50%; background: linear-gradient(135deg, var(--brand-600), var(--brand-900)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px;">👥</div>
              <div>
                <span style="font-weight:700; font-size:13.5px;">${g.name}</span>
                <div style="font-size:10.5px; color:var(--brand-600); font-weight:600;">Group Chat</div>
              </div>
            </div>
          </div>`;
      });
      chatsSublist.innerHTML += `<div style="padding:8px 16px 4px; font-size:10.5px; font-weight:800; color:var(--brand-700); text-transform:uppercase; letter-spacing:.06em;">DIRECT CHATS</div>`;
    }

    let sortedFriends = (data.friends || []).sort((a, b) => pinnedFriends.includes(b._id) - pinnedFriends.includes(a._id));

    sortedFriends.forEach(f => {
      const avatar = f.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const isPinned = pinnedFriends.includes(f._id);
      chatsSublist.innerHTML += `
        <div class="list-item" onclick="openChat('${f._id}', '${f.name.replace(/'/g, "\\'")}', ${f.isOnline}, '${avatar}', '${f.lastSeen}')">
          <div style="display:flex; align-items:center; gap:12px; position:relative;">
            <img src="${avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
            ${f.isOnline ? '<span class="online-dot"></span>' : ''}
            <div style="min-width:0;">
              <span style="font-weight:700; font-size:13.5px;">${f.name} ${isPinned ? '<span class="pin-icon">📌</span>' : ''}</span>
              <div style="font-size:10.5px; color:var(--slate-500); font-weight:600; letter-spacing:.3px;">${f.rollNo} · ${f.role || 'student'}</div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; color:${f.isOnline ? 'var(--emerald-600)' : 'var(--slate-500)'}; font-weight:600;">${f.isOnline ? 'Online' : 'Offline'}</span>
            <span onclick="togglePinFriend(event, '${f._id}')" style="cursor:pointer; font-size:13px;" title="Pin">${isPinned ? '📍' : '📌'}</span>
            <span onclick="removeFriend(event, '${f._id}', '${f.name.replace(/'/g, "\\'")}')" style="cursor:pointer; font-size:13px; color:#e11d48;" title="Remove">🗑️</span>
          </div>
        </div>`;
    });
  } catch (err) { console.error('Dashboard load failed', err); }
}

// ============================================================
// PART 9: STATUS
// ============================================================
async function loadStatuses() {
  try {
    const res = await fetch('/api/status', { headers: headers() });
    const statuses = await res.json();
    const list = document.getElementById('statuses-list');
    list.innerHTML = '';
    if (!statuses.length) { list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--slate-400); font-size:12px;">No status updates yet</div>'; return; }
    statuses.forEach(st => {
      const avatar = st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const timeAgo = new Date(st.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.innerHTML += `
        <div class="list-item" onclick='viewStatus(${JSON.stringify(st).replace(/'/g, "&apos;")})'>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="status-ring"><img src="${avatar}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;"></div>
            <div>
              <span style="font-weight:700; display:block; font-size:13px;">${st.user.name}</span>
              <span style="font-size:11px; color:var(--slate-500);">Today at ${timeAgo} (${st.viewers ? st.viewers.length : 0} views)</span>
            </div>
          </div>
        </div>`;
    });
  } catch(e) {}
}

async function loadCallLogs() {
  try {
    const res = await fetch('/api/calls', { headers: headers() });
    const logs = await res.json();
    const list = document.getElementById('calls-list');
    list.innerHTML = '';
    if (!logs.length) { list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--slate-500); font-size:13px;">No recent calls</div>`; return; }
    logs.forEach(log => {
      const isCaller = String(log.caller._id || log.caller) === String(userId);
      const otherUser = isCaller ? log.receiver : log.caller;
      if (!otherUser) return;
      const avatar = otherUser.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const timeStr = new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const arrowIcon = isCaller ? '<span style="color:var(--emerald-600);">↗</span>' : '<span style="color:var(--brand-600);">↙</span>';
      const callIconSymbol = log.callType === 'video' ? '📹' : '📞';
      list.innerHTML += `
        <div class="list-item">
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="${avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
            <div><span style="font-weight:700; display:block; font-size:13px;">${otherUser.name}</span><span style="font-size:11px; color:var(--slate-500);">${arrowIcon} ${timeStr}</span></div>
          </div>
          <span style="font-size:18px; cursor:pointer;" onclick="openChat('${otherUser._id}', '${otherUser.name.replace(/'/g, "\\'")}', true, '${avatar}', '${new Date().toISOString()}')">${callIconSymbol}</span>
        </div>`;
    });
  } catch(e) {}
}

async function clearCallLogs() {
  if (!confirm("Clear all call history?")) return;
  try {
    const res = await fetch('/api/calls/clear', { method: 'DELETE', headers: headers() });
    if (res.ok) { loadCallLogs(); alert('Cleared'); }
  } catch(e) {}
}

async function openStatusCreator() {
  const text = prompt("Enter status text:");
  if (text !== null && text.trim()) {
    const res = await fetch('/api/status', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ mediaType: 'text', text, bgColor: '#2563eb' })
    });
    if (res.ok) loadStatuses();
  }
}

async function uploadStatusMedia(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const fileData = e.target.result;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    const uploadRes = await fetch('/api/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ fileName: file.name, fileData }) });
    const uploadData = await uploadRes.json();
    if (uploadData.error) return alert("Upload failed");
    const statusRes = await fetch('/api/status', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ mediaType, mediaUrl: uploadData.fileUrl, text: prompt("Add a caption (optional):") || "" })
    });
    if (statusRes.ok) loadStatuses();
    input.value = '';
  };
  reader.readAsDataURL(file);
}

function viewStatus(st) {
  fetch(`/api/status/view/${st._id}`, { method: 'POST', headers: headers() });
  const isMyStatus = String(st.user._id || st.user) === String(userId);
  const existingModal = document.querySelector('.status-story-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'status-story-modal';
  modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:#000; z-index:4000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 20px; box-sizing: border-box;";

  let mediaHtml = '';
  if (st.mediaUrl) {
    if (st.mediaType === 'video') mediaHtml = `<video src="${st.mediaUrl}" controls autoplay style="max-width:100%; max-height:55vh; object-fit:contain; background:#000;"></video>`;
    else mediaHtml = `<img src="${st.mediaUrl}" style="max-width:100%; max-height:55vh; object-fit:contain; background:#000;">`;
  }
  let textHtml = st.text ? `<div style="margin-top:10px; color:#fff; font-size:16px; text-align:center; background:rgba(0,0,0,0.6); padding:8px 15px; border-radius:8px; max-width:80%;">${st.text}</div>` : '';

  modal.innerHTML = `
    <div style="position:absolute; top:30px; left:20px; display:flex; align-items:center; gap:10px; z-index:10;">
      <img src="${st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #2563eb;">
      <span style="font-weight:bold; font-size:16px; color:white;">${st.user.name}</span>
    </div>
    ${isMyStatus ? `<button onclick="deleteStatus('${st._id}')" style="position:absolute; top:30px; right:70px; background:#e11d48; color:white; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:bold; z-index:10; font-size:13px;">🗑️ Delete</button>` : ''}
    <span onclick="this.parentElement.remove()" style="position:absolute; top:20px; right:25px; font-size:36px; cursor:pointer; z-index:10; color:white;">&times;</span>
    <div style="background:${st.bgColor || '#0f172a'}; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; box-sizing: border-box;">
      ${mediaHtml} ${textHtml}
    </div>
  `;
  document.body.appendChild(modal);
}

async function deleteStatus(statusId) {
  if (confirm("Delete this status?")) {
    const res = await fetch(`/api/status/${statusId}`, { method: 'DELETE', headers: headers() });
    if (res.ok) { document.querySelector('.status-story-modal').remove(); loadStatuses(); }
  }
}

// ============================================================
// PART 10: GROUPS
// ============================================================
async function createNewGroup() {
  const groupName = prompt("Enter Group Name:");
  if (!groupName) return;
  const friendRolls = prompt("Enter friend Roll Nos (comma separated):");
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  let memberIds = [];
  if (friendRolls) {
    const rolls = friendRolls.split(',').map(n => n.trim().toUpperCase());
    data.friends.forEach(f => { if (rolls.includes(f.rollNo)) memberIds.push(f._id); });
  }
  const createRes = await fetch('/api/groups/create', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ name: groupName, memberIds })
  });
  const createData = await createRes.json();
  if (createData.message) { alert("Group created!"); loadDashboardData(); }
  else alert(createData.error || "Failed");
}

async function openGroupChat(groupId, groupName) {
  activeGroupId = groupId;
  activeFriendId = null;
  toggleSidebar(false);
  document.getElementById('chat-placeholder').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('active-friend-name').innerText = groupName + " (Group)";
  document.getElementById('active-friend-avatar').src = 'https://www.w3schools.com/howto/img_avatar.png';
  document.getElementById('active-friend-status').innerText = 'Group Chat';

  let headerActions = document.querySelector('.chat-header-actions');
  let infoBtn = document.getElementById('group-info-btn');
  if (!infoBtn) {
    infoBtn = document.createElement('button');
    infoBtn.id = 'group-info-btn';
    infoBtn.className = 'icon-btn';
    infoBtn.title = 'Group Info';
    infoBtn.innerHTML = 'ℹ️';
    infoBtn.onclick = () => openGroupInfoModal(groupId);
    headerActions.prepend(infoBtn);
  } else {
    infoBtn.onclick = () => openGroupInfoModal(groupId);
  }

  socket.emit('joinGroup', groupId);
  const res = await fetch(`/api/groups/messages/${groupId}`, { headers: headers() });
  let messages = await res.json();
  const display = document.getElementById('messages-display');
  display.innerHTML = '';
  messages.forEach(msg => renderGroupMessage(msg));
}

async function openGroupInfoModal(groupId) {
  const res = await fetch(`/api/groups/details/${groupId}`, { headers: headers() });
  const group = await res.json();
  if (group.error) return alert(group.error);

  const isAdmin = String(group.admin._id || group.admin) === String(userId);
  let membersHtml = group.members.map(m => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin:6px 0; background:var(--slate-50); padding:9px; border-radius:8px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <img src="${m.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
        <div><span style="color:var(--slate-800); font-size:13px; font-weight:700;">${m.name}</span><br><span style="font-size:10px; color:var(--slate-500);">${m.rollNo} ${m._id === group.admin._id ? '(Admin)' : ''}</span></div>
      </div>
      ${isAdmin && m._id !== userId ? `<button onclick="removeGroupMember('${groupId}', '${m._id}')" style="background:#e11d48; color:white; border:none; padding:4px 8px; border-radius:6px; font-size:10px; cursor:pointer; font-weight:700;">Remove</button>` : ''}
    </div>`).join('');

  let existingModal = document.querySelector('.group-info-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'group-info-modal';
  modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.8); z-index:5000; display:flex; align-items:center; justify-content:center; padding:20px;";
  modal.innerHTML = `
    <div style="background:var(--card-bg); width:100%; max-width:400px; padding:25px; border-radius:16px; position:relative; max-height:80vh; overflow-y:auto;">
      <span onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:15px; right:20px; font-size:24px; cursor:pointer; color:var(--slate-500);">&times;</span>
      <h3 style="color:var(--slate-900); margin-bottom:15px;">👥 ${group.name}</h3>
      <p style="font-size:12px; color:var(--slate-500); margin-bottom:14px;">Admin: ${group.admin.name}</p>
      ${isAdmin ? `
        <div style="margin-bottom:15px; display:flex; gap:8px;">
          <input type="text" id="add-member-rollno" placeholder="Roll No to add..." style="flex:1; padding:8px; border-radius:8px; border:1.5px solid var(--slate-200); font-family:inherit;">
          <button onclick="addGroupMember('${groupId}')" style="background:linear-gradient(135deg, var(--brand-600), var(--brand-700)); color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:700; font-family:inherit;">Add</button>
        </div>` : ''}
      <div style="font-size:13px; font-weight:700; color:var(--slate-700); margin-bottom:8px;">Members (${group.members.length}):</div>
      <div style="max-height:200px; overflow-y:auto;">${membersHtml}</div>
      ${isAdmin ? `<button onclick="deleteGroup('${groupId}')" style="width:100%; background:#e11d48; color:white; border:none; padding:11px; border-radius:8px; cursor:pointer; font-weight:700; margin-top:20px; font-family:inherit;">🗑️ Delete Group</button>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
}

async function addGroupMember(groupId) {
  const rollNo = document.getElementById('add-member-rollno').value.trim().toUpperCase();
  if (!rollNo) return alert("Enter a Roll No");
  const res = await fetch('/api/groups/add-member', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ groupId, rollNo })
  });
  const data = await res.json();
  if (data.message) { alert("Member added"); openGroupInfoModal(groupId); loadDashboardData(); }
  else alert(data.error || "Failed");
}

async function removeGroupMember(groupId, memberId) {
  if (!confirm("Remove this member?")) return;
  const res = await fetch('/api/groups/remove-member', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ groupId, memberId })
  });
  const data = await res.json();
  if (data.message) { alert("Removed"); openGroupInfoModal(groupId); }
  else alert(data.error || "Failed");
}

async function deleteGroup(groupId) {
  if (!confirm("Delete this group for everyone?")) return;
  const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE', headers: headers() });
  const data = await res.json();
  if (data.message) {
    document.querySelector('.group-info-modal').remove();
    activeGroupId = null;
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('chat-placeholder').classList.remove('hidden');
    loadDashboardData();
  }
}

function renderGroupMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const type = msgSenderId === String(userId) ? 'sent' : 'received';
  let contentHtml = `<div class="media-box" id="msg-container-${msg._id}">`;
  if (type === 'received') contentHtml += `<div style="font-size:11px; font-weight:800; color:var(--brand-700); margin-bottom:3px;">${msg.sender.name}</div>`;
  if (msg.fileUrl) {
    if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}" onclick="openImageModal('${msg.fileUrl}')" style="cursor:pointer;">`;
    else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
    else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="width:100%; margin:4px 0;"></audio>`;
    else contentHtml += `<div style="padding:10px; background:rgba(15,23,42,.05); border-radius:8px; margin-bottom:5px; font-size:12.5px;">📄 ${msg.fileName}</div>`;
    contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:var(--brand-700); text-decoration:none; font-size:12px; font-weight:700; display:block; margin-top:6px;">⬇ Download</a>`;
  }
  if (msg.text) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;
  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  contentHtml += `<div style="float:right; font-size:10px; color:var(--slate-500); margin-top:2px; margin-left:8px;">${timeString}</div></div>`;
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

// ============================================================
// PART 11: FRIEND REQUESTS
// ============================================================
async function sendFriendRequest() {
  const target = document.getElementById('target-username').value.trim().toUpperCase();
  if (!target) return alert('Enter Roll No');
  const res = await fetch('/api/friend-request', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ targetRollNo: target })
  });
  const data = await res.json();
  alert(data.message || data.error);
  document.getElementById('target-username').value = '';
}

async function acceptFriend(requesterId) {
  await fetch('/api/accept-request', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ requesterId })
  });
  loadDashboardData();
}

// ============================================================
// PART 12: OPEN CHAT
// ============================================================
async function openChat(friendId, friendName, isOnline, avatar, lastSeen) {
  activeFriendId = friendId;
  activeGroupId = null;
  let infoBtn = document.getElementById('group-info-btn');
  if (infoBtn) infoBtn.remove();

  toggleSidebar(false);
  document.getElementById('chat-placeholder').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('active-friend-name').innerText = friendName;
  document.getElementById('active-friend-avatar').src = avatar;
  document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const res = await fetch(`/api/messages/${friendId}`, { headers: headers() });
  let messages = await res.json();
  const display = document.getElementById('messages-display');
  display.innerHTML = '';
  messages.forEach(msg => {
    if (msg.text && msg.isEncrypted) msg.text = decryptText(msg.text);
    renderSingleMessage(msg);
  });

  // Apply wallpaper for this chat
  requestAnimationFrame(applyCurrentChatWallpaper);
}
window.openChat = openChat;

function setReply(msgText) {
  replyMessageData = msgText;
  document.getElementById('reply-preview-text').innerText = msgText;
  document.getElementById('reply-preview-bar').classList.remove('hidden');
  document.getElementById('message-input').focus();
}

function cancelReply() {
  replyMessageData = null;
  document.getElementById('reply-preview-bar').classList.add('hidden');
}

function sendReaction(msgId, emoji) { socket.emit('reactionEmit', { msgId, emoji, receiverId: activeFriendId }); }
function openImageModal(url) { document.getElementById('modal-img').src = url; document.getElementById('image-modal').classList.remove('hidden'); }
function closeImageModal() { document.getElementById('image-modal').classList.add('hidden'); }
function toggleInChatSearch() {
  const el = document.getElementById('in-chat-search');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) el.focus();
}
function searchInChat(query) {
  document.querySelectorAll('.msg').forEach(m => {
    if (query && m.innerText.toLowerCase().includes(query.toLowerCase())) m.style.background = 'rgba(37, 99, 235, 0.15)';
    else m.style.background = '';
  });
}

async function clearFullChat() {
  if (!activeFriendId) return;
  if (confirm("Clear this entire chat?")) {
    try {
      const res = await fetch(`/api/messages/clear/${activeFriendId}`, { method: 'DELETE', headers: headers() });
      const data = await res.json();
      if (data.message) {
        document.getElementById('messages-display').innerHTML = '';
        socket.emit('clearChatEmit', { receiverId: activeFriendId });
      }
    } catch (err) {}
  }
}

// ============================================================
// PART 13: MIC & FILE
// ============================================================
function setupMic() {
  const micBtn = document.getElementById('mic-btn');
  if (!micBtn) return;
  micBtn.onclick = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
          const reader = new FileReader();
          reader.onload = async () => {
            selectedFile = { name: `Voice-${Date.now()}.mp3`, type: 'audio/mp3', data: reader.result };
            document.getElementById('message-input').value = '🎤 Voice Note (Ready)';
          };
          reader.readAsDataURL(audioBlob);
        };
        mediaRecorder.start();
        isRecording = true;
        micBtn.innerText = '⏹️';
      } catch(e) { alert("Microphone access denied"); }
    } else {
      mediaRecorder.stop();
      isRecording = false;
      micBtn.innerText = '🎙️';
    }
  };
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFile = { name: file.name, type: file.type, data: e.target.result };
    document.getElementById('message-input').value = `📎 ${file.name} (Ready)`;
  };
  reader.readAsDataURL(file);
}

function deleteMessage(msgId) {
  if (confirm("Delete this message for everyone?")) socket.emit('deleteMsgEmit', { msgId, receiverId: activeFriendId });
}

// ============================================================
// PART 14: RENDER MESSAGE
// ============================================================
function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const type = msgSenderId === String(userId) ? 'sent' : 'received';
  let contentHtml = `<div class="media-box" id="msg-container-${msg._id}">`;
  if (msg.replyTo) contentHtml += `<div class="quoted-reply-box">↩ ${msg.replyTo}</div>`;
  if (type === 'sent' && msg.text !== '🚫 This message was deleted') contentHtml += `<button class="msg-del-btn" onclick="deleteMessage('${msg._id}')">✕</button>`;

  if (msg.fileUrl) {
    if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}" onclick="openImageModal('${msg.fileUrl}')" style="cursor:pointer;">`;
    else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
    else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="width:100%; margin:4px 0;"></audio>`;
    else contentHtml += `<div style="padding:10px; background:rgba(15,23,42,.05); border-radius:8px; margin-bottom:5px; font-size:12.5px;">📄 ${msg.fileName}</div>`;
    contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:var(--brand-700); text-decoration:none; font-size:12px; font-weight:700; display:block; margin-top:6px;">⬇ Download</a>`;
  }
  if (msg.text) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;

  if (msg.text !== '🚫 This message was deleted') {
    const cleanText = (msg.text || msg.fileName || 'Media').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    contentHtml += `
      <div class="msg-action-row">
        <span onclick="setReply('${cleanText}')" class="reply-action-btn">↩ Reply</span>
        <div class="emoji-picker-inline">
          <span onclick="sendReaction('${msg._id}', '❤️')">❤️</span>
          <span onclick="sendReaction('${msg._id}', '👍')">👍</span>
          <span onclick="sendReaction('${msg._id}', '😂')">😂</span>
          <span onclick="sendReaction('${msg._id}', '😮')">😮</span>
        </div>
      </div>
      <span id="reaction-badge-${msg._id}" class="reaction-badge hidden"></span>`;
  }

  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let footerHtml = `<div style="float:right; display:flex; align-items:center; gap:4px; margin-top:2px; margin-left:8px; font-size:10px; color:var(--slate-500); font-weight:600;"><span>${timeString}</span>`;
  if (type === 'sent') {
    let tickSymbol = '✓', tickColor = 'var(--slate-400)';
    if (msg.status === 'delivered' || msg.status === 'read') tickSymbol = '✓✓';
    if (msg.status === 'read') tickColor = '#3b82f6';
    footerHtml += `<span class="tick-status" id="tick-${msg._id}" style="color:${tickColor}; font-weight:bold;">${tickSymbol}</span>`;
  }
  footerHtml += `</div></div>`;
  contentHtml += footerHtml;
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

// ============================================================
// PART 15: SEND MESSAGE
// ============================================================
async function sendMessage() {
  const input = document.getElementById('message-input');
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

  let currentReplyTo = replyMessageData;
  cancelReply();

  if (activeGroupId) {
    if (selectedFile) {
      const filePayload = selectedFile;
      selectedFile = null;
      document.getElementById('file-input').value = "";
      input.value = '';
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", localStorage.getItem('token'));
      xhr.onload = function() {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (response.fileUrl) socket.emit('sendGroupMessage', { groupId: activeGroupId, senderId: userId, text: textToSend, fileUrl: response.fileUrl, fileName: filePayload.name, fileType: filePayload.type });
        }
      };
      xhr.send(JSON.stringify({ fileName: filePayload.name, fileData: filePayload.data }));
    } else {
      socket.emit('sendGroupMessage', { groupId: activeGroupId, senderId: userId, text: textToSend });
      input.value = '';
    }
    return;
  }

  if (selectedFile) {
    const filePayload = selectedFile;
    selectedFile = null;
    document.getElementById('file-input').value = "";
    input.value = '';
    if (textToSend.includes('(Ready)')) textToSend = "";
    const timestamp = Date.now();
    const display = document.getElementById('messages-display');
    display.innerHTML += `
      <div class="msg sent" id="temp-${timestamp}">
        <div class="media-box">
          <div style="font-size:13px; margin-bottom: 5px;">📤 Uploading: ${filePayload.name}</div>
          <div style="background:rgba(15,23,42,.08); border-radius:4px; height:6px; width:100%; overflow:hidden; margin:4px 0;">
            <div class="progress-bar" id="progress-${timestamp}" style="width: 0%; height:100%; background:var(--brand-600); transition: width 0.2s;"></div>
          </div>
          <span id="percent-${timestamp}" style="font-size:11px; color:var(--slate-500);">0%</span>
        </div>
      </div>`;
    display.scrollTop = display.scrollHeight;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Authorization", localStorage.getItem('token'));
    xhr.upload.onprogress = function(event) {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        const bar = document.getElementById(`progress-${timestamp}`);
        const txt = document.getElementById(`percent-${timestamp}`);
        if (bar) bar.style.width = percentComplete + '%';
        if (txt) txt.innerText = percentComplete + '%';
      }
    };
    xhr.onload = function() {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        if (response.fileUrl) {
          let cipherText = textToSend ? encryptText(textToSend) : "";
          socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: cipherText, fileUrl: response.fileUrl, fileName: filePayload.name, fileType: filePayload.type, timestamp, isEncrypted: true, replyTo: currentReplyTo });
        }
      } else {
        alert("File upload failed.");
        const temp = document.getElementById(`temp-${timestamp}`);
        if (temp) temp.remove();
      }
    };
    xhr.send(JSON.stringify({ fileName: filePayload.name, fileData: filePayload.data }));
  } else {
    let encryptedSecret = encryptText(textToSend);
    const timestamp = Date.now();
    input.value = '';
    socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: encryptedSecret, timestamp, isEncrypted: true, replyTo: currentReplyTo });
    renderSingleMessage({ _id: 'temp-' + timestamp, sender: { _id: userId }, receiver: { _id: activeFriendId }, text: textToSend, timestamp, status: 'sent', replyTo: currentReplyTo, isEncrypted: false });
  }
}

function logout() {
  localStorage.clear();
  window.location.reload();
}

// ============================================================
// ============================================================
// EXTRA FEATURE 1: CHAT WALLPAPER (per chat)
// ============================================================
function getCurrentChatKey() {
  const friendNameElem = document.getElementById('active-friend-name');
  if (friendNameElem && friendNameElem.innerText && friendNameElem.innerText !== 'Select a chat') {
    return "wp_user_" + friendNameElem.innerText.trim();
  }
  return null;
}

function applyCurrentChatWallpaper() {
  const chatKey = getCurrentChatKey();
  const messagesDisplay = document.getElementById('messages-display');
  if (!messagesDisplay) return;
  if (chatKey) {
    const savedWallpaper = localStorage.getItem(chatKey);
    if (savedWallpaper) {
      applyWallpaperStyle(savedWallpaper, messagesDisplay);
      return;
    }
  }
  messagesDisplay.style.background = 'var(--chat-bg)';
  messagesDisplay.style.backgroundSize = 'auto';
}

function openWallpaperSelector() {
  const chatKey = getCurrentChatKey();
  if (!chatKey) return alert("Please open a chat first!");
  let choice = prompt(
    "Choose Chat Background:\n\n" +
    "1. Default Theme\n" +
    "2. Dark Charcoal\n" +
    "3. Soft Blue\n" +
    "4. Lavender Night\n" +
    "5. Ocean Gradient\n" +
    "6. Upload Custom Photo\n\nEnter option (1-6):"
  );
  if (!choice) return;

  const wallpapers = {
    '1': 'var(--chat-bg)',
    '2': '#0b141a',
    '3': '#e1f5fe',
    '4': '#1a102f',
    '5': 'linear-gradient(135deg, #2563eb, #1e40af)'
  };

  if (wallpapers[choice]) {
    localStorage.setItem(chatKey, wallpapers[choice]);
    applyCurrentChatWallpaper();
    alert("Wallpaper updated!");
  } else if (choice === '6') {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Image = `url('${event.target.result}')`;
        localStorage.setItem(chatKey, base64Image);
        applyCurrentChatWallpaper();
        alert("Custom wallpaper applied!");
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  } else {
    alert("Invalid option");
  }
}

function applyWallpaperStyle(bgValue, element) {
  if (bgValue.startsWith('url(')) {
    element.style.background = bgValue;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
  } else {
    element.style.background = bgValue;
    element.style.backgroundSize = 'auto';
  }
}

// ============================================================
// EXTRA FEATURE 2: CYBER MODE
// ============================================================
function toggleCyberMode() {
  let isCyberActive = localStorage.getItem('cyberMode') === 'true';
  isCyberActive = !isCyberActive;
  localStorage.setItem('cyberMode', isCyberActive);
  applyCyberTheme(isCyberActive, false);
}

function applyCyberTheme(isActive, silent) {
  const appContainer = document.querySelector('.app-container');
  if (!appContainer) return;
  if (isActive) {
    appContainer.style.filter = 'hue-rotate(90deg) contrast(120%)';
    document.body.style.background = '#000000';
    if (!silent) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      try { audio.play(); } catch(e){}
    }
    if (!document.getElementById('matrix-rain-canvas')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'matrix-rain-canvas';
      canvas.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:9999; opacity:0.15;";
      document.body.appendChild(canvas);
      startMatrixRain(canvas);
    }
    if (!silent) alert("⚡ CYBER HACKER MODE ACTIVATED!");
  } else {
    appContainer.style.filter = 'none';
    document.body.style.background = '';
    const canvas = document.getElementById('matrix-rain-canvas');
    if (canvas) canvas.remove();
    if (!silent) alert("Normal mode restored.");
  }
}

function startMatrixRain(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const letters = '01ABCDEF_BM_GROUP_CHAT_SUMIT';
  const fontSize = 16;
  const columns = canvas.width / fontSize;
  const drops = [];
  for (let x = 0; x < columns; x++) drops[x] = 1;
  function draw() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f0';
    ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
      const text = letters.charAt(Math.floor(Math.random() * letters.length));
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }
  setInterval(draw, 30);
}

// ============================================================
// EXTRA FEATURE 3: SECRET VAULT
// ============================================================
function toggleChatVault() {
  const friendNameElem = document.getElementById('active-friend-name');
  if (!friendNameElem || friendNameElem.innerText === 'Select a chat') {
    alert("Open a chat first!");
    return;
  }
  const chatName = friendNameElem.innerText.trim();
  const vaultKey = `vault_lock_${chatName}`;
  const isLocked = localStorage.getItem(vaultKey) === 'true';

  if (!isLocked) {
    let pin = prompt("Set a 4-digit PIN to lock this chat:");
    if (pin && pin.length >= 3) {
      localStorage.setItem(vaultKey, 'true');
      localStorage.setItem(`vault_pin_${chatName}`, pin);
      alert(`🔐 Chat with ${chatName} locked!`);
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('chat-placeholder').classList.remove('hidden');
    } else {
      alert("PIN must be at least 3-4 digits.");
    }
  } else {
    let enteredPin = prompt("Enter PIN to unlock:");
    const savedPin = localStorage.getItem(`vault_pin_${chatName}`);
    if (enteredPin === savedPin) {
      localStorage.setItem(vaultKey, 'false');
      alert(`🔓 Unlocked!`);
    } else {
      alert("❌ Incorrect PIN");
    }
  }
}

// ============================================================
// EXTRA FEATURE 4: AI BOT AUTO-REPLY
// ============================================================
let aiBotActive = false;
function toggleAIBot() {
  aiBotActive = !aiBotActive;
  if (aiBotActive) {
    alert("🤖 AI Companion Activated!");
    window._aiInterval = setInterval(simulateAIResponse, 6000);
  } else {
    clearInterval(window._aiInterval);
    alert("🤖 AI Companion Deactivated.");
  }
}

function simulateAIResponse() {
  if (!aiBotActive) return;
  const display = document.getElementById('messages-display');
  if (!display || !activeFriendId) return;

  const responses = [
    "⚡ [AI BOT]: Neural link established. Affirmative.",
    "🤖 [AI BOT]: Processing quantum data stream...",
    "⚡ [AI BOT]: Acknowledged. Encryption verified.",
    "🤖 [AI BOT]: Systems optimal. Standing by."
  ];
  const randomReply = responses[Math.floor(Math.random() * responses.length)];
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  display.innerHTML += `
    <div class="msg received">
      <div class="media-box">
        <p style="margin-top:4px; color:#2563eb; font-family:monospace; font-size:13px;">${randomReply}</p>
        <div style="float:right; margin-top:2px; margin-left:8px; font-size:10px; color:var(--slate-500); font-weight:600;">
          <span>${timeString}</span>
        </div>
      </div>
    </div>`;
  display.scrollTop = display.scrollHeight;
}

// ============================================================
// HEADER BUTTONS ATTACH (wallpaper, cyber, vault, AI bot)
// ============================================================
function attachCustomHeaderButtons() {
  const chatHeaderActions = document.querySelector('.chat-header-actions');
  if (!chatHeaderActions) return;

  if (!document.getElementById('wallpaper-custom-btn')) {
    const wallpaperBtn = document.createElement('button');
    wallpaperBtn.id = 'wallpaper-custom-btn';
    wallpaperBtn.className = 'icon-btn';
    wallpaperBtn.title = 'Change Chat Wallpaper';
    wallpaperBtn.innerHTML = '🎨';
    wallpaperBtn.onclick = openWallpaperSelector;
    chatHeaderActions.prepend(wallpaperBtn);
  }

  if (!document.getElementById('cyber-mode-btn')) {
    const cyberBtn = document.createElement('button');
    cyberBtn.id = 'cyber-mode-btn';
    cyberBtn.className = 'icon-btn';
    cyberBtn.title = 'Cyber Mode';
    cyberBtn.innerHTML = '⚡';
    cyberBtn.onclick = toggleCyberMode;
    chatHeaderActions.prepend(cyberBtn);
  }

  if (!document.getElementById('vault-btn')) {
    const vaultBtn = document.createElement('button');
    vaultBtn.id = 'vault-btn';
    vaultBtn.className = 'icon-btn';
    vaultBtn.title = 'Secret Vault Lock';
    vaultBtn.innerHTML = '🔐';
    vaultBtn.onclick = toggleChatVault;
    chatHeaderActions.prepend(vaultBtn);
  }

  if (!document.getElementById('ai-bot-btn')) {
    const aiBtn = document.createElement('button');
    aiBtn.id = 'ai-bot-btn';
    aiBtn.className = 'icon-btn';
    aiBtn.title = 'AI Auto-Reply Bot';
    aiBtn.innerHTML = '🤖';
    aiBtn.onclick = toggleAIBot;
    chatHeaderActions.prepend(aiBtn);
  }
}

// ============================================================
// EXPOSE GLOBALS (for inline onclick attributes)
// ============================================================
window.authAction = authAction;
window.toggleRegisterMode = toggleRegisterMode;
window.changePassword = changePassword;
window.uploadProfilePic = uploadProfilePic;
window.toggleTheme = toggleTheme;
window.toggleSidebar = toggleSidebar;
window.switchTab = switchTab;
window.openGroupChat = openGroupChat;
window.openGroupInfoModal = openGroupInfoModal;
window.addGroupMember = addGroupMember;
window.removeGroupMember = removeGroupMember;
window.deleteGroup = deleteGroup;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriend = acceptFriend;
window.togglePinFriend = togglePinFriend;
window.removeFriend = removeFriend;
window.openChat = openChat;
window.setReply = setReply;
window.cancelReply = cancelReply;
window.sendReaction = sendReaction;
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;
window.toggleInChatSearch = toggleInChatSearch;
window.searchInChat = searchInChat;
window.clearFullChat = clearFullChat;
window.handleFileSelect = handleFileSelect;
window.deleteMessage = deleteMessage;
window.sendMessage = sendMessage;
window.logout = logout;
window.createNewGroup = createNewGroup;
window.openStatusCreator = openStatusCreator;
window.uploadStatusMedia = uploadStatusMedia;
window.viewStatus = viewStatus;
window.deleteStatus = deleteStatus;
window.clearCallLogs = clearCallLogs;
window.startCall = startCall;
window.acceptIncomingCall = acceptIncomingCall;
window.rejectIncomingCall = rejectIncomingCall;
window.endCall = endCall;
window.toggleMute = toggleMute;
window.toggleVideo = toggleVideo;
window.switchCamera = switchCamera;
window.toggleCyberMode = toggleCyberMode;
window.toggleChatVault = toggleChatVault;
window.toggleAIBot = toggleAIBot;
window.openWallpaperSelector = openWallpaperSelector;
