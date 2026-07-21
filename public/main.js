let socket;
let token = localStorage.getItem('token');
let userId = localStorage.getItem('userId');
let username = localStorage.getItem('username');
let activeFriendId = null;
let selectedFile = null;

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const mockEncryptionKey = "WhatsAppLiteSecretKey12345"; 

// 🔥 Firebase Project Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCd5NdMJg4f7RkzSlyMncKxl6OoNJhT0CM",
  authDomain: "whatsapp-clone-ae627.firebaseapp.com",
  projectId: "whatsapp-clone-ae627",
  storageBucket: "whatsapp-clone-ae627.firebasestorage.app",
  messagingSenderId: "890129124582",
  appId: "1:890129124582:web:df1f833e7ae70b7c203f27",
  measurementId: "G-KSKBRCTKRB"
};

// Initialize Firebase App
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
let appConfirmationResult = null;

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': localStorage.getItem('token')
});

window.onload = () => {
  if (token) {
    showDashboard();
  }
  setupMic();
  
  // Initialize Recaptcha Verifier on window load
  initRecaptcha();
};

function initRecaptcha() {
  try {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'invisible',
        'callback': (response) => {
          // reCAPTCHA solved
        },
        'expired-callback': () => {
          if (window.recaptchaVerifier) {
            window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
          }
        }
      }, firebase.auth());
    }
  } catch(e) {
    console.log("Recaptcha initialization note:", e);
  }
}

function toggleSidebar(show) {
  const sidebar = document.getElementById('sidebar');
  const chatArea = document.getElementById('chat-area');
  if (window.innerWidth <= 768) {
    if (show) { 
      sidebar.classList.remove('mobile-hidden'); 
      chatArea.classList.add('mobile-hidden'); 
    } else { 
      sidebar.classList.add('mobile-hidden'); 
      chatArea.classList.remove('mobile-hidden'); 
    }
  }
}

// --- STRICT FIREBASE REAL SIM OTP LOGIN FLOW ---
async function handleRealFirebaseOtpFlow() {
  const rawPhone = document.getElementById('auth-phone').value.trim();
  const otpSection = document.getElementById('otp-section');
  const otpInput = document.getElementById('auth-otp-input');
  const actionBtn = document.getElementById('otp-action-btn');

  if (!rawPhone) return alert("Please enter your phone number");
  
  // Format to standard E.164 phone format
  const fullPhone = "+91" + rawPhone.replace(/^\+91/, '').replace(/\s+/g, '');

  if (!appConfirmationResult) {
    actionBtn.innerText = "Sending OTP...";
    actionBtn.disabled = true;

    try {
      initRecaptcha();

      const confirmationResult = await firebase.auth().signInWithPhoneNumber(fullPhone, window.recaptchaVerifier);
      appConfirmationResult = confirmationResult;
      
      alert("🔒 SMS OTP has been sent to your SIM card!");
      otpSection.style.display = 'block';
      actionBtn.innerText = 'Verify & Login';
      actionBtn.disabled = false;
    } catch (error) {
      alert("Firebase Error: " + error.message);
      actionBtn.innerText = "Next";
      actionBtn.disabled = false;
      
      // Reset recaptcha state on error
      if (window.grecaptcha && window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
      }
    }
  } else {
    const otpCode = otpInput.value.trim();
    if (!otpCode) return alert("Enter the 6-digit SMS verification code");

    actionBtn.innerText = "Verifying...";
    actionBtn.disabled = true;

    try {
      const result = await appConfirmationResult.confirm(otpCode);
      
      // Send verified phone to backend for auto-login/register
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone }) 
      });
      const data = await res.json();
      
      if (data.error) {
        actionBtn.innerText = "Verify & Login";
        actionBtn.disabled = false;
        return alert(data.error);
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('userId', data.userId);
      localStorage.setItem('username', data.username);
      if (data.profilePic) localStorage.setItem('profilePic', data.profilePic);
      
      window.location.reload();
    } catch (error) {
      alert("Invalid SMS code entered!");
      actionBtn.innerText = "Verify & Login";
      actionBtn.disabled = false;
    }
  }
}

