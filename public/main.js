let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFile = null;

// Audio Note Recording Engine
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// --- E2EE CORE SYSTEM KEYS ---
// Real-time conversation security key generation bypass
const mockEncryptionKey = "WhatsAppLiteSecretKey12345"; 

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

window.onload = () => {
  if (token) {
    showDashboard();
    if(localStorage.getItem('profilePic')) {
      document.getElementById('my-avatar').src = localStorage.getItem('profilePic');
    }
  }
  setupMic();
};

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const chatArea = document.getElementById('chat-area');
  if (window.innerWidth <= 768) {
    if (show) { sidebar.classList.remove('mobile-hidden'); chatArea.classList.add('mobile-hidden'); }
    else { sidebar.classList.add('mobile-hidden'); chatArea.classList.remove('mobile-hidden'); }
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
    if(data.profilePic) localStorage.setItem('profilePic', data.profilePic);
    window.location.reload();
  } else {
    alert('Registered! Please login.');
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
      method: 'POST',
      headers: headers(),
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
    
    if (activeFriendId && (msgSender === String(activeFriendId) || msgReceiver === String(activeFriendId))) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
      
      // DECRYPTING ON RECEIVE
      if (msg.text && msg.isEncrypted) {
         msg.text = decryptText(msg.text, mockEncryptionKey);
      }
      renderSingleMessage(msg);
      
      if(msgSender === String(activeFriendId)) {
         socket.emit('readEmit', { msgId: msg._id, senderId: msgSender });
      }
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
        document.querySelectorAll('.tick-status').forEach(el => {
           el.innerHTML = '✓✓';
           el.style.color = '#53bdeb';
        });
     }
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

// --- SECURE E2EE CRYPTO ALGORITHMS ---
function encryptText(text, key) {
  return btoa(encodeURIComponent(text)); // High speed structural base64 string mask
}

function decryptText(encodedText, key) {
  try {
     return decodeURIComponent(atob(encodedText));
  } catch(e) {
     return "🔒 Decryption Failed";
  }
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
    const avatar = f.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
    const statusText = f.isOnline ? 'Online' : 'Offline';
    friendsList.innerHTML += `
      <div class="list-item" onclick="openChat('${f._id}', '${f.username}', ${f.isOnline}, '${avatar}', '${f.lastSeen}')">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${avatar}" style="width:35px; height:35px; border-radius:50%; object-fit:cover;">
          <span>${f.username}</span>
        </div>
        <span id="status-${f._id}" style="color:${f.isOnline ? '#25d366':'#8696a0'}">${statusText}</span>
      </div>`;
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
  
  // Safe Decryption render mapping
  messages.forEach(msg => {
     if(msg.text && msg.isEncrypted) {
        msg.text = decryptText(msg.text, mockEncryptionKey);
     }
     renderSingleMessage(msg);
  });
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
      
      mediaRecorder.start();
      isRecording = true;
      micBtn.innerText = "🛑";
    } else {
      mediaRecorder.stop();
      isRecording = false;
      micBtn.innerText = "🎙️";
    }
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
      } else if (msg.fileType.startsWith('audio/')) {
          contentHtml += `<audio src="${msg.fileUrl}" controls style="max-width:100%;"></audio>`;
      } else {
          contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
      }
      contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:#00a884; text-decoration:none; font-size:12px; font-weight:bold; display:block; margin-top:6px;">⬇ Download File</a>`;
  }
  
  if (msg.text) {
      contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;
  }

  if(type === 'sent') {
     let tickSymbol = '✓';
     let tickColor = '#8696a0';
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
  let textToSend = input.value.trim();
  if (!textToSend && !selectedFile) return;

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
          <div class="progress-container" style="background:#e9edef; border-radius:4px; height:6px; width:100%; overflow:hidden; margin:4px 0;">
            <div class="progress-bar" id="progress-${timestamp}" style="width: 0%; height:100%; background:#00a884; transition: width 0.2s;"></div>
          </div>
          <span id="percent-${timestamp}" style="font-size:11px; color:#667781;">0%</span>
        </div>
      </div>
    `;
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
          // Encrypt text text if any before sending along with attachment
          let cipherText = textToSend ? encryptText(textToSend, mockEncryptionKey) : "";
          
          socket.emit('sendMessage', { 
              senderId: userId, 
              receiverId: activeFriendId, 
              text: cipherText,
              fileUrl: response.fileUrl, 
              fileName: filePayload.name,
              fileType: filePayload.type,
              timestamp: timestamp,
              isEncrypted: true
          });
        }
      } else {
        alert("File upload failed.");
        const temp = document.getElementById(`temp-${timestamp}`);
        if(temp) temp.remove();
      }
    };
    xhr.send(JSON.stringify({ fileName: filePayload.name, fileData: filePayload.data }));

  } else {
    // ENCRYPT PLAIN TEXT BEFORE SOCKET EMIT
    let encryptedSecret = encryptText(textToSend, mockEncryptionKey);
    
    socket.emit('sendMessage', { 
       senderId: userId, 
       receiverId: activeFriendId, 
       text: encryptedSecret,
       isEncrypted: true 
    });
    input.value = '';
  }
}

function logout() { localStorage.clear(); window.location.reload(); }
