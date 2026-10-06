// ============================================================
// BM GROUP CHAT PORTAL — FULL JS (Single File)
// iOS Glass UI • All Features Combined
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
// PART 2: TOAST NOTIFICATION
// ============================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMsg');
  if (!toast || !msg) return;
  msg.textContent = message;
  toast.style.borderLeft = type === 'success' ? '4px solid #34C759' :
                            type === 'error' ? '4px solid #FF3B30' :
                            '4px solid #0A84FF';
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 3500);
}
window.showToast = showToast;

// ============================================================
// PART 3: WINDOW LOAD
// ============================================================
window.onload = () => {
  if (token && userRollNo) {
    showDashboard();
    if (localStorage.getItem('profilePic')) {
      const av = document.getElementById('my-avatar');
      if (av) av.src = localStorage.getItem('profilePic');
      const av2 = document.getElementById('my-status-avatar');
      if (av2) av2.src = localStorage.getItem('profilePic');
    }
  }
  setupMic();
  if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }
  if (localStorage.getItem('cyberMode') === 'true') {
    setTimeout(() => applyCyberTheme(true, true), 1500);
  }
};

// ============================================================
// PART 4: AUTH
// ============================================================
let isRegisterMode = false;

function toggleRegisterMode() {
  isRegisterMode = !isRegisterMode;
  document.getElementById('reg-name-wrap').classList.toggle('hidden', !isRegisterMode);
  document.getElementById('reg-role-wrap').classList.toggle('hidden', !isRegisterMode);
  document.getElementById('login-btn').textContent = isRegisterMode ? 'Register' : 'Sign In';
  document.getElementById('register-btn').textContent = isRegisterMode ? 'Back' : 'Register';
  if (isRegisterMode) {
    document.getElementById('login-btn').setAttribute('onclick', "authAction('register')");
    document.getElementById('register-btn').setAttribute('onclick', "toggleRegisterMode()");
  } else {
    document.getElementById('login-btn').setAttribute('onclick', "authAction('login')");
    document.getElementById('register-btn').setAttribute('onclick', "toggleRegisterMode()");
  }
}
window.toggleRegisterMode = toggleRegisterMode;

async function authAction(type) {
  const rollNo = document.getElementById('auth-rollno').value.trim().toUpperCase();
  const password = document.getElementById('auth-password').value.trim();
  if (!rollNo || !password) return showToast('Please fill Roll No and Password', 'error');

  let body = { rollNo, password };

  if (type === 'register') {
    const name = document.getElementById('auth-name').value.trim();
    const role = document.getElementById('auth-role').value;
    const branch = document.getElementById('auth-branch').value;
    if (!name) return showToast('Please enter your full name', 'error');
    body = { rollNo, password, name, role, branch };
  }

  const btn = type === 'login' ? document.getElementById('login-btn') : document.getElementById('register-btn');
  const originalText = btn.innerText;
  btn.innerText = type === 'login' ? 'Signing in...' : 'Registering...';
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
      showToast(data.error, 'error');
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
      showToast('Welcome back!', 'success');
      setTimeout(() => window.location.reload(), 500);
    } else {
      showToast('Registered successfully! Now sign in.', 'success');
      toggleRegisterMode();
      btn.innerText = originalText;
      btn.disabled = false;
    }
  } catch (err) {
    showToast('Connection error. Please try again.', 'error');
    btn.innerText = originalText;
    btn.disabled = false;
  }
}
window.authAction = authAction;

async function changePassword() {
  const oldPassword = prompt("Enter your current password:");
  if (!oldPassword) return;
  const newPassword = prompt("Enter your new password (min 6 chars):");
  if (!newPassword || newPassword.length < 6) return showToast('Password must be 6+ chars', 'error');
  try {
    const res = await fetch('/api/change-password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ oldPassword, newPassword })
    });
    const data = await res.json();
    if (data.error) showToast(data.error, 'error');
    else showToast(data.message, 'success');
  } catch (err) { showToast('Failed to change password', 'error'); }
}
window.changePassword = changePassword;

async function uploadProfilePic(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    document.getElementById('my-avatar').src = base64;
    const av2 = document.getElementById('my-status-avatar');
    if (av2) av2.src = base64;
    localStorage.setItem('profilePic', base64);
    await fetch('/api/profile-pic', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ profilePic: base64 })
    });
    showToast('Profile picture updated', 'success');
  };
  reader.readAsDataURL(file);
}
window.uploadProfilePic = uploadProfilePic;

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
window.toggleTheme = toggleTheme;

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const chatArea = document.getElementById('chat-area');
  if (window.innerWidth <= 768) {
    if (show) { sidebar.classList.remove('mobile-hidden'); chatArea.classList.add('mobile-hidden'); }
    else { sidebar.classList.add('mobile-hidden'); chatArea.classList.remove('mobile-hidden'); }
  }
}
window.toggleSidebar = toggleSidebar;

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
window.switchTab = switchTab;