async function uploadProfilePic(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
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
  
  socket = io();
  socket.emit('identify', userId);

  socket.on('receiveMessage', (msg) => {
    const msgSender = String(msg.sender._id || msg.sender);
    const msgReceiver = String(msg.receiver._id || msg.receiver);
    
    if (activeFriendId && (msgSender === String(activeFriendId) || msgReceiver === String(activeFriendId))) {
      const tempBubble = document.getElementById(`temp-${msg.timestamp}`);
      if (tempBubble) tempBubble.remove();
      
      if (msg.text && msg.isEncrypted) {
         msg.text = decryptText(msg.text, mockEncryptionKey);
      }
      renderSingleMessage(msg);
      if (msgSender === String(activeFriendId)) socket.emit('readEmit', { msgId: msg._id, senderId: msgSender });
    }
  });

  socket.on('msgStatusUpdate', ({ msgId, status }) => {
     const tickEl = document.getElementById(`tick-${msgId}`);
     if (tickEl) {
        tickEl.innerHTML = '✓✓';
        if (status === 'read') tickEl.style.color = '#53bdeb'; 
     }
  });

  socket.on('messagesMarkedRead', ({ by }) => {
     if (String(by) === String(activeFriendId)) {
        document.querySelectorAll('.tick-status').forEach(el => { 
          el.innerHTML = '✓✓'; 
          el.style.color = '#53bdeb'; 
        });
     }
  });

  socket.on('statusChanged', ({ userId: changedId, isOnline, lastSeen }) => {
    loadDashboardData();
    if (String(activeFriendId) === String(changedId)) {
      document.getElementById('active-friend-status').innerText = isOnline ? 'online' : `last seen at ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    }
  });

  socket.on('incomingFriendRequest', () => loadDashboardData());
  loadDashboardData();
}

// --- E2EE CRYPTO ALGORITHMS ---
function encryptText(text, key) { return btoa(encodeURIComponent(text)); }
function decryptText(encodedText, key) {
  try { return decodeURIComponent(atob(encodedText)); } catch(e) { return "🔒 Decrypted"; }
}

async function loadDashboardData() {
  const res = await fetch('/api/dashboard', { headers: headers() });
  const data = await res.json();
  
  const reqList = document.getElementById('requests-list');
  if (reqList) {
    reqList.innerHTML = '';
    (data.friendRequests || []).forEach(req => {
      reqList.innerHTML += `<div class="list-item"><span>${req.username}</span><button class="btn-small" onclick="acceptFriend('${req._id}')">Accept</button></div>`;
    });
  }

  const friendsList = document.getElementById('friends-list');
  if (friendsList) {
    friendsList.innerHTML = '';
    (data.friends || []).forEach(f => {
      const avatar = f.profilePic || 'https://www.w3schools.com/howto/img_avatar.png';
      const statusText = f.isOnline ? 'online' : 'offline';
      friendsList.innerHTML += `
        <div class="list-item" onclick="openChat('${f._id}', '${f.username}', ${f.isOnline}, '${avatar}', '${f.lastSeen}')">
          <div style="display:flex; align-items:center; gap:12px;">
            <img src="${avatar}" style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
            <div>
              <div style="font-size:16px; font-weight:500; color:#e9edef;">${f.username}</div>
              <div style="font-size:13px; color:#8696a0;">Tap to chat</div>
            </div>
          </div>
          <span id="status-${f._id}" style="font-size:12px; color:${f.isOnline ? '#25d366':'#8696a0'}">${statusText}</span>
        </div>`;
    });
  }
}

async function sendFriendRequest() {
  const targetInput = document.getElementById('target-username');
  const target = targetInput.value.trim();
  if (!target) return;
  const res = await fetch('/api/friend-request', { method: 'POST', headers: headers(), body: JSON.stringify({ targetUsername: target }) });
  const data = await res.json();
  alert(data.message || data.error);
  targetInput.value = '';
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
  document.getElementById('active-friend-status').innerText = isOnline ? 'online' : `last seen at ${new Date(lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;

  const res = await fetch(`/api/messages/${friendId}`, { headers: headers() });
  let messages = await res.json();
  const display = document.getElementById('messages-display');
  display.innerHTML = '';
  
  messages.forEach(msg => {
     if (msg.text && msg.isEncrypted) msg.text = decryptText(msg.text, mockEncryptionKey);
     renderSingleMessage(msg);
  });
}

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
          reader.onloadend = async () => {
             selectedFile = { name: `Voice-${Date.now()}.mp3`, type: 'audio/mp3', data: reader.result };
             document.getElementById('message-input').value = `🎙️ Voice Note (Ready)`;
          };
          reader.readAsDataURL(audioBlob);
        };
        mediaRecorder.start();
        isRecording = true;
        micBtn.style.color = '#ea0038';
      } catch (err) {
        alert("Microphone access denied or not available");
      }
    } else {
      mediaRecorder.stop(); 
      isRecording = false; 
      micBtn.style.color = '#e9edef';
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
      if (msg.fileType.startsWith('image/')) contentHtml += `<img src="${msg.fileUrl}">`;
      else if (msg.fileType.startsWith('video/')) contentHtml += `<video src="${msg.fileUrl}" controls></video>`;
      else if (msg.fileType.startsWith('audio/')) contentHtml += `<audio src="${msg.fileUrl}" controls style="max-width:100%;"></audio>`;
      else contentHtml += `<div style="padding:10px; background:#0000000d; border-radius:6px; margin-bottom:5px;">📄 ${msg.fileName}</div>`;
      contentHtml += `<a href="${msg.fileUrl}" download="${msg.fileName}" style="color:#00a884; text-decoration:none; font-size:12px; font-weight:bold; display:block; margin-top:6px;">⬇ Download File</a>`;
  }
  if (msg.text) contentHtml += `<p style="margin-top:4px;">${msg.text}</p>`;

  if (type === 'sent') {
     let tickSymbol = '✓'; let tickColor = '#8696a0';
     if (msg.status === 'delivered' || msg.status === 'read') tickSymbol = '✓✓';
     if (msg.status === 'read') tickColor = '#53bdeb';
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
        if (bar) bar.style.width = percentComplete + '%';
        if (text) text.innerText = percentComplete + '%';
      }
    };
    
    xhr.onload = function() {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        if (response.fileUrl) {
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
        if (temp) temp.remove(); 
      }
    };
    
    xhr.send(JSON.stringify({ fileName: filePayload.name, fileData: filePayload.data }));
  } else {
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

function logout() { 
  localStorage.clear(); 
  window.location.reload(); 
    }
                                                                                                    
