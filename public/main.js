let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFile = null;
let replyMessageData = null;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let typingTimeout = null;

let pinnedFriends = JSON.parse(localStorage.getItem('pinnedFriends') || '[]');

let peerConnection;
let localStream;
let remoteStream;
let incomingCallData = null;

// Updated WebRTC config with robust STUN and free TURN fallback servers for cross-network media streaming
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:openrelay.metered.ca:80' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

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

  if(chatsBtn) { chatsBtn.style.color = 'var(--text-secondary)'; chatsBtn.style.borderBottom = 'none'; }
  if(statusBtn) { statusBtn.style.color = 'var(--text-secondary)'; statusBtn.style.borderBottom = 'none'; }
  if(callsBtn) { callsBtn.style.color = 'var(--text-secondary)'; callsBtn.style.borderBottom = 'none'; }

  if(friendsList) friendsList.classList.add('hidden');
  if(statusView) statusView.classList.add('hidden');
  if(callsView) callsView.classList.add('hidden');

  if(tab === 'chats') {
    if(chatsBtn) { chatsBtn.style.color = 'var(--text-primary)'; chatsBtn.style.borderBottom = '2px solid #00a884'; }
    if(friendsList) friendsList.classList.remove('hidden');
  } else if(tab === 'status') {
    if(statusBtn) { statusBtn.style.color = 'var(--text-primary)'; statusBtn.style.borderBottom = '2px solid #00a884'; }
    if(statusView) statusView.classList.remove('hidden');
    loadStatuses();
  } else if(tab === 'calls') {
    if(callsBtn) { callsBtn.style.color = 'var(--text-primary)'; callsBtn.style.borderBottom = '2px solid #00a884'; }
    if(callsView) callsView.classList.remove('hidden');
    loadCallLogs();
  }
}