// ============================================================
// PART 5: DASHBOARD & SOCKET
// ============================================================
function showDashboard() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('current-user-display').innerText = userName || 'User';
  document.getElementById('current-user-roll').innerText = userRollNo + ' · ' + (userRole || 'student');

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

  socket.on('errorMessage', (data) => showToast(data.error, 'error'));
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
    if (el) el.innerHTML = '<p style="font-style:italic; color:var(--text-secondary); font-size:13px; margin:2px 0;">🚫 This message was deleted</p>';
  });

  socket.on('chatClearedEvent', () => {
    const display = document.getElementById('messages-display');
    if (display) display.innerHTML = '';
  });

  socket.on('statusUpdated', () => loadStatuses());
  socket.on('statusChanged', ({ userId: changedId, isOnline, lastSeen }) => {
    loadDashboardData();
    if (String(activeFriendId) === String(changedId)) {
      document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : `Last seen ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      document.getElementById('active-friend-status').classList.toggle('online', isOnline);
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  loadDashboardData();

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
// PART 6: PEER JS
// ============================================================
function initPeerJS() {
  peer = new Peer(userId, { host: '0.peerjs.com', port: 443, secure: true });
  peer.on('open', (id) => console.log('Peer connected:', id));
  peer.on('call', async (call) => {
    currentPeerCall = call;
    const callType = call.metadata?.callType || 'audio';
    const callerName = call.metadata?.callerName || 'Friend';
    document.getElementById('incoming-caller-name').innerText = `${callerName}`;
    document.getElementById('incoming-call-modal').classList.remove('hidden');
    window.incomingPeerCallObj = call;
    window.incomingCallType = callType;
  });
}

// ============================================================
// PART 7: CALLS
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
  } catch (err) { showToast('Camera/Mic unavailable', 'error'); closeCallScreen(); }
}
window.startCall = startCall;

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
  } catch(e) { showToast('Camera/Mic permission denied', 'error'); closeCallScreen(); }
}
window.acceptIncomingCall = acceptIncomingCall;

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
  } catch (err) { showToast('Could not switch camera', 'error'); }
}
window.switchCamera = switchCamera;

function rejectIncomingCall() {
  document.getElementById('incoming-call-modal').classList.add('hidden');
  if (window.incomingPeerCallObj) window.incomingPeerCallObj.close();
  window.incomingPeerCallObj = null;
}
window.rejectIncomingCall = rejectIncomingCall;

function endCall() {
  if (currentPeerCall) { currentPeerCall.close(); currentPeerCall = null; }
  closeCallScreen();
}
window.endCall = endCall;

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
      document.getElementById('mute-btn').style.background = audioTrack.enabled ? 'rgba(255,255,255,0.14)' : 'rgba(255,59,48,0.85)';
    }
  }
}
window.toggleMute = toggleMute;

function toggleVideo() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('video-toggle-btn').style.background = videoTrack.enabled ? 'rgba(255,255,255,0.14)' : 'rgba(255,59,48,0.85)';
    }
  }
}
window.toggleVideo = toggleVideo;

// ============================================================
// PART 8: ENCRYPTION & TYPING
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
window.handleTyping = handleTyping;

// ============================================================
// PART 9: FRIEND MANAGEMENT
// ============================================================
function togglePinFriend(e, friendId) {
  e.stopPropagation();
  if (pinnedFriends.includes(friendId)) pinnedFriends = pinnedFriends.filter(id => id !== friendId);
  else pinnedFriends.push(friendId);
  localStorage.setItem('pinnedFriends', JSON.stringify(pinnedFriends));
  loadDashboardData();
}
window.togglePinFriend = togglePinFriend;

async function removeFriend(e, friendId, friendName) {
  e.stopPropagation();
  if (!confirm(`Remove ${friendName} from friends?`)) return;
  try {
    const res = await fetch(`/api/friend/${friendId}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (data.message) {
      showToast('Friend removed', 'success');
      if (activeFriendId === friendId) {
        activeFriendId = null;
        document.getElementById('active-chat').classList.add('hidden');
        document.getElementById('chat-placeholder').classList.remove('hidden');
      }
      loadDashboardData();
    } else showToast(data.error || 'Failed', 'error');
  } catch (err) { showToast('Error removing friend', 'error'); }
}
window.removeFriend = removeFriend;

async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard', { headers: headers() });
    const data = await res.json();

    const reqList = document.getElementById('requests-list');
    reqList.innerHTML = '';
    if (data.friendRequests && data.friendRequests.length > 0) {
      reqList.innerHTML += `<div class="section-label">Pending Requests</div>`;
      data.friendRequests.forEach(req => {
        reqList.innerHTML += `
          <div class="chat-item">
            <div class="chat-avatar-wrap">
              <img class="chat-avatar" src="${req.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}">
            </div>
            <div class="chat-info">
              <div class="chat-name">${req.name}</div>
              <div class="chat-sub">${req.rollNo} · ${req.role || 'student'}</div>
            </div>
            <button class="btn btn-primary" style="height:34px; padding:0 14px; font-size:12.5px;" onclick="acceptFriend('${req._id}')">Accept</button>
          </div>`;
      });
    }

    const chatsSublist = document.getElementById('chats-sublist');
    chatsSublist.innerHTML = '';

    if (data.groups && data.groups.length > 0) {
      chatsSublist.innerHTML += `<div class="section-label">Groups</div>`;
      data.groups.forEach(g => {
        chatsSublist.innerHTML += `
          <div class="chat-item" onclick="openGroupChat('${g._id}', '${g.name.replace(/'/g, "\\'")}')">
            <div class="chat-avatar-wrap">
              <div style="width:48px; height:48px; border-radius:50%; background: linear-gradient(135deg, #AF52DE, #5856D6); display:flex; align-items:center; justify-content:center; color:#fff; font-size:20px; font-weight:700; box-shadow: 0 4px 12px rgba(175,82,222,.3);">👥</div>
            </div>
            <div class="chat-info">
              <div class="chat-name-row">
                <div class="chat-name">${g.name}</div>
              </div>
              <div class="chat-sub" style="color: var(--ios-purple); font-weight:700;">Group Chat</div>
            </div>
          </div>`;
      });
    }

    if (data.friends && data.friends.length > 0) {
      chatsSublist.innerHTML += `<div class="section-label">Chats</div>`;
    }

    let sortedFriends = (data.friends || []).sort((a, b) => pinnedFriends.includes(b._id) - pinnedFriends.includes(a._id));

    sortedFriends.forEach(f => {
      const avatar = f.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const isPinned = pinnedFriends.includes(f._id);
      chatsSublist.innerHTML += `
        <div class="chat-item" onclick="openChat('${f._id}', '${f.name.replace(/'/g, "\\'")}', ${f.isOnline}, '${avatar}', '${f.lastSeen}')">
          <div class="chat-avatar-wrap">
            <img class="chat-avatar" src="${avatar}">
            ${f.isOnline ? '<span class="online-dot"></span>' : ''}
          </div>
          <div class="chat-info">
            <div class="chat-name-row">
              <div class="chat-name">${f.name}${isPinned ? ' <span class="pin-badge">📌</span>' : ''}</div>
              <div class="chat-meta ${f.isOnline ? 'online' : ''}">${f.isOnline ? 'Online' : 'Offline'}</div>
            </div>
            <div class="chat-sub">${f.rollNo} · ${f.role || 'student'}</div>
          </div>
          <div class="chat-actions-mini">
            <button class="mini-action" onclick="togglePinFriend(event, '${f._id}')" title="Pin">${isPinned ? '📍' : '📌'}</button>
            <button class="mini-action danger" onclick="removeFriend(event, '${f._id}', '${f.name.replace(/'/g, "\\'")}')" title="Delete">🗑</button>
          </div>
        </div>`;
    });

    if (sortedFriends.length === 0 && (!data.groups || data.groups.length === 0)) {
      chatsSublist.innerHTML += `<div style="padding:40px 20px; text-align:center; color:var(--text-secondary); font-size:13.5px;">No chats yet. Add a friend by Roll No above!</div>`;
    }
  } catch (err) { console.error('Dashboard load failed', err); }
}

