let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFile = null;

// Audio Note Engine State
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Jitsi Active Calling Object
let jitsiApi = null;

const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': localStorage.getItem('token') });

// Sabse safe window load aur elements check
window.onload = () => {
  if (token) {
    showDashboard();
    if(localStorage.getItem('profilePic')) {
      const avatarEl = document.getElementById('my-avatar');
      if (avatarEl) avatarEl.src = localStorage.getItem('profilePic');
    }
  }
};

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const chatArea = document.getElementById('chat-area');
  if (sidebar && chatArea && window.innerWidth <= 768) {
    if (show) { sidebar.classList.remove('mobile-hidden'); chatArea.classList.add('mobile-hidden'); }
    else { sidebar.classList.add('mobile-hidden'); chatArea.classList.remove('mobile-hidden'); }
  }
}

// SAFE AUTHENTICATION ENGINE (Login/Register)
async function authAction(endpoint) {
  try {
    const uEl = document.getElementById('auth-username');
    const pEl = document.getElementById('auth-password');
    
    if (!uEl || !pEl) return alert("UI Elements missing, please refresh.");
    
    const u = uEl.value.trim();
    const p = pEl.value.trim();
    
    if (!u || !p) return alert("Please fill all fields");

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
      if(data.profilePic) localStorage.setItem('profilePic', data.profilePic);
      window.location.reload();
    } else { 
      alert('Registered successfully! Now enter details and click Login.'); 
    }
  } catch (err) {
    console.error(err);
    alert("Connection error. Server is starting up, please wait 30 seconds and try again.");
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
    await fetch('/api/profile-pic', { method: 'POST', headers: headers(), body: JSON.stringify({ profilePic: base64 }) });
  };
  reader.readAsDataURL(file);
}

