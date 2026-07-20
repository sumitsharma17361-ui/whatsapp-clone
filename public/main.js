let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFile = null;

// Calling State Variables
let currentCallRoom = null;
let jitsiApi = null;

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

window.onload = () => { if (token) showDashboard(); };

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const chatArea = document.getElementById('chat-area');
  if (window.innerWidth <= 768) {
    if (show) { sidebar.classList.remove('mobile-hidden'); chatArea.classList.add('mobile-hidden'); }
    else { sidebar.classList.add('mobile-hidden'); chatArea.classList.remove('mobile-hidden'); }
  }
}

async function authAction(endpoint) {
  const u = document.getElementById('auth-username').value.trim();
  const p = document.getElementById('auth-password').value.trim();
  if(!u || !p) return alert("Please fill fields");

  try {
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
      window.location.reload();
    } else {
      alert('Registered successfully! Now click Login.');
    }
  } catch (err) {
    alert("Connection error. Please try again.");
  }
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
    const currentActive = String(activeFriendId);

    if (activeFriendId && (msgSender === currentActive || msgReceiver === currentActive)) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
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

  // Call Event Listeners
  socket.on('incomingCall', ({ from, room, type }) => {
    currentCallRoom = room;
    document.getElementById('incoming-caller-name').innerText = from;
    document.getElementById('incoming-call-type').innerText = `Incoming ${type} call...`;
    document.getElementById('incoming-call-box').style.display = 'flex';
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  socket.on('requestAccepted', () => loadDashboardData());
  loadDashboardData();
}

// --- CALL CONTROL FUNCTIONS ---
function startCall(type) {
  if (!activeFriendId) return;
  const roomName = "WhatsAppLite-" + Math.random().toString(36).substring(2, 10);
  currentCallRoom = roomName;

  socket.emit('callUser', {
    to: activeFriendId,
    from: username,
    room: roomName,
    type: type
  });

  openJitsiRoom(roomName, type === 'audio');
}

function acceptCall() {
  document.getElementById('incoming-call-box').style.display = 'none';
  if (currentCallRoom) {
    openJitsiRoom(currentCallRoom, false);
  }
}

function rejectCall() {
  document.getElementById('incoming-call-box').style.display = 'none';
  currentCallRoom = null;
}

function openJitsiRoom(roomName, audioOnly) {
  const frame = document.getElementById('call-screen-frame');
  frame.innerHTML = '';
  frame.style.display = 'block';

  const options = {
    roomName: roomName,
    width: '100%',
    height: '100%',
    parentNode: frame,
    userInfo: { displayName: username },
    configOverwrite: {
      startAudioOnly: audioOnly,
      prejoinPageEnabled: false
    }
  };

  jitsiApi = new JitsiMeetExternalAPI("meet.jit.si", options);

  jitsiApi.addEventListeners({
    videoConferenceLeft: () => {
      closeCallScreen();
    }
  });
}

function closeCallScreen() {
  const frame = document.getElementById('call-screen-frame');
  frame.style.display = 'none';
  frame.innerHTML = '';
  if (jitsiApi) {
    jitsiApi.dispose();
    jitsiApi = null;
  }
  currentCallRoom = null;
}
// -----------------------------

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
  document.getElementById('message-input').value = `📎 ${file.name} (Ready)`;
}

function renderSingleMessage(msg) {
  const display = document.getElementById('messages-display');
  const msgSenderId = String(msg.sender._id || msg.sender);
  const currentLoggedUserId = String(userId);
  
  const type = msgSenderId === currentLoggedUserId ? 'sent' : 'received';
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
  
  if (msg.text && !msg.text.includes('(Ready)')) {
      contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;
  }
  contentHtml += '</div>';

  display.innerHTML += `<div class="msg ${type}">${contentHtml}</div>`;
  display.scrollTop = display.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

  if (selectedFile) {
    const file = selectedFile;
    selectedFile = null;
    document.getElementById('file-input').value = "";
    input.value = '';

    if (textToSend.includes('(Ready)')) textToSend = "";
    const timestamp = Date.now();
    const display = document.getElementById('messages-display');
    
    display.innerHTML += `
      <div class="msg sent" id="temp-${timestamp}">
        <div class="media-box">
          <div style="font-size:13px; margin-bottom: 5px;">📤 Sending: ${file.name}</div>
          <div class="progress-container">
            <div class="progress-bar" id="progress-${timestamp}" style="width: 0%;"></div>
          </div>
          <span id="percent-${timestamp}" style="font-size:11px; color:#667781;">0%</span>
        </div>
      </div>
    `;
    display.scrollTop = display.scrollHeight;

    const reader = new FileReader();
    reader.onload = async function(e) {
      const base64Data = e.target.result;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload", true);
      xhr.setRequestHeader("Content-Type", "application/json");

      xhr.upload.onprogress = function(event) {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          document.getElementById(`progress-${timestamp}`).style.width = percentComplete + '%';
          document.getElementById(`percent-${timestamp}`).innerText = percentComplete + '%';
        }
      };

      xhr.onload = function() {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (response.fileUrl) {
            socket.emit('sendMessage', { 
                senderId: userId, 
                receiverId: activeFriendId, 
                text: textToSend,
                fileUrl: response.fileUrl, 
                fileName: file.name,
                fileType: file.type,
                timestamp: timestamp
            });
          }
        } else {
          alert("Upload failed.");
          document.getElementById(`temp-${timestamp}`).remove();
        }
      };
      xhr.send(JSON.stringify({ fileName: file.name, fileData: base64Data }));
    };
    reader.readAsDataURL(file);

  } else {
    socket.emit('sendMessage', { senderId: userId, receiverId: activeFriendId, text: textToSend });
    input.value = '';
  }
}

function logout() { localStorage.clear(); window.location.reload(); }