// ============================================================
// PART 10: STATUS
// ============================================================
async function loadStatuses() {
  try {
    const res = await fetch('/api/status', { headers: headers() });
    const statuses = await res.json();
    const list = document.getElementById('statuses-list');
    list.innerHTML = '';
    if (!statuses.length) { list.innerHTML = '<div style="padding:30px 20px; text-align:center; color:var(--text-secondary); font-size:13px;">No status updates yet</div>'; return; }
    statuses.forEach(st => {
      const avatar = st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const timeAgo = new Date(st.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      list.innerHTML += `
        <div class="status-item" onclick='viewStatus(${JSON.stringify(st).replace(/'/g, "&apos;")})'>
          <div class="status-ring"><img src="${avatar}"></div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:14.5px; color:var(--text-primary);">${st.user.name}</div>
            <div style="font-size:12.5px; color:var(--text-secondary); margin-top:2px;">Today at ${timeAgo} · ${st.viewers ? st.viewers.length : 0} views</div>
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
    if (!logs.length) { list.innerHTML = `<div style="padding:40px 20px; text-align:center; color:var(--text-secondary); font-size:13px;">No recent calls</div>`; return; }
    logs.forEach(log => {
      const isCaller = String(log.caller._id || log.caller) === String(userId);
      const otherUser = isCaller ? log.receiver : log.caller;
      if (!otherUser) return;
      const avatar = otherUser.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const timeStr = new Date(log.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const arrowIcon = isCaller ? '<span style="color:var(--ios-green);">↗</span>' : '<span style="color:var(--ios-blue);">↙</span>';
      const callIconSymbol = log.callType === 'video' ? '📹' : '📞';
      list.innerHTML += `
        <div class="call-item">
          <img src="${avatar}">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:14.5px; color:var(--text-primary);">${otherUser.name}</div>
            <div style="font-size:12.5px; color:var(--text-secondary); margin-top:2px;">${arrowIcon} ${timeStr}</div>
          </div>
          <button class="call-icon-btn" onclick="openChat('${otherUser._id}', '${otherUser.name.replace(/'/g, "\\'")}', true, '${avatar}', '${new Date().toISOString()}')">${callIconSymbol}</button>
        </div>`;
    });
  } catch(e) {}
}

async function clearCallLogs() {
  if (!confirm("Clear all call history?")) return;
  try {
    const res = await fetch('/api/calls/clear', { method: 'DELETE', headers: headers() });
    if (res.ok) { loadCallLogs(); showToast('Call history cleared', 'success'); }
  } catch(e) {}
}
window.clearCallLogs = clearCallLogs;

async function openStatusCreator() {
  const text = prompt("Enter status text:");
  if (text !== null && text.trim()) {
    const res = await fetch('/api/status', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ mediaType: 'text', text, bgColor: '#007AFF' })
    });
    if (res.ok) { loadStatuses(); showToast('Status posted', 'success'); }
  }
}
window.openStatusCreator = openStatusCreator;

async function uploadStatusMedia(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const fileData = e.target.result;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    const uploadRes = await fetch('/api/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ fileName: file.name, fileData }) });
    const uploadData = await uploadRes.json();
    if (uploadData.error) return showToast('Upload failed', 'error');
    const statusRes = await fetch('/api/status', {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ mediaType, mediaUrl: uploadData.fileUrl, text: prompt("Add a caption (optional):") || "" })
    });
    if (statusRes.ok) { loadStatuses(); showToast('Status posted', 'success'); }
    input.value = '';
  };
  reader.readAsDataURL(file);
}
window.uploadStatusMedia = uploadStatusMedia;

function viewStatus(st) {
  fetch(`/api/status/view/${st._id}`, { method: 'POST', headers: headers() });
  const isMyStatus = String(st.user._id || st.user) === String(userId);
  const existingModal = document.querySelector('.status-story-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'status-story-modal';

  let mediaHtml = '';
  if (st.mediaUrl) {
    if (st.mediaType === 'video') mediaHtml = `<video src="${st.mediaUrl}" controls autoplay style="max-width:100%; max-height:65vh; object-fit:contain; border-radius:12px;"></video>`;
    else mediaHtml = `<img src="${st.mediaUrl}" style="max-width:100%; max-height:65vh; object-fit:contain; border-radius:12px;">`;
  }
  let textHtml = st.text ? `<div style="margin-top:16px; color:#fff; font-size:20px; text-align:center; font-weight:600; max-width:80%; line-height:1.4;">${st.text}</div>` : '';

  modal.innerHTML = `
    <div style="position:absolute; top:26px; left:20px; display:flex; align-items:center; gap:12px; z-index:10;">
      <img src="${st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,0.4);">
      <div>
        <div style="font-weight:700; font-size:15px; color:white;">${st.user.name}</div>
        <div style="font-size:11.5px; color:rgba(255,255,255,0.6); margin-top:1px;">${new Date(st.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
    ${isMyStatus ? `<button onclick="deleteStatus('${st._id}')" style="position:absolute; top:30px; right:80px; background: rgba(255,59,48,0.9); color:white; border:none; padding:10px 16px; border-radius:12px; cursor:pointer; font-weight:700; z-index:10; font-size:13px; font-family: inherit;">Delete</button>` : ''}
    <span onclick="this.parentElement.remove()" style="position:absolute; top:20px; right:24px; font-size:32px; cursor:pointer; z-index:10; color:white; line-height:1; width:40px; height:40px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(255,255,255,0.15);">×</span>
    <div style="background:${st.bgColor || '#0f172a'}; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 20px; box-sizing: border-box;">
      ${mediaHtml} ${textHtml}
    </div>
  `;
  document.body.appendChild(modal);
}
window.viewStatus = viewStatus;

async function deleteStatus(statusId) {
  if (confirm("Delete this status?")) {
    const res = await fetch(`/api/status/${statusId}`, { method: 'DELETE', headers: headers() });
    if (res.ok) { document.querySelector('.status-story-modal').remove(); loadStatuses(); showToast('Status deleted', 'success'); }
  }
}
window.deleteStatus = deleteStatus;

// ============================================================
// PART 11: GROUPS
// ============================================================
async function createNewGroup() {
  const groupName = prompt("Enter Group Name:");
  if (!groupName) return;
  const friendRolls = prompt("Enter friend Roll Nos (comma separated, optional):");
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
  if (createData.message) { showToast('Group created', 'success'); loadDashboardData(); }
  else showToast(createData.error || 'Failed', 'error');
}
window.createNewGroup = createNewGroup;

async function openGroupChat(groupId, groupName) {
  activeGroupId = groupId;
  activeFriendId = null;
  toggleSidebar(false);
  document.getElementById('chat-placeholder').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('active-friend-name').innerText = groupName + " · Group";
  document.getElementById('active-friend-avatar').src = 'https://www.w3schools.com/howto/img_avatar.png';
  document.getElementById('active-friend-status').innerText = 'Group Chat';
  document.getElementById('active-friend-status').classList.remove('online');

  let headerActions = document.querySelector('.chat-header-actions');
  let infoBtn = document.getElementById('group-info-btn');
  if (!infoBtn) {
    infoBtn = document.createElement('button');
    infoBtn.id = 'group-info-btn';
    infoBtn.className = 'icon-circle';
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

  attachCustomHeaderButtons();
}
window.openGroupChat = openGroupChat;

async function openGroupInfoModal(groupId) {
  const res = await fetch(`/api/groups/details/${groupId}`, { headers: headers() });
  const group = await res.json();
  if (group.error) return showToast(group.error, 'error');

  const isAdmin = String(group.admin._id || group.admin) === String(userId);
  let membersHtml = group.members.map(m => `
    <div style="display:flex; justify-content:space-between; align-items:center; margin:6px 0; background:var(--bg-secondary); padding:10px 12px; border-radius:14px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${m.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
        <div>
          <div style="color:var(--text-primary); font-size:13.5px; font-weight:700;">${m.name}${m._id === group.admin._id ? ' · 👑' : ''}</div>
          <div style="font-size:11px; color:var(--text-secondary); margin-top:1px;">${m.rollNo}</div>
        </div>
      </div>
      ${isAdmin && m._id !== userId ? `<button onclick="removeGroupMember('${groupId}', '${m._id}')" style="background: rgba(255,59,48,0.15); color: var(--ios-red); border:none; padding:6px 12px; border-radius:10px; font-size:11px; cursor:pointer; font-weight:700; font-family: inherit;">Remove</button>` : ''}
    </div>`).join('');

  let existingModal = document.querySelector('.group-info-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'group-info-modal';
  modal.innerHTML = `
    <div class="group-info-card">
      <span onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:18px; right:22px; font-size:24px; cursor:pointer; color:var(--text-secondary); width:36px; height:36px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--bg-secondary);">×</span>
      <h3 style="color:var(--text-primary); margin-bottom:8px; font-size:20px; font-weight:800; letter-spacing:-0.3px;">👥 ${group.name}</h3>
      <p style="font-size:12.5px; color:var(--text-secondary); margin-bottom:18px;">Admin: ${group.admin.name}</p>
      ${isAdmin ? `
        <div style="margin-bottom:16px; display:flex; gap:8px;">
          <input type="text" id="add-member-rollno" placeholder="Roll No to add..." style="flex:1; padding:12px 14px; border-radius:14px; border:none; background:var(--bg-input); color:var(--text-primary); font-family:inherit; font-size:14px; outline:none;">
          <button onclick="addGroupMember('${groupId}')" style="background: linear-gradient(180deg, #0A84FF, #007AFF); color:white; border:none; padding:0 18px; border-radius:14px; cursor:pointer; font-weight:700; font-family:inherit; box-shadow: 0 4px 12px rgba(0,122,255,.3);">Add</button>
        </div>` : ''}
      <div style="font-size:12px; font-weight:800; color:var(--text-secondary); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.6px;">Members · ${group.members.length}</div>
      <div style="max-height:280px; overflow-y:auto;">${membersHtml}</div>
      ${isAdmin ? `<button onclick="deleteGroup('${groupId}')" style="width:100%; background: linear-gradient(180deg, #FF3B30, #D70015); color:white; border:none; padding:14px; border-radius:14px; cursor:pointer; font-weight:700; margin-top:20px; font-family: inherit; box-shadow: 0 4px 14px rgba(255,59,48,.3); font-size:15px;">Delete Group</button>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
}
window.openGroupInfoModal = openGroupInfoModal;

async function addGroupMember(groupId) {
  const rollNo = document.getElementById('add-member-rollno').value.trim().toUpperCase();
  if (!rollNo) return showToast('Enter a Roll No', 'error');
  const res = await fetch('/api/groups/add-member', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ groupId, rollNo })
  });
  const data = await res.json();
  if (data.message) { showToast('Member added', 'success'); openGroupInfoModal(groupId); loadDashboardData(); }
  else showToast(data.error || 'Failed', 'error');
}
window.addGroupMember = addGroupMember;

async function removeGroupMember(groupId, memberId) {
  if (!confirm("Remove this member?")) return;
  const res = await fetch('/api/groups/remove-member', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ groupId, memberId })
  });
  const data = await res.json();
  if (data.message) { showToast('Removed', 'success'); openGroupInfoModal(groupId); }
  else showToast(data.error || 'Failed', 'error');
}
window.removeGroupMember = removeGroupMember;

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
    showToast('Group deleted', 'success');
  }
}
window.deleteGroup = deleteGroup;

function renderGroupMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const type = msgSenderId === String(userId) ? 'sent' : 'received';
  let contentHtml = `<div class="media-box" id="msg-container-${msg._id}">`;
  if (type === 'received') contentHtml += `<div style="font-size:12px; font-weight:800; color:var(--ios-blue); margin-bottom:4px;">${msg.sender.name}</div>`;
  if (msg.fileUrl) {
    if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}" onclick="openImageModal('${msg.fileUrl}')" style="cursor:pointer;">`;
    else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
    else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="width:100%; margin:4px 0;"></audio>`;
    else contentHtml += `<div style="padding:10px; background:rgba(120,120,128,.15); border-radius:10px; margin-bottom:5px; font-size:12.5px;">📄 ${msg.fileName}</div>`;
    contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:inherit; text-decoration:none; font-size:12px; font-weight:700; display:block; margin-top:6px; opacity:0.85;">⬇ Download</a>`;
  }
  if (msg.text) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;
  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  contentHtml += `<div class="msg-footer"><span>${timeString}</span></div></div>`;
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

// ============================================================
// PART 12: FRIEND REQUESTS
// ============================================================
async function sendFriendRequest() {
  const target = document.getElementById('target-username').value.trim().toUpperCase();
  if (!target) return showToast('Enter Roll No', 'error');
  const res = await fetch('/api/friend-request', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ targetRollNo: target })
  });
  const data = await res.json();
  showToast(data.message || data.error, data.message ? 'success' : 'error');
  document.getElementById('target-username').value = '';
}
window.sendFriendRequest = sendFriendRequest;

async function acceptFriend(requesterId) {
  await fetch('/api/accept-request', {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ requesterId })
  });
  showToast('Friend added', 'success');
  loadDashboardData();
}
window.acceptFriend = acceptFriend;