function showDashboard() {
  const authEl = document.getElementById('auth-screen');
  const appEl = document.getElementById('app-screen');
  const userDisp = document.getElementById('current-user-display');
  
  if (authEl) authEl.classList.add('hidden');
  if (appEl) appEl.classList.remove('hidden');
  if (userDisp) userDisp.innerText = username;
  
  socket = io();
  socket.emit('identify', userId);

  socket.on('receiveMessage', (msg) => {
    const msgSender = String(msg.sender._id || msg.sender);
    const msgReceiver = String(msg.receiver._id || msg.receiver);
    if (activeFriendId && (msgSender === String(activeFriendId) || msgReceiver === String(activeFriendId))) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
      renderSingleMessage(msg);
      if(msgSender === String(activeFriendId)) socket.emit('readEmit', { msgId: msg._id, senderId: msgSender });
    }
  });

  socket.on('msgStatusUpdate', ({ msgId, status }) => {
     const tickEl = document.getElementById(`tick-${msgId}`);
     if(tickEl) {
        tickEl.innerHTML = '✓✓';
        if(status === 'read') tickEl.style.color = '#53bdeb';
     }
  });

  socket.on('messagesMarkedRead', ({ by }) => {
     if(String(by) === String(activeFriendId)) {
        document.querySelectorAll('.tick-status').forEach(el => { el.innerHTML = '✓✓'; el.style.color = '#53bdeb'; });
     }
  });

  socket.on('statusChanged', ({ userId: changedId, isOnline, lastSeen }) => {
    loadDashboardData();
    if (String(activeFriendId) === String(changedId)) {
      const statusEl = document.getElementById('active-friend-status');
      if (statusEl) statusEl.innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  
  socket.on('incomingCall', ({ from, signal }) => {
      const nameDisp = document.getElementById('caller-name-display');
      if (nameDisp) nameDisp.innerText = from;
      const popup = document.getElementById('incoming-call-popup');
      if (popup) popup.style.display = 'flex';
      
      const acceptBtn = document.getElementById('accept-call-btn');
      if (acceptBtn) {
        acceptBtn.onclick = () => {
           if (popup) popup.style.display = 'none';
           launchJitsiFrame(signal);
        };
      }
  });

  socket.on('callEnded', () => { closeActiveCall(); });

  loadDashboardData();
}

async function loadDashboardData() {
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  const reqList = document.getElementById('requests-list');
  if (reqList) {
    reqList.innerHTML = '';
    data.friendRequests.forEach(req => {
      reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button class="btn-small" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
    });
  }

  const friendsList = document.getElementById('friends-list');
  if (friendsList) {
    friendsList.innerHTML = '';
    data.friends.forEach(f => {
      const avatar = f.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      friendsList.innerHTML += `
        <div class="list-item" onclick="openChat('${f._id}', '${f.username}', ${f.isOnline}, '${avatar}', '${f.lastSeen}')">
          <div style="display:flex; align-items:center; gap:10px;">
            <img src="${avatar}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
            <span>${f.username}</span>
          </div>
          <span id="status-${f._id}" style="color:${f.isOnline ? '#25d366':'#8696a0'}">${f.isOnline ? 'Online' : 'Offline'}</span>
        </div>`;
    });
  }
}

async function openChat(friendId, friendName, isOnline, avatar, lastSeen) {
  activeFriendId = friendId;
  toggleSidebar(false);
  
  const placeholder = document.getElementById('chat-placeholder');
  const actChat = document.getElementById('active-chat');
  const fName = document.getElementById('active-friend-name');
  const fAvatar = document.getElementById('active-friend-avatar');
  const fStatus = document.getElementById('active-friend-status');
  
  if (placeholder) placeholder.classList.add('hidden');
  if (actChat) actChat.classList.remove('hidden');
  if (fName) fName.innerText = friendName;
  if (fAvatar) fAvatar.src = avatar;
  if (fStatus) fStatus.innerText = isOnline ? 'Online' : `Last seen: ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

  const res = await fetch(`/api/messages/${friendId}`, { headers: headers() });
  const messages = await res.json();
  const display = document.getElementById('messages-display');
  if (display) {
    display.innerHTML = '';
    messages.forEach(renderSingleMessage);
  }
}

function initiateJitsiCall(type) {
  if(!activeFriendId) return;
  const secureRoomId = "WhatsAppLiteCall-" + Math.random().toString(36).substring(2, 12);
  
  socket.emit('callUser', {
     to: activeFriendId,
     from: username,
     signalData: secureRoomId, 
     type: type
  });

  launchJitsiFrame(secureRoomId, type === 'audio');
}

function launchJitsiFrame(roomName, audioOnly = false) {
  if (typeof JitsiMeetExternalAPI === 'undefined') {
     return alert("Calling server is currently unreachable. Please try again in a moment.");
  }
  
  const container = document.getElementById('jitsi-container');
  if (!container) return;
  container.innerHTML = ""; 
  container.style.display = 'block';

  const domain = "8x8.vc";
  const options = {
      roomName: "vpaas-magic-cookie-408fb8eb4ad14f9d85d7b5145b95ea45/" + roomName,
      width: "100%",
      height: "100%",
      parentNode: container,
      userInfo: { displayName: username },
      configOverwrite: {
         startAudioOnly: audioOnly,
         prejoinPageEnabled: false,
         toolbarButtons: ['microphone', 'camera', 'hangup', 'tileview', 'toggle-camera']
      }
  };
  
  jitsiApi = new JitsiMeetExternalAPI(domain, options);
  jitsiApi.addEventListeners({
     videoConferenceLeft: function() {
        endJitsiCallSession();
     }
  });
}

function closeCallPopup() {
  const popup = document.getElementById('incoming-call-popup');
  if (popup) popup.style.display = 'none';
}

function endJitsiCallSession() {
  if(activeFriendId) socket.emit('endCallEmit', { to: activeFriendId });
  closeActiveCall();
}

function closeActiveCall() {
  const container = document.getElementById('jitsi-container');
  if (container) {
    container.style.display = 'none';
    container.innerHTML = "";
  }
  if(jitsiApi) { jitsiApi.dispose(); jitsiApi = null; }
}

// SAFE VOICE RECORDER CONTROLS
async function startAudioRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
      const reader = new FileReader();
      reader.onloadend = async () => {
         selectedFile = { name: `Voice-${Date.now()}.mp3`, type: 'audio/mp3', data: reader.result };
         const input = document.getElementById('message-input');
         if (input) input.value = `🎙️ Voice Note (Ready)`;
      };
      reader.readAsDataURL(audioBlob);
    };
    
    mediaRecorder.start();
    isRecording = true;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) micBtn.innerText = "🛑";
  } catch (err) {
    alert("Mic access denied or not supported.");
  }
}

function stopAudioRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    const micBtn = document.getElementById('mic-btn');
    if (micBtn) micBtn.innerText = "🎙️";
  }
}

// Event bindings handled safely after elements exist
document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'mic-btn') {
    if(!isRecording) startAudioRecording();
    else stopAudioRecording();
  }
});

function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    selectedFile = { name: file.name, type: file.type, data: e.target.result };
    const msgIn = document.getElementById('message-input');
    if (msgIn) msgIn.value = `📎 ${file.name} (Ready)`;
  };
  reader.readAsDataURL(file);
}

function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  if (!display) return;
  
  const msgSenderId = String(msg.sender._id || msg.sender);
  const currentLoggedUserId = String(userId);
  const type = msgSenderId === currentLoggedUserId ? 'sent' : 'received';
  let contentHtml = '<div class="media-box">';
  
  if (msg.fileUrl) {
      if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}">`;
      else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
      else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="max-width:100%;"></audio>`;
      else contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
  }
  if (msg.text && !msg.text.includes('(Ready)')) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;

  if(type === 'sent') {
     let tickSymbol = '✓'; let tickColor = '#8696a0';
     if(msg.status === 'delivered' || msg.status === 'read') tickSymbol = '✓✓';
     if(msg.status === 'read') tickColor = '#53bdeb';
     contentHtml += `<span class="tick-status" id="tick-${msg._id}" style="float:right; font-size:11px; margin-left:5px; color:${tickColor}; font-weight:bold;">${tickSymbol}</span>`;
  }
  contentHtml += '</div>';
  display.innerHTML += `<div class="msg ${type}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input) return;
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

  if (selectedFile) {
    const filePayload = selectedFile; selectedFile = null; input.value = "Sending...";
    if (textToSend.includes('(Ready)')) textToSend = "";
    const res = await fetch("/api/upload", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ fileName: filePayload.name, fileData: filePayload.data })
    });
    const data = await res.json();
    if(data.fileUrl) {
       socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: textToSend, fileUrl: data.fileUrl, fileName: filePayload.name, fileType: filePayload.type });
    }
    input.value = '';
  } else {
    socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: textToSend });
    input.value = '';
  }
}

function logout() { localStorage.clear(); window.location.reload(); }
