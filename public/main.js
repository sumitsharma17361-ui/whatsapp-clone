// ==========================================
// PART 1: INIT, SOCKET, AUTH & DASHBOARD
// ==========================================

let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
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

const mockEncryptionKey = "WhatsAppLiteSecretKey12345"; 

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

const notifySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

window.onload = () => {
  if (token) {
    showDashboard();
    if(localStorage.getItem('profilePic')) {
      document.getElementById('my-avatar').src = localStorage.getItem('profilePic');
    }
  }
  setupMic();
  if(localStorage.getItem('theme') === 'dark') {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && userId) {
      socket.connect();
      function sendTokenWithRetry(retries = 5) {
        if (window.OneSignalDeferred) {
          window.OneSignalDeferred.push(async function(OneSignal) {
            try {
              let subId = OneSignal.User.PushSubscription.id;
              if (subId) {
                socket.emit('identify', { userId: userId, subscriptionId: subId });
              } else if (retries > 0) {
                setTimeout(() => sendTokenWithRetry(retries - 1), 2000);
              } else {
                socket.emit('identify', { userId: userId, subscriptionId: null });
              }
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
      loadDashboardData();
    }
  });
};

function toggleTheme() {
  if(document.body.classList.contains('dark-theme')) {
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
  const chatsBtn = document.getElementById('tab-chats-btn');
  const statusBtn = document.getElementById('tab-status-btn');
  const callsBtn = document.getElementById('tab-calls-btn');
  
  const friendsList = document.getElementById('friends-list');
  const statusView = document.getElementById('status-view-container');
  const callsView = document.getElementById('calls-view-container');

  chatsBtn.style.color = 'var(--text-secondary)'; chatsBtn.style.borderBottom = 'none';
  statusBtn.style.color = 'var(--text-secondary)'; statusBtn.style.borderBottom = 'none';
  callsBtn.style.color = 'var(--text-secondary)'; callsBtn.style.borderBottom = 'none';

  friendsList.classList.add('hidden');
  statusView.classList.add('hidden');
  callsView.classList.add('hidden');

  if(tab === 'chats') {
    chatsBtn.style.color = 'var(--text-primary)'; chatsBtn.style.borderBottom = '2px solid #00a884';
    friendsList.classList.remove('hidden');
  } else if(tab === 'status') {
    statusBtn.style.color = 'var(--text-primary)'; statusBtn.style.borderBottom = '2px solid #00a884';
    statusView.classList.remove('hidden');
    loadStatuses();
  } else if(tab === 'calls') {
    callsBtn.style.color = 'var(--text-primary)'; callsBtn.style.borderBottom = '2px solid #00a884';
    callsView.classList.remove('hidden');
    loadCallLogs();
  }
}

async function authAction(type) {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value.trim();
  if(!u || !p) return alert("Please fill username and password");

  const loginBtn = document.querySelector('.btn-primary');
  const originalText = loginBtn.innerText;
  loginBtn.innerText = type === 'login' ? 'Logging in...' : 'Registering...';
  loginBtn.disabled = true;

  const endpoint = type === 'login' ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    
    if (data.error) {
      alert(data.error);
      loginBtn.innerText = originalText;
      loginBtn.disabled = false;
      return;
    }
    
    if (type === 'login') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('username', data.username);
      if(data.profilePic) localStorage.setItem('profilePic', data.profilePic);
      
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          await OneSignal.login(data.userId);
        });
      }

      window.location.reload();
    } else { 
      alert('Registered successfully! Now click Login.'); 
      loginBtn.innerText = originalText;
      loginBtn.disabled = false;
    }
  } catch(err) {
    alert("Connection error. Please try again.");
    loginBtn.innerText = originalText;
    loginBtn.disabled = false;
  }
}