// ============================================================
// PART 13: OPEN CHAT
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
  const statusEl = document.getElementById('active-friend-status');
  statusEl.innerText = isOnline ? 'Online' : `Last seen ${new Date(lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  statusEl.classList.toggle('online', isOnline);

  const res = await fetch(`/api/messages/${friendId}`, { headers: headers() });
  let messages = await res.json();
  const display = document.getElementById('messages-display');
  display.innerHTML = '';
  messages.forEach(msg => {
    if (msg.text && msg.isEncrypted) msg.text = decryptText(msg.text);
    renderSingleMessage(msg);
  });

  requestAnimationFrame(applyCurrentChatWallpaper);
  setTimeout(attachCustomHeaderButtons, 100);
}
window.openChat = openChat;

function setReply(msgText) {
  replyMessageData = msgText;
  document.getElementById('reply-preview-text').innerText = msgText;
  document.getElementById('reply-preview-bar').classList.remove('hidden');
  document.getElementById('message-input').focus();
}
window.setReply = setReply;

function cancelReply() {
  replyMessageData = null;
  document.getElementById('reply-preview-bar').classList.add('hidden');
}
window.cancelReply = cancelReply;

function sendReaction(msgId, emoji) { socket.emit('reactionEmit', { msgId, emoji, receiverId: activeFriendId }); }
window.sendReaction = sendReaction;

function openImageModal(url) {
  document.getElementById('modal-img').src = url;
  document.getElementById('image-modal').classList.remove('hidden');
}
window.openImageModal = openImageModal;

function closeImageModal() { document.getElementById('image-modal').classList.add('hidden'); }
window.closeImageModal = closeImageModal;

function toggleInChatSearch() {
  const el = document.getElementById('in-chat-search');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) el.focus();
}
window.toggleInChatSearch = toggleInChatSearch;

function searchInChat(query) {
  document.querySelectorAll('.msg').forEach(m => {
    if (query && m.innerText.toLowerCase().includes(query.toLowerCase())) m.style.outline = '2px solid var(--ios-blue)';
    else m.style.outline = '';
  });
}
window.searchInChat = searchInChat;

async function clearFullChat() {
  if (!activeFriendId) return;
  if (confirm("Clear this entire chat?")) {
    try {
      const res = await fetch(`/api/messages/clear/${activeFriendId}`, { method: 'DELETE', headers: headers() });
      const data = await res.json();
      if (data.message) {
        document.getElementById('messages-display').innerHTML = '';
        socket.emit('clearChatEmit', { receiverId: activeFriendId });
        showToast('Chat cleared', 'success');
      }
    } catch (err) {}
  }
}
window.clearFullChat = clearFullChat;

// ============================================================
// PART 14: MIC & FILE
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
            document.getElementById('message-input').value = '🎤 Voice Note ready — tap send';
          };
          reader.readAsDataURL(audioBlob);
        };
        mediaRecorder.start();
        isRecording = true;
        micBtn.innerText = '⏹';
        micBtn.style.background = 'rgba(255,59,48,0.85)';
        micBtn.style.color = 'white';
        showToast('Recording... tap again to stop', 'info');
      } catch(e) { showToast('Microphone access denied', 'error'); }
    } else {
      mediaRecorder.stop();
      isRecording = false;
      micBtn.innerText = '🎙';
      micBtn.style.background = '';
      micBtn.style.color = '';
    }
  };
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFile = { name: file.name, type: file.type, data: e.target.result };
    document.getElementById('message-input').value = `📎 ${file.name}`;
  };
  reader.readAsDataURL(file);
}
window.handleFileSelect = handleFileSelect;

function deleteMessage(msgId) {
  if (confirm("Delete this message for everyone?")) socket.emit('deleteMsgEmit', { msgId, receiverId: activeFriendId });
}
window.deleteMessage = deleteMessage;

// ============================================================
// PART 15: RENDER MESSAGE
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
    else contentHtml += `<div style="padding:10px; background:rgba(120,120,128,.15); border-radius:10px; margin-bottom:5px; font-size:12.5px;">📄 ${msg.fileName}</div>`;
    contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:inherit; text-decoration:none; font-size:12px; font-weight:700; display:block; margin-top:6px; opacity:0.85;">⬇ Download</a>`;
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
  let footerHtml = `<div class="msg-footer"><span>${timeString}</span>`;
  if (type === 'sent') {
    let tickSymbol = '✓', tickColor = 'rgba(255,255,255,0.6)';
    if (msg.status === 'delivered' || msg.status === 'read') tickSymbol = '✓✓';
    if (msg.status === 'read') tickColor = '#FFFFFF';
    footerHtml += `<span id="tick-${msg._id}" style="color:${tickColor}; font-weight:700;">${tickSymbol}</span>`;
  }
  footerHtml += `</div></div>`;
  contentHtml += footerHtml;
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