async function authAction(type) {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value.trim();
  if(!u || !p) return alert("Please fill username and password");

  const loginBtn = document.querySelector('.btn-primary');
  const originalText = loginBtn ? loginBtn.innerText : 'Login';
  if(loginBtn) {
    loginBtn.innerText = type === 'login' ? 'Logging in...' : 'Registering...';
    loginBtn.disabled = true;
  }

  const endpoint = type === 'login' ? '/api/login' : '/api/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    
    if (data.error) {
      alert(data.error);
      if(loginBtn) { loginBtn.innerText = originalText; loginBtn.disabled = false; }
      return;
    }
    
    if (type === 'login') {
      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('username', data.username);
      if(data.profilePic) localStorage.setItem('profilePic', data.profilePic);
      window.location.reload();
    } else { 
      alert('Registered successfully! Now click Login.'); 
      if(loginBtn) { loginBtn.innerText = originalText; loginBtn.disabled = false; }
    }
  } catch(err) {
    alert("Connection error. Please try again.");
    if(loginBtn) { loginBtn.innerText = originalText; loginBtn.disabled = false; }
  }
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
  
  socket = io();
  socket.emit('identify', userId);

  socket.on('receiveMessage', (msg) => {
    const msgSender = String(msg.sender._id || msg.sender);
    const msgReceiver = String(msg.receiver._id || msg.receiver);
    
    if(msgSender !== String(userId)) {
      try { notifySound.play(); } catch(e){}
    }

    if (activeFriendId && (msgSender === String(activeFriendId) || msgReceiver === String(activeFriendId))) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
      if (msg.text && msg.isEncrypted) msg.text = decryptText(msg.text, mockEncryptionKey);
      renderSingleMessage(msg);
      if(msgSender === String(activeFriendId)) socket.emit('readEmit', { msgId: msg._id, senderId: msgSender });
    }
  });

  socket.on('incomingCall', (data) => {
    incomingCallData = data;
    document.getElementById('incoming-caller-name').innerText = `${data.name} (${data.callType} call)`;
    document.getElementById('incoming-call-modal').classList.remove('hidden');
  });

  socket.on('callAccepted', async (signal) => {
    document.getElementById('call-status-text').innerText = 'Connected';
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    }
  });

  socket.on('iceCandidate', async ({ candidate }) => {
    if (peerConnection && candidate) {
      try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch(e){}
    }
  });

  socket.on('callEnded', () => {
    closeCallScreen();
  });

  socket.on('typingEmit', ({ senderId, isTyping }) => {
    if (String(activeFriendId) === String(senderId)) {
      const el = document.getElementById('active-friend-status');
      if (isTyping) el.innerText = 'typing...';
      else el.innerText = 'Online';
    }
  });

  socket.on('reactionReceived', ({ msgId, emoji }) => {
    const el = document.getElementById(`reaction-badge-${msgId}`);
    if(el) {
      el.innerText = emoji;
      el.classList.remove('hidden');
    }
  });

  socket.on('msgDeleted', ({ msgId }) => {
    const el = document.getElementById(`msg-container-${msgId}`);
    if (el) {
      el.innerHTML = '<p style="font-style:italic; color:#8696a0; font-size:13px; margin:2px 0;">🚫 This message was deleted</p>';
    }
  });

  socket.on('chatClearedEvent', () => {
    const display = document.getElementById('messages-display');
    if (display) display.innerHTML = '';
  });

  socket.on('statusUpdated', () => {
    loadStatuses();
  });

  socket.on('statusChanged', ({ userId: changedId, isOnline, lastSeen }) => {
    loadDashboardData();
    if (String(activeFriendId) === String(changedId)) {
      document.getElementById('active-friend-status').innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  loadDashboardData();
}

function encryptText(text, key) { return btoa(encodeURIComponent(text)); }
function decryptText(encodedText, key) { try { return decodeURIComponent(atob(encodedText)); } catch(e) { return "🔒 Decryption Failed"; } }

function handleTyping() {
  if (!activeFriendId) return;
  socket.emit('typing', { receiverId: activeFriendId, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', { receiverId: activeFriendId, isTyping: false });
  }, 1500);
}

function togglePinFriend(e, friendId) {
  e.stopPropagation();
  if (pinnedFriends.includes(friendId)) {
    pinnedFriends = pinnedFriends.filter(id => id !== friendId);
  } else {
    pinnedFriends.push(friendId);
  }
  localStorage.setItem('pinnedFriends', JSON.stringify(pinnedFriends));
  loadDashboardData();
}

async function loadDashboardData() {
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  
  const reqList = document.getElementById('requests-list');
  if(reqList) {
    reqList.innerHTML = '';
    (data.friendRequests || []).forEach(req => {
      reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button class="btn-logout" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
    });
  }

  const chatsSublist = document.getElementById('chats-sublist');
  if(chatsSublist) {
    chatsSublist.innerHTML = '';
    
    let sortedFriends = (data.friends || []).sort((a, b) => {
      const isAPinned = pinnedFriends.includes(a._id);
      const isBPinned = pinnedFriends.includes(b._id);
      return isBPinned - isAPinned;
    });

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
          </div>
        </div>`;
    });
  }
}

async function loadStatuses() {
  const res = await fetch('/api/status', { headers: headers() });
  const statuses = await res.json();
  const list = document.getElementById('statuses-list');
  if(!list) return;
  list.innerHTML = '';

  statuses.forEach(st => {
    const avatar = st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
    const timeAgo = new Date(st.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    list.innerHTML += `
      <div class="list-item" onclick='viewStatus(${JSON.stringify(st)})'>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="status-ring">
            <img src="${avatar}" style="width:38px; height:38px; border-radius:50%; object-fit:cover;">
          </div>
          <div>
            <span style="font-weight:600; display:block;">${st.user.username}</span>
            <span style="font-size:12px; color:var(--text-secondary);">Today at ${timeAgo}</span>
          </div>
        </div>
      </div>`;
  });
}

async function loadCallLogs() {
  const res = await fetch('/api/calls', { headers: headers() });
  const logs = await res.json();
  const list = document.getElementById('calls-list');
  if(!list) return;
  list.innerHTML = '';

  if(logs.length === 0) {
    list.innerHTML = `<div style="padding:30px; text-align:center; color:var(--text-secondary); font-size:13px;">No recent calls</div>`;
    return;
  }

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
          <div>
            <span style="font-weight:600; display:block; font-size:14px;">${otherUser.username}</span>
            <span style="font-size:12px; color:var(--text-secondary);">${arrowIcon} ${timeStr}</span>
          </div>
        </div>
        <span style="font-size:18px; cursor:pointer;" onclick="openChat('${otherUser._id}', '${otherUser.username}', true, '${avatar}', new Date())">${callIconSymbol}</span>
      </div>`;
  });
}

async function openStatusCreator() {
  const text = prompt("Enter status text message:");
  if(text !== null) {
    if(!text.trim()) return;
    const res = await fetch('/api/status', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ mediaType: 'text', text, bgColor: '#111b21' })
    });
    if(res.ok) {
      alert("Text status uploaded!");
      loadStatuses();
    }
  }
}

