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
  const friendsList = document.getElementById('friends-list');
  const statusView = document.getElementById('status-view-container');

  if(tab === 'chats') {
    chatsBtn.style.color = 'var(--text-primary)'; chatsBtn.style.borderBottom = '2px solid #00a884';
    statusBtn.style.color = 'var(--text-secondary)'; statusBtn.style.borderBottom = 'none';
    friendsList.classList.remove('hidden');
    statusView.classList.add('hidden');
  } else {
    statusBtn.style.color = 'var(--text-primary)'; statusBtn.style.borderBottom = '2px solid #00a884';
    chatsBtn.style.color = 'var(--text-secondary)'; chatsBtn.style.borderBottom = 'none';
    friendsList.classList.add('hidden');
    statusView.classList.remove('hidden');
    loadStatuses();
  }
}

async function authAction(type) {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value.trim();
  if(!u || !p) return alert("Please fill username and password");

  const endpoint = type === 'login' ? '/api/login' : '/api/register';
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  
  if (type === 'login') {
    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId);
    localStorage.setItem('username', data.username);
    if(data.profilePic) localStorage.setItem('profilePic', data.profilePic);
    window.location.reload();
  } else { alert('Registered successfully! Now click Login.'); }
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
  reqList.innerHTML = '';
  (data.friendRequests || []).forEach(req => {
    reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button class="btn-logout" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
  });

  const chatsSublist = document.getElementById('chats-sublist');
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

async function openStatusCreator() {
  const text = prompt("Enter status text message:");
  if(!text) return;
  
  const res = await fetch('/api/status', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ mediaType: 'text', text, bgColor: '#111b21' })
  });
  if(res.ok) {
    alert("Status uploaded successfully!");
    loadStatuses();
  }
}

function viewStatus(st) {
  fetch(`/api/status/view/${st._id}`, { method: 'POST', headers: headers() });

  const modal = document.createElement('div');
  modal.className = 'status-story-modal';
  modal.innerHTML = `
    <div class="status-progress-bar"><div class="status-progress-fill"></div></div>
    <div style="position:absolute; top:30px; left:20px; display:flex; align-items:center; gap:10px;">
      <img src="${st.user.profilePic || 'https://www.w3schools.com/howto/img_avatar.png'}" style="width:35px; height:35px; border-radius:50%;">
      <span style="font-weight:bold; font-size:14px;">${st.user.username}</span>
    </div>
    <span onclick="this.parentElement.remove()" style="position:absolute; top:25px; right:25px; font-size:28px; cursor:pointer;">&times;</span>
    <div style="padding:40px; text-align:center; font-size:22px; font-weight:bold; background:${st.bgColor}; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
      ${st.text || ''}
      ${st.mediaUrl ? `<img src="${st.mediaUrl}" style="max-width:100%; max-height:80vh;">` : ''}
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(() => modal.remove(), 5000);
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

  if(type === 'sent') {
     let tickSymbol = '✓'; let tickColor = '#8696a0';
     if(msg.status === 'delivered' || msg.status === 'read') tickSymbol = '✓✓';
     if(msg.status === 'read') tickColor = '#53bdeb';
     contentHtml += `<span class="tick-status" id="tick-${msg._id}" style="float:right; font-size:11px; margin-left:5px; color:${tickColor}; font-weight:bold;">${tickSymbol}</span>`;
  }

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
    