// ============================================================
// PART 16: SEND MESSAGE
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
    if (textToSend.includes('(Ready)') || textToSend.startsWith('🎤') || textToSend.startsWith('📎')) textToSend = "";
    const timestamp = Date.now();
    const display = document.getElementById('messages-display');
    display.innerHTML += `
      <div class="msg sent" id="temp-${timestamp}">
        <div>📤 Uploading: ${filePayload.name}</div>
        <div style="background:rgba(255,255,255,.25); border-radius:4px; height:4px; width:100%; overflow:hidden; margin-top:6px;">
          <div id="progress-${timestamp}" style="width: 0%; height:100%; background:#fff; transition: width .2s;"></div>
        </div>
        <div id="percent-${timestamp}" style="font-size:11px; margin-top:4px;">0%</div>
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
        showToast('File upload failed', 'error');
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
window.sendMessage = sendMessage;

function logout() {
  if (!confirm('Logout?')) return;
  localStorage.clear();
  window.location.reload();
}
window.logout = logout;

// ============================================================
// EXTRA 1: CHAT WALLPAPER
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
  messagesDisplay.style.background = '';
  messagesDisplay.style.backgroundSize = '';
}

function openWallpaperSelector() {
  const chatKey = getCurrentChatKey();
  if (!chatKey) return showToast('Open a chat first!', 'error');
  let choice = prompt(
    "Choose Chat Background:\n\n" +
    "1. Default\n" +
    "2. Dark Charcoal\n" +
    "3. Soft Blue\n" +
    "4. Lavender\n" +
    "5. Ocean\n" +
    "6. Upload Photo\n\nEnter (1-6):"
  );
  if (!choice) return;

  const wallpapers = {
    '1': '',
    '2': '#0b141a',
    '3': '#e1f5fe',
    '4': '#1a102f',
    '5': 'linear-gradient(135deg, #0A84FF, #0051D5)'
  };

  if (wallpapers[choice] !== undefined) {
    localStorage.setItem(chatKey, wallpapers[choice]);
    applyCurrentChatWallpaper();
    showToast('Wallpaper updated', 'success');
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
        showToast('Custom wallpaper applied', 'success');
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  }
}
window.openWallpaperSelector = openWallpaperSelector;

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
// EXTRA 2: CYBER MODE
// ============================================================
function toggleCyberMode() {
  let isCyberActive = localStorage.getItem('cyberMode') === 'true';
  isCyberActive = !isCyberActive;
  localStorage.setItem('cyberMode', isCyberActive);
  applyCyberTheme(isCyberActive, false);
}
window.toggleCyberMode = toggleCyberMode;

function applyCyberTheme(isActive, silent) {
  const appShell = document.querySelector('.app-shell');
  if (!appShell) return;
  if (isActive) {
    appShell.style.filter = 'hue-rotate(90deg) contrast(115%)';
    if (!silent) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      try { audio.play(); } catch(e){}
    }
    if (!document.getElementById('matrix-rain-canvas')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'matrix-rain-canvas';
      document.body.appendChild(canvas);
      startMatrixRain(canvas);
    }
    if (!silent) showToast('⚡ Cyber Mode Activated', 'success');
  } else {
    appShell.style.filter = 'none';
    const canvas = document.getElementById('matrix-rain-canvas');
    if (canvas) canvas.remove();
    if (!silent) showToast('Normal mode restored', 'info');
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
    ctx.fillStyle = '#0A84FF';
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
// EXTRA 3: SECRET VAULT
// ============================================================
function toggleChatVault() {
  const friendNameElem = document.getElementById('active-friend-name');
  if (!friendNameElem || friendNameElem.innerText === 'Select a chat') {
    return showToast('Open a chat first!', 'error');
  }
  const chatName = friendNameElem.innerText.trim();
  const vaultKey = `vault_lock_${chatName}`;
  const isLocked = localStorage.getItem(vaultKey) === 'true';

  if (!isLocked) {
    let pin = prompt("Set a PIN (3-6 digits) to lock this chat:");
    if (pin && pin.length >= 3) {
      localStorage.setItem(vaultKey, 'true');
      localStorage.setItem(`vault_pin_${chatName}`, pin);
      showToast(`🔐 ${chatName} locked`, 'success');
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('chat-placeholder').classList.remove('hidden');
    } else {
      showToast('PIN must be 3+ digits', 'error');
    }
  } else {
    let enteredPin = prompt("Enter PIN to unlock:");
    const savedPin = localStorage.getItem(`vault_pin_${chatName}`);
    if (enteredPin === savedPin) {
      localStorage.setItem(vaultKey, 'false');
      showToast('🔓 Unlocked', 'success');
    } else {
      showToast('❌ Incorrect PIN', 'error');
    }
  }
}
window.toggleChatVault = toggleChatVault;

// ============================================================
// EXTRA 4: AI BOT AUTO-REPLY
// ============================================================
let aiBotActive = false;
function toggleAIBot() {
  aiBotActive = !aiBotActive;
  if (aiBotActive) {
    showToast('🤖 AI Bot activated', 'success');
    window._aiInterval = setInterval(simulateAIResponse, 6000);
  } else {
    clearInterval(window._aiInterval);
    showToast('🤖 AI Bot deactivated', 'info');
  }
}
window.toggleAIBot = toggleAIBot;

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
      <div>
        <p style="margin-top:4px; color:var(--ios-blue); font-family:monospace; font-size:13px;">${randomReply}</p>
        <div class="msg-footer"><span>${timeString}</span></div>
      </div>
    </div>`;
  display.scrollTop = display.scrollHeight;
}