async function uploadStatusMedia(input) {
  const file = input.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const fileData = e.target.result;
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ fileName: file.name, fileData })
    });
    const uploadData = await uploadRes.json();
    if(uploadData.error) return alert("Upload failed");

    const statusRes = await fetch('/api/status', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ 
        mediaType, 
        mediaUrl: uploadData.fileUrl, 
        text: prompt("Add a caption (optional):") || "" 
      })
    });

    if(statusRes.ok) {
      alert("Media status uploaded successfully!");
      loadStatuses();
    }
    input.value = '';
  };
  reader.readAsDataURL(file);
}

function viewStatus(st) {
  fetch(`/api/status/view/${st._id}`, { method: 'POST', headers: headers() });

  const isMyStatus = String(st.user._id || st.user) === String(userId);

  const modal = document.createElement('div');
  modal.className = 'status-story-modal';
  modal.innerHTML = `
    <div class="status-progress-bar"><div class="status-progress-fill"></div></div>
    <div style="position:absolute; top:30px; left:20px; display:flex; align-items:center; gap:10px; z-index:10;">
      <img src="${st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:35px; height:35px; border-radius:50%;">
      <span style="font-weight:bold; font-size:14px;">${st.user.username}</span>
    </div>
    
    ${isMyStatus ? `<button onclick="deleteStatus('${st._id}')" style="position:absolute; top:28px; right:70px; background:#ea0038; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:bold; z-index:10; font-size:12px;">🗑️ Delete</button>` : ''}
    
    <span onclick="this.parentElement.remove()" style="position:absolute; top:25px; right:25px; font-size:28px; cursor:pointer; z-index:10;">&times;</span>
    <div style="padding:0; text-align:center; background:${st.bgColor || '#000'}; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative;">
      ${st.mediaUrl ? (st.mediaType === 'video' ? `<video src="${st.mediaUrl}" controls autoplay style="width:100%; height:100%; object-fit:contain; background:#000;"></video>` : `<img src="${st.mediaUrl}" style="width:100%; height:100%; object-fit:contain; background:#000;">`) : ''}
      ${st.text ? `<div style="position:absolute; bottom:40px; left:20px; right:20px; background:rgba(0,0,0,0.6); padding:10px; border-radius:8px; font-size:18px;">${st.text}</div>` : ''}
    </div>
  `;
  document.body.appendChild(modal);
}

async function deleteStatus(statusId) {
  if (confirm("Are you sure you want to delete this status?")) {
    const res = await fetch(`/api/status/${statusId}`, {
      method: 'DELETE',
      headers: headers()
    });
    if (res.ok) {
      alert("Status deleted successfully!");
      document.querySelector('.status-story-modal').remove();
      loadStatuses();
    } else {
      alert("Failed to delete status");
    }
  }
}