async function changePassword() {
  const oldPassword = prompt("Enter your current (old) password:");
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
  if(!file) return;
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

function showDashboard() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('current-user-display').innerText = username;
  
  if (window.OneSignalDeferred && userId) {
    window.OneSignalDeferred.push(async function(OneSignal) {
      await OneSignal.login(userId);
    });
  }

  socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 20000
  });

  socket.on('connect', async () => {
    function sendTokenWithRetry(retries = 5) {
      if (window.OneSignalDeferred) {
        window.OneSignalDeferred.push(async function(OneSignal) {
          try {
            let subId = OneSignal.User.PushSubscription.id;
            if (subId) {
              socket.emit('identify', { userId: userId, subscriptionId: subId });
            } else if (retries > 0) {
              setTimeout(() => sendTokenWithRetry(retries - 1), 2000);
            } else {
              socket.emit('identify', { userId: userId, subscriptionId: null });
            }
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
  });

  initPeerJS();

  socket.on('receiveMessage', (msg) => {
    const msgSender = String(msg.sender._id || msg.sender);
    const msgReceiver = String(msg.receiver._id || msg.receiver);
    if(msgSender !== String(userId)) { try { notifySound.play(); } catch(e){} }

    if (activeFriendId && (msgSender === String(activeFriendId) || msgReceiver === String(activeFriendId))) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
      if (msg.text && msg.isEncrypted) msg.text = decryptText(msg.text, mockEncryptionKey);
      renderSingleMessage(msg);
      if(msgSender === String(activeFriendId)) socket.emit('readEmit', { msgId: msg._id, senderId: msgSender });
    }
  });

  socket.on('receiveGroupMessage', (msg) => {
    if (activeGroupId && String(msg.group) === String(activeGroupId)) {
      if(String(msg.sender._id) !== String(userId)) { try { notifySound.play(); } catch(e){} }
      renderGroupMessage(msg);
    }
  });

  socket.on('errorMessage', (data) => { alert(data.error); });
  socket.on('groupUpdated', () => { loadDashboardData(); });
  socket.on('typingEmit', ({ senderId, isTyping }) => {
    if (String(activeFriendId) === String(senderId)) {
      const el = document.getElementById('active-friend-status');
      if (isTyping) el.innerText = 'typing...';
      else el.innerText = 'Online';
    }
  });

  socket.on('reactionReceived', ({ msgId, emoji }) => {
    const el = document.getElementById(`reaction-badge-${msgId}`);
    if(el) { el.innerText = emoji; el.classList.remove('hidden'); }
  });

  socket.on('msgDeleted', ({ msgId }) => {
    const el = document.getElementById(`msg-container-${msgId}`);
    if (el) el.innerHTML = '<p style="font-style:italic; color:#8696a0; font-size:13px; margin:2px 0;">🚫 This message was deleted</p>';
  });

  socket.on('chatClearedEvent', () => {
    const display = document.getElementById('messages-display');
    if (display) display.innerHTML = '';
  });

  socket.on('statusUpdated', () => loadStatuses());
  socket.on('statusChanged', ({ userId: changedId, isOnline, lastSeen }) => {
    loadDashboardData();
    if (String(activeFriendId) === String(changedId)) {
      document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  loadDashboardData();
}

function initPeerJS() {
  peer = new Peer(userId, { host: '0.peerjs.com', port: 443, secure: true });
  peer.on('open', (id) => console.log('Peer connected:', id));
  peer.on('call', async (call) => {
    currentPeerCall = call;
    const callType = call.metadata && call.metadata.callType ? call.metadata.callType : 'audio';
    const callerName = call.metadata && call.metadata.callerName ? call.metadata.callerName : 'Friend';
    document.getElementById('incoming-caller-name').innerText = `${callerName} (${callType} call)`;
    document.getElementById('incoming-call-modal').classList.remove('hidden');
    window.incomingPeerCallObj = call;
    window.incomingCallType = callType;
  });
}
// ==========================================
// PART 2: CALLS SETUP & MEDIA CONTROLS
// ==========================================

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
    startX = e.clientX || e.touches[0].clientX; startY = e.clientY || e.touches[0].clientY;
    initialX = draggable.offsetLeft; initialY = draggable.offsetTop;
    document.onmousemove = dragMove; document.ontouchmove = dragMove;
    document.onmouseup = dragEnd; document.ontouchend = dragEnd;
  }
  function dragMove(e) {
    if (!isDragging) return;
    const dx = (e.clientX || e.touches[0].clientX) - startX;
    const dy = (e.clientY || e.touches[0].clientY) - startY;
    draggable.style.left = (initialX + dx) + 'px'; draggable.style.top = (initialY + dy) + 'px';
  }
  function dragEnd() {
    isDragging = false;
    document.onmousemove = null; document.ontouchmove = null; document.onmouseup = null; document.ontouchend = null;
  }
}

async function startCall(callType) {
  if(!activeFriendId) return;
  document.getElementById('call-screen').classList.remove('hidden');
  document.getElementById('call-username').innerText = document.getElementById('active-friend-name').innerText;
  document.getElementById('call-avatar').src = document.getElementById('active-friend-avatar').src;
  document.getElementById('call-status-text').innerText = 'Calling...';

  if(callType === 'video') {
    document.getElementById('video-container').classList.remove('hidden');
    document.getElementById('cam-switch-btn').classList.remove('hidden');
    setupDraggableVideo();
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video' ? { facingMode: currentFacingMode } : false, audio: true });
    if(callType === 'video') document.getElementById('local-video').srcObject = localStream;
    const call = peer.call(activeFriendId, localStream, { metadata: { callType: callType, callerName: username } });
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
  if(callType === 'video') {
    document.getElementById('video-container').classList.remove('hidden');
    document.getElementById('cam-switch-btn').classList.remove('hidden');
    setupDraggableVideo();
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video' ? { facingMode: currentFacingMode } : false, audio: true });
    if(callType === 'video') document.getElementById('local-video').srcObject = localStream;
    const call = window.incomingPeerCallObj;
    if(call) {
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
  if(window.incomingPeerCallObj) window.incomingPeerCallObj.close();
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
  if(localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if(audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('mute-btn').style.background = audioTrack.enabled ? 'rgba(255,255,255,0.2)' : '#ea0038';
    }
  }
}

function toggleVideo() {
  if(localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if(videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('video-toggle-btn').style.background = videoTrack.enabled ? 'rgba(255,255,255,0.2)' : '#ea0038';
    }
  }
}
// ==========================================
// PART 3: LOADERS, DELETE FRIEND & DASHBOARD
// ==========================================

function encryptText(text, key) { return btoa(encodeURIComponent(text)); }
function decryptText(encodedText, key) { try { return decodeURIComponent(atob(encodedText)); } catch(e) { return "🔒 Decryption Failed"; } }

function handleTyping() {
  if (!activeFriendId) return;
  socket.emit('typing', { receiverId: activeFriendId, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', { receiverId: activeFriendId, isTyping: false }), 1500);
}

function togglePinFriend(e, friendId) {
  e.stopPropagation();
  if (pinnedFriends.includes(friendId)) pinnedFriends = pinnedFriends.filter(id => id !== friendId);
  else pinnedFriends.push(friendId);
  localStorage.setItem('pinnedFriends', JSON.stringify(pinnedFriends));
  loadDashboardData();
}

async function removeFriend(e, friendId, friendName) {
  e.stopPropagation();
  if (!confirm(`Are you sure you want to remove ${friendName} from your friends list?`)) return;
  try {
    const res = await fetch(`/api/friend/${friendId}`, { method: 'DELETE', headers: headers() });
    const data = await res.json();
    if (data.message) {
      alert("Friend removed successfully");
      if (activeFriendId === friendId) {
        activeFriendId = null;
        document.getElementById('active-chat').classList.add('hidden');
        document.getElementById('chat-placeholder').classList.remove('hidden');
      }
      loadDashboardData();
    } else { alert(data.error || "Failed"); }
  } catch (err) { alert("Error removing friend"); }
}

async function loadDashboardData() {
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  
  const reqList = document.getElementById('requests-list');
  reqList.innerHTML = '';
  (data.friendRequests || []).forEach(req => {
    reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button class="btn-logout" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
  });

  const chatsSublist = document.getElementById('chats-sublist');
  chatsSublist.innerHTML = '';
  
  if (data.groups && data.groups.length > 0) {
    chatsSublist.innerHTML += `<div style="padding:6px 12px; font-size:11px; font-weight:bold; color:var(--text-secondary);">GROUPS</div>`;
    data.groups.forEach(g => {
      chatsSublist.innerHTML += `
        <div class="list-item" onclick="openGroupChat('${g._id}', '${g.name}')">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:38px; height:38px; border-radius:50%; background:#00a884; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:bold;">👥</div>
            <span style="font-weight:600;">${g.name}</span>
          </div>
          <span style="font-size:12px; color:#00a884;">Group</span>
        </div>`;
    });
    chatsSublist.innerHTML += `<div style="padding:6px 12px; font-size:11px; font-weight:bold; color:var(--text-secondary);">CHATS</div>`;
  }

  let sortedFriends = (data.friends || []).sort((a, b) => pinnedFriends.includes(b._id) - pinnedFriends.includes(a._id));

  sortedFriends.forEach(f => {
    const avatar = f.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
    const isPinned = pinnedFriends.includes(f._id);
    chatsSublist.innerHTML += `
      <div class="list-item" onclick="openChat('${f._id}', '${f.username}', ${f.isOnline}, '${avatar}', '${f.lastSeen}')">
        <div style="display:flex; align-items:center; gap:10px; position:relative;">
          <img src="${avatar}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
          ${f.isOnline ? '<span class="online-dot"></span>' : ''}
          <span style="font-weight:600;">${f.username} ${isPinned ? '<span class="pin-icon">📌</span>':''}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span id="status-${f._id}" style="font-size:12px; color:${f.isOnline ? '#25d366':'#8696a0'}">${f.isOnline ? 'Online':'Offline'}</span>
          <span onclick="togglePinFriend(event, '${f._id}')" style="cursor:pointer; font-size:14px;" title="Pin Chat">${isPinned ? '📍':'📌'}</span>
          <span onclick="removeFriend(event, '${f._id}', '${f.username}')" style="cursor:pointer; font-size:14px; color:#ea0038;" title="Delete Friend">🗑️</span>
        </div>
      </div>`;
  });
}

async function loadStatuses() {
  const res = await fetch('/api/status', { headers: headers() });
  const statuses = await res.json();
  const list = document.getElementById('statuses-list');
  list.innerHTML = '';
  statuses.forEach(st => {
    const avatar = st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
    const timeAgo = new Date(st.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    list.innerHTML += `
      <div class="list-item" onclick='viewStatus(${JSON.stringify(st)})'>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="status-ring"><img src="${avatar}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;"></div>
          <div>
            <span style="font-weight:600; display:block;">${st.user.username}</span>
            <span style="font-size:12px; color:var(--text-secondary);">Today at ${timeAgo} (${st.viewers ? st.viewers.length : 0} views)</span>
          </div>
        </div>
      </div>`;
  });
}

async function loadCallLogs() {
  const res = await fetch('/api/calls', { headers: headers() });
  const logs = await res.json();
  const list = document.getElementById('calls-list');
  list.innerHTML = '';
  if(logs.length === 0) { list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-secondary); font-size:13px;">No recent calls</div>`; return; }
  logs.forEach(log => {
    const isCaller = String(log.caller._id || log.caller) === String(userId);
    const otherUser = isCaller ? log.receiver : log.caller;
    if(!otherUser) return;
    const avatar = otherUser.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
    const timeStr = new Date(log.timestamp).toLocaleString([], {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
    const arrowIcon = isCaller ? '<span style="color:#25d366;">↗</span>' : '<span style="color:#00a884;">↙</span>';
    const callIconSymbol = log.callType === 'video' ? '📹' : '📞';
    list.innerHTML += `
      <div class="list-item">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${avatar}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
          <div><span style="font-weight:600; display:block; font-size:14px;">${otherUser.username}</span><span style="font-size:12px; color:var(--text-secondary);">${arrowIcon} ${timeStr}</span></div>
        </div>
        <span style="font-size:18px; cursor:pointer;" onclick="openChat('${otherUser._id}', '${otherUser.username}', true, '${avatar}', new Date())">${callIconSymbol}</span>
      </div>`;
  });
}
// ==========================================
// PART 4: STATUS CREATOR & VIEWERS MODAL
// ==========================================

async function openStatusCreator() {
  const text = prompt("Enter status text message:");
  if(text !== null) {
    if(!text.trim()) return;
    const res = await fetch('/api/status', { method: 'POST', headers: headers(), body: JSON.stringify({ mediaType: 'text', text, bgColor: '#111b21' }) });
    if(res.ok) { alert("Text status uploaded!"); loadStatuses(); }
  }
}

async function uploadStatusMedia(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const fileData = e.target.result;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    const uploadRes = await fetch('/api/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ fileName: file.name, fileData }) });
    const uploadData = await uploadRes.json();
    if(uploadData.error) return alert("Upload failed");
    const statusRes = await fetch('/api/status', { method: 'POST', headers: headers(), body: JSON.stringify({ mediaType, mediaUrl: uploadData.fileUrl, text: prompt("Add a caption (optional):") || "" }) });
    if(statusRes.ok) { alert("Media status uploaded!"); loadStatuses(); }
    input.value = '';
  };
  reader.readAsDataURL(file);
}

function viewStatus(st) {
  fetch(`/api/status/view/${st._id}`, { method: 'POST', headers: headers() });
  const isMyStatus = String(st.user._id || st.user) === String(userId);
  const existingModal = document.querySelector('.status-story-modal');
  if (existingModal) existingModal.remove();

  let viewersHtml = '';
  if (isMyStatus && st.viewers && st.viewers.length > 0) {
    let viewerListItems = st.viewers.map(v => `<div style="display:flex; align-items:center; gap:8px; margin:4px 0;"><img src="${v.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:24px;height:24px;border-radius:50%;"><span>${v.username}</span></div>`).join('');
    viewersHtml = `<div style="margin-top: 15px; background: rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.2); padding: 10px 15px; border-radius: 8px; color: white; max-height: 120px; overflow-y: auto; width: 100%; max-width: 400px; text-align: left;"><b>Viewed by (${st.viewers.length}):</b>${viewerListItems}</div>`;
  }

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
      <img src="${st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:2px solid #00a884;">
      <span style="font-weight:bold; font-size:16px; color:white;">${st.user.username}</span>
    </div>
    ${isMyStatus ? `<button onclick="deleteStatus('${st._id}')" style="position:absolute; top:30px; right:70px; background:#ea0038; color:white; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:bold; z-index:10; font-size:13px;">🗑️ Delete</button>` : ''}
    <span onclick="this.parentElement.remove()" style="position:absolute; top:20px; right:25px; font-size:36px; cursor:pointer; z-index:10; color:white;">&times;</span>
    <div style="background:${st.bgColor || '#111b21'}; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative; padding:20px; box-sizing: border-box; overflow-y: auto;">
      ${mediaHtml} ${textHtml} ${viewersHtml}
    </div>
  `;
  document.body.appendChild(modal);
}

async function deleteStatus(statusId) {
  if (confirm("Are you sure you want to delete this status?")) {
    const res = await fetch(`/api/status/${statusId}`, { method: 'DELETE', headers: headers() });
    if (res.ok) { alert("Status deleted successfully!"); document.querySelector('.status-story-modal').remove(); loadStatuses(); }
    else alert("Failed to delete status");
  }
}
// ==========================================
// PART 5: ADVANCED GROUPS & RESTRICTION CONTROLS
// ==========================================

async function createNewGroup() {
  const groupName = prompt("Enter Group Name:");
  if(!groupName) return;
  const friendUsernames = prompt("Enter friend usernames to add (comma separated):");
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  let memberIds = [];
  if (friendUsernames) {
    const names = friendUsernames.split(',').map(n => n.trim());
    data.friends.forEach(f => { if(names.includes(f.username)) memberIds.push(f._id); });
  }
  const createRes = await fetch('/api/groups/create', { method: 'POST', headers: headers(), body: JSON.stringify({ name: groupName, memberIds }) });
  const createData = await createRes.json();
  if(createData.message) { alert("Group created successfully!"); loadDashboardData(); }
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
  if(!infoBtn) {
    infoBtn = document.createElement('button');
    infoBtn.id = 'group-info-btn';
    infoBtn.className = 'icon-btn';
    infoBtn.title = 'Group Info & Members';
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
    <div style="display:flex; justify-content:space-between; align-items:center; margin:6px 0; background:rgba(255,255,255,0.05); padding:8px; border-radius:6px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <img src="${m.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:28px; height:28px; border-radius:50%;">
        <span style="color:white; font-size:14px;">${m.username} ${m._id === group.admin._id ? '(Admin)':''}</span>
      </div>
      ${isAdmin && m._id !== userId ? `<button onclick="removeGroupMember('${groupId}', '${m._id}')" style="background:#ea0038; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Remove</button>` : ''}
    </div>`).join('');

  let existingModal = document.querySelector('.group-info-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'group-info-modal';
  modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.8); z-index:5000; display:flex; align-items:center; justify-content:center;";
  modal.innerHTML = `
    <div style="background:var(--card-bg); width:350px; padding:25px; border-radius:12px; position:relative; max-height:80vh; overflow-y:auto;">
      <span onclick="this.parentElement.parentElement.remove()" style="position:absolute; top:15px; right:20px; font-size:24px; cursor:pointer; color:var(--text-secondary);">&times;</span>
      <h3 style="color:var(--text-primary); margin-bottom:15px;">👥 ${group.name}</h3>
      <p style="font-size:12px; color:var(--text-secondary); margin-bottom:10px;">Admin: ${group.admin.username}</p>
      
      ${isAdmin ? `
        <div style="margin-bottom:15px; background:rgba(0,168,132,0.1); padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:13px; color:var(--text-primary);">Allow only Admin to chat</span>
          <button onclick="toggleGroupRestriction('${groupId}')" style="background:${group.restrictMessages ? '#ea0038' : '#00a884'}; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:bold;">${group.restrictMessages ? 'Restricted (On)' : 'Allowed (Off)'}</button>
        </div>

        <div style="margin-bottom:15px; display:flex; gap:8px;">
          <input type="text" id="add-member-username" placeholder="Username to add..." style="flex:1; padding:6px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-primary);">
          <button onclick="addGroupMember('${groupId}')" style="background:#00a884; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">Add</button>
        </div>` : ''}

      <div style="font-size:13px; font-weight:bold; color:var(--text-primary); margin-bottom:6px;">Members (${group.members.length}):</div>
      <div style="max-height:180px; overflow-y:auto;">${membersHtml}</div>

      ${isAdmin ? `
        <button onclick="deleteGroup('${groupId}')" style="width:100%; background:#ea0038; color:white; border:none; padding:10px; border-radius:6px; cursor:pointer; font-weight:bold; margin-top:20px;">🗑️ Delete Group</button>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
}

async function toggleGroupRestriction(groupId) {
  const res = await fetch('/api/groups/toggle-restriction', { method: 'POST', headers: headers(), body: JSON.stringify({ groupId }) });
  const data = await res.json();
  if (data.message) { openGroupInfoModal(groupId); }
  else { alert(data.error || "Failed"); }
}

async function addGroupMember(groupId) {
  const username = document.getElementById('add-member-username').value.trim();
  if (!username) return alert("Enter a username");
  const res = await fetch('/api/groups/add-member', { method: 'POST', headers: headers(), body: JSON.stringify({ groupId, username }) });
  const data = await res.json();
  if (data.message) { alert("Member added successfully!"); openGroupInfoModal(groupId); loadDashboardData(); }
  else alert(data.error || "Failed");
}

async function removeGroupMember(groupId, memberId) {
  if (!confirm("Are you sure you want to remove this member?")) return;
  const res = await fetch('/api/groups/remove-member', { method: 'POST', headers: headers(), body: JSON.stringify({ groupId, memberId }) });
  const data = await res.json();
  if (data.message) { alert("Member removed"); openGroupInfoModal(groupId); loadDashboardData(); }
  else alert(data.error || "Failed");
}

async function deleteGroup(groupId) {
  if (!confirm("Are you sure you want to delete this group for everyone?")) return;
  const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE', headers: headers() });
  const data = await res.json();
  if (data.message) {
    alert("Group deleted successfully");
    document.querySelector('.group-info-modal').remove();
    activeGroupId = null;
    document.getElementById('active-chat').classList.add('hidden');
    document.getElementById('chat-placeholder').classList.remove('hidden');
    loadDashboardData();
  } else alert(data.error || "Failed");
}

function renderGroupMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const type = msgSenderId === String(userId) ? 'sent' : 'received';
  let contentHtml = `<div class="media-box" id="msg-container-${msg._id}">`;
  if(type === 'received') contentHtml += `<div style="font-size:11px; font-weight:bold; color:#00a884; margin-bottom:2px;">${msg.sender.username}</div>`;
  if (msg.fileUrl) {
      if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}" onclick="openImageModal('${msg.fileUrl}')" style="cursor:pointer;">`;
      else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
      else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="width:100%; margin:4px 0;"></audio>`;
      else contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
      contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:#00a884; text-decoration:none; font-size:12px; font-weight:bold; display:block; margin-top:6px;">⬇ Download File</a>`;
  }
  if (msg.text) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;
  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  contentHtml += `<div style="float:right; font-size:10px; color:#667781; margin-top:2px; margin-left:8px;">${timeString}</div></div>`;
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}
// ==========================================
// PART 6: CHAT RENDERING, MESSAGING & ACTIONS
// ==========================================

async function sendFriendRequest() {
  const target = document.getElementById('target-username').value;
  const res = await fetch('/api/friend-request', { method: 'POST', headers: headers(), body: JSON.stringify({ targetUsername: target }) });
  const data = await res.json();
  alert(data.message || data.error);
  document.getElementById('target-username').value = '';
}

async function acceptFriend(requesterId) {
  await fetch('/api/accept-request', { method: 'POST', headers: headers(), body: JSON.stringify({ requesterId }) });
  loadDashboardData();
}

async function openChat(friendId, friendName, isOnline, avatar, lastSeen) {
  activeFriendId = friendId;
  activeGroupId = null;
  let infoBtn = document.getElementById('group-info-btn');
  if(infoBtn) infoBtn.remove();

  toggleSidebar(false);
  document.getElementById('chat-placeholder').classList.add('hidden');
  document.getElementById('active-chat').classList.remove('hidden');
  document.getElementById('active-friend-name').innerText = friendName;
  document.getElementById('active-friend-avatar').src = avatar;
  document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

  const res = await fetch(`/api/messages/${friendId}`, { headers: headers() });
  let messages = await res.json();
  const display = document.getElementById('messages-display');
  display.innerHTML = '';
  messages.forEach(msg => {
     if(msg.text && msg.isEncrypted) msg.text = decryptText(msg.text, mockEncryptionKey);
     renderSingleMessage(msg);
  });
}

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
  if(!el.classList.contains('hidden')) el.focus();
}
function searchInChat(query) {
  const msgs = document.querySelectorAll('.msg');
  msgs.forEach(m => {
    if(query && m.innerText.toLowerCase().includes(query.toLowerCase())) m.style.background = 'rgba(0, 168, 132, 0.2)';
    else m.style.background = '';
  });
}

async function clearFullChat() {
  if(!activeFriendId) return;
  if(confirm("Are you sure you want to clear this entire chat?")) {
    try {
      const res = await fetch(`/api/messages/clear/${activeFriendId}`, { method: 'DELETE', headers: headers() });
      const data = await res.json();
      if(data.message) { document.getElementById('messages-display').innerHTML = ''; socket.emit('clearChatEmit', { receiverId: activeFriendId }); }
      else alert("Failed to clear chat");
    } catch(err) { alert("Error clearing chat"); }
  }
}

function setupMic() {
  const micBtn = document.getElementById('mic-btn');
  if(!micBtn) return;
  micBtn.onclick = async () => {
    if(!isRecording) {
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
        mediaRecorder.start(); isRecording = true; micBtn.innerText = '⏹️';
      } catch(e) { alert("Microphone access denied"); }
    } else { mediaRecorder.stop(); isRecording = false; micBtn.innerText = '🎙️'; }
  };
}

function handleFileSelect(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFile = { name: file.name, type: file.type, data: e.target.result };
    document.getElementById('message-input').value = `📎 ${file.name} (Ready)`;
  };
  reader.readAsDataURL(file);
}

function deleteMessage(msgId) {
  if(confirm("Delete this message for everyone?")) socket.emit('deleteMsgEmit', { msgId, receiverId: activeFriendId });
}

function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const type = msgSenderId === String(userId) ? 'sent' : 'received';
  let contentHtml = `<div class="media-box" id="msg-container-${msg._id}">`;
  if(msg.replyTo) contentHtml += `<div class="quoted-reply-box">↩ ${msg.replyTo}</div>`;
  if(type === 'sent' && msg.text !== '🚫 This message was deleted') contentHtml += `<button class="msg-del-btn" onclick="deleteMessage('${msg._id}')">✕</button>`;

  if (msg.fileUrl) {
      if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}" onclick="openImageModal('${msg.fileUrl}')" style="cursor:pointer;">`;
      else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
      else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="width:100%; margin:4px 0;"></audio>`;
      else contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
      contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:#00a884; text-decoration:none; font-size:12px; font-weight:bold; display:block; margin-top:6px;">⬇ Download File</a>`;
  }
  if (msg.text) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;

  if (msg.text !== '🚫 This message was deleted') {
    const cleanText = (msg.text || msg.fileName || 'Media').replace(/'/g, "\\'");
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
  let footerHtml = `<div style="float:right; display:flex; align-items:center; gap:4px; margin-top:2px; margin-left:8px; font-size:10px; color:#667781; font-weight:600;"><span>${timeString}</span>`;
  if(type === 'sent') {
     let tickSymbol = '✓', tickColor = '#8696a0';
     if(msg.status === 'delivered' || msg.status === 'read') { tickSymbol = '✓✓'; }
     if(msg.status === 'read') { tickColor = '#53bdeb'; }
     footerHtml += `<span class="tick-status" id="tick-${msg._id}" style="color:${tickColor}; font-weight:bold;">${tickSymbol}</span>`;
  }
  footerHtml += `</div></div>`;
  contentHtml += footerHtml;
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

  let currentReplyTo = replyMessageData;
  cancelReply();

  if (activeGroupId) {
    if (selectedFile) {
      const filePayload = selectedFile; selectedFile = null; document.getElementById('file-input').value = ""; input.value = '';
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload", true);
      xhr.setRequestHeader("Content-Type", "application/json");
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
    const filePayload = selectedFile; selectedFile = null; document.getElementById('file-input').value = ""; input.value = '';
    if (textToSend.includes('(Ready)')) textToSend = "";
    const timestamp = Date.now();
    const display = document.getElementById('messages-display');
    display.innerHTML += `
      <div class="msg sent" id="temp-${timestamp}">
        <div class="media-box">
          <div style="font-size:13px; margin-bottom: 5px;">📤 Uploading: ${filePayload.name}</div>
          <div class="progress-container" style="background:#e9edef; border-radius:4px; height:6px; width:100%; overflow:hidden; margin:4px 0;">
            <div class="progress-bar" id="progress-${timestamp}" style="width: 0%; height:100%; background:#00a884; transition: width 0.2s;"></div>
          </div>
          <span id="percent-${timestamp}" style="font-size:11px; color:#667781;">0%</span>
        </div>
      </div>`;
    display.scrollTop = display.scrollHeight;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = function(event) {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        const bar = document.getElementById(`progress-${timestamp}`);
        const txt = document.getElementById(`percent-${timestamp}`);
        if(bar) bar.style.width = percentComplete + '%';
        if(txt) txt.innerText = percentComplete + '%';
      }
    };
    xhr.onload = function() {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        if (response.fileUrl) {
          let cipherText = textToSend ? encryptText(textToSend, mockEncryptionKey) : "";
          socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: cipherText, fileUrl: response.fileUrl, fileName: filePayload.name, fileType: filePayload.type, timestamp: timestamp, isEncrypted: true, replyTo: currentReplyTo });
        }
      } else { alert("File upload failed."); const temp = document.getElementById(`temp-${timestamp}`); if(temp) temp.remove(); }
    };
    xhr.send(JSON.stringify({ fileName: filePayload.name, fileData: filePayload.data }));
  } else {
    let encryptedSecret = encryptText(textToSend, mockEncryptionKey);
    const timestamp = Date.now();
    input.value = '';
    socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: encryptedSecret, timestamp: timestamp, isEncrypted: true, replyTo: currentReplyTo });
    renderSingleMessage({ _id: 'temp-' + timestamp, sender: { _id: userId }, receiver: { _id: activeFriendId }, text: textToSend, timestamp: timestamp, status: 'sent', replyTo: currentReplyTo, isEncrypted: false });
  }
}

function logout() { localStorage.clear(); window.location.reload(); }