// ============================================================
// CUSTOM HEADER BUTTONS
// ============================================================
function attachCustomHeaderButtons() {
  const chatHeaderActions = document.querySelector('.chat-header-actions');
  if (!chatHeaderActions) return;

  const extras = [
    { id: 'wallpaper-custom-btn', icon: '🎨', title: 'Wallpaper', onClick: 'openWallpaperSelector()' },
    { id: 'cyber-mode-btn', icon: '⚡', title: 'Cyber Mode', onClick: 'toggleCyberMode()' },
    { id: 'vault-btn', icon: '🔐', title: 'Secret Vault', onClick: 'toggleChatVault()' },
    { id: 'ai-bot-btn', icon: '🤖', title: 'AI Bot', onClick: 'toggleAIBot()' }
  ];

  extras.forEach(ex => {
    if (document.getElementById(ex.id)) return;
    const btn = document.createElement('button');
    btn.id = ex.id;
    btn.className = 'icon-circle';
    btn.title = ex.title;
    btn.textContent = ex.icon;
    btn.setAttribute('onclick', ex.onClick);
    chatHeaderActions.appendChild(btn);
  });
}

// Auto-attach when chat opens
const _origOpenChat = window.openChat;
if (typeof _origOpenChat === 'function' && !window._customBtnsHooked) {
  window._customBtnsHooked = true;
  window.openChat = function(...args) {
    _origOpenChat.apply(this, args);
    setTimeout(attachCustomHeaderButtons, 100);
  };
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(attachCustomHeaderButtons, 800);
});

console.log('✅ BM Chat main.js loaded');