// WEBRTC CALL FUNCTIONS
async function startCall(callType) {
  if(!activeFriendId) return;
  document.getElementById('call-screen').classList.remove('hidden');
  document.getElementById('call-username').innerText = document.getElementById('active-friend-name').innerText;
  document.getElementById('call-avatar').src = document.getElementById('active-friend-avatar').src;
  document.getElementById('call-status-text').innerText = 'Calling...';

  if(callType === 'video') {
    document.getElementById('video-container').classList.remove('hidden');
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true });
    if(callType === 'video') document.getElementById('local-video').srcObject = localStream;

    createPeerConnection(activeFriendId);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('callUser', {
      userToCall: activeFriendId,
      signalData: offer,
      from: userId,
      name: username,
      callType
    });
  } catch (err) {
    alert("Camera/Mic permission denied or unavailable");
    closeCallScreen();
  }
}

async function acceptIncomingCall() {
  document.getElementById('incoming-call-modal').classList.add('hidden');
  document.getElementById('call-screen').classList.remove('hidden');
  document.getElementById('call-username').innerText = incomingCallData.name;
  document.getElementById('call-status-text').innerText = 'Connecting...';

  if(incomingCallData.callType === 'video') {
    document.getElementById('video-container').classList.remove('hidden');
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: incomingCallData.callType === 'video', audio: true });
    if(incomingCallData.callType === 'video') document.getElementById('local-video').srcObject = localStream;

    createPeerConnection(incomingCallData.from);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.signal));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit('answerCall', { signal: answer, to: incomingCallData.from, from: userId, callType: incomingCallData.callType });
  } catch(e) {
    closeCallScreen();
  }
}

function rejectIncomingCall() {
  document.getElementById('incoming-call-modal').classList.add('hidden');
  socket.emit('endCall', { to: incomingCallData.from });
  incomingCallData = null;
}

function createPeerConnection(remoteUserId) {
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('iceCandidate', { candidate: event.candidate, to: remoteUserId });
    }
  };

  peerConnection.ontrack = (event) => {
    document.getElementById('call-status-text').innerText = 'Connected';
    remoteStream = event.streams[0];
    document.getElementById('remote-video').srcObject = remoteStream;
  };
}

function endCall() {
  if (activeFriendId) socket.emit('endCall', { to: activeFriendId });
  if (incomingCallData) socket.emit('endCall', { to: incomingCallData.from });
  closeCallScreen();
}

function closeCallScreen() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  document.getElementById('call-screen').classList.add('hidden');
  document.getElementById('incoming-call-modal').classList.add('hidden');
  document.getElementById('video-container').classList.add('hidden');
  document.getElementById('local-video').srcObject = null;
  document.getElementById('remote-video').srcObject = null;
  incomingCallData = null;
}

function toggleMute() {
  if(localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if(audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      document.getElementById('mute-btn').style.background = audioTrack.enabled ? '#ffffff33' : '#ea0038';
    }
  }
}

function toggleVideo() {
  if(localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if(videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      document.getElementById('video-toggle-btn').style.background = videoTrack.enabled ? '#ffffff33' : '#ea0038';
    }
  }
}

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

function sendReaction(msgId, emoji) {
  socket.emit('reactionEmit', { msgId, emoji, receiverId: activeFriendId });
}

function openImageModal(url) {
  document.getElementById('modal-img').src = url;
  document.getElementById('image-modal').classList.remove('hidden');
}

function closeImageModal() {
  document.getElementById('image-modal').classList.add('hidden');
}

function toggleInChatSearch() {
  const el = document.getElementById('in-chat-search');
  el.classList.toggle('hidden');
  if(!el.classList.contains('hidden')) el.focus();
}

function searchInChat(query) {
  const msgs = document.querySelectorAll('.msg');
  msgs.forEach(m => {
    if(query && m.innerText.toLowerCase().includes(query.toLowerCase())) m.classList.add('highlight');
    else m.classList.remove('highlight');
  });
}

async function clearFullChat() {
  if (!activeFriendId) return;
  if (confirm("Are you sure you want to clear this entire chat?")) {
    try {
      const res = await fetch(`/api/messages/clear/${activeFriendId}`, {
        method: 'DELETE',
        headers: headers()
      });
      const data = await res.json();
      if (data.message) {
        document.getElementById('messages-display').innerHTML = '';
        socket.emit('clearChatEmit', { receiverId: activeFriendId });
      } else { alert("Failed to clear chat"); }
    } catch(err) { alert("Error clearing chat"); }
  }
}

function setupMic() {
  const micBtn = document.getElementById('mic-btn');
  if(!micBtn) return;
  micBtn.onclick = async () => {
    if (!isRecording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        const reader = new FileReader();
        reader.onloadend = async () => {
           selectedFile = { name: `Voice-${Date.now()}.mp3`, type: 'audio/mp3', data: reader.result };
           document.getElementById('message-input').value = `🎙️ Voice Note (Ready)`;
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start(); isRecording = true; micBtn.innerText = "🛑";
    } else { mediaRecorder.stop(); isRecording = false; micBtn.innerText = "🎙️"; }
  };
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    selectedFile = { name: file.name, type: file.type, data: e.target.result };
    document.getElementById('message-input').value = `📎 ${file.name} (Ready)`;
  };
  reader.readAsDataURL(file);
}

function deleteMessage(msgId) {
  if(confirm("Delete this message for everyone?")) {
    socket.emit('deleteMsgEmit', { msgId, receiverId: activeFriendId });
  }
}

function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const currentLoggedUserId = String(userId);
  const type = msgSenderId === currentLoggedUserId ? 'sent' : 'received';
  
  let contentHtml = `<div class="media-box" id="msg-container-${msg._id}">`;
  
  if(msg.replyTo) {
    contentHtml += `<div class="quoted-reply-box">↩ ${msg.replyTo}</div>`;
  }

  if(type === 'sent' && msg.text !== '🚫 This message was deleted') {
    contentHtml += `<button class="msg-del-btn" onclick="deleteMessage('${msg._id}')">✕</button>`;
  }

  if (msg.fileUrl) {
      if (msg.fileType.startsWith('image/')) {
        contentHtml += `<img src="${msg.fileUrl}" onclick="openImageModal('${msg.fileUrl}')" style="cursor:pointer;">`;
      } else if (msg.fileType.startsWith('video/')) {
        contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
      } else if (msg.fileType.startsWith('audio/')) {
        contentHtml += `<audio src="${msg.fileUrl}" controls style="width:100%; margin:4px 0;"></audio>`;
      } else {
        contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
      }
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
      <span id="reaction-badge-${msg._id}" class="reaction-badge hidden"></span>
    `;
  }

  const timeString = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let footerHtml = `<div style="float:right; display:flex; align-items:center; gap:4px; margin-top:2px; margin-left:8px; font-size:10px; color:#667781; font-weight:600;">`;
  footerHtml += `<span>${timeString}</span>`;

  if(type === 'sent') {
     let tickSymbol = '✓'; let tickColor = '#8696a0';
     if(msg.status === 'delivered' || msg.status === 'read') tickSymbol = '✓✓';
     if(msg.status === 'read') tickColor = '#53bdeb';
     footerHtml += `<span class="tick-status" id="tick-${msg._id}" style="color:${tickColor}; font-weight:bold;">${tickSymbol}</span>`;
  }
  footerHtml += `</div>`;

  contentHtml += footerHtml;
  contentHtml += '</div>';
  display.innerHTML += `<div class="msg ${type}" id="msg-${msg._id}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

  let currentReplyTo = replyMessageData;
  cancelReply();

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
        const text = document.getElementById(`percent-${timestamp}`);
        if(bar) bar.style.width = percentComplete + '%';
        if(text) text.innerText = percentComplete + '%';
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
    socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: encryptedSecret, isEncrypted: true, replyTo: currentReplyTo });
    input.value = '';
  }
}

function logout() { localStorage.clear(); window.location.reload(); }
