// Advanced Secret Vault & AI Bot Feature (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const chatHeaderActions = document.querySelector('.chat-header-actions');
    if (chatHeaderActions) {
      // 1. Secret Vault Lock Button
      if (!document.getElementById('vault-btn')) {
        const vaultBtn = document.createElement('button');
        vaultBtn.id = 'vault-btn';
        vaultBtn.className = 'icon-btn';
        vaultBtn.title = 'Lock Chat with Secret Vault PIN';
        vaultBtn.innerHTML = '🔐';
        vaultBtn.onclick = toggleChatVault;
        chatHeaderActions.prepend(vaultBtn);
      }

      // 2. AI Cyber Bot Companion Button
      if (!document.getElementById('ai-bot-btn')) {
        const aiBtn = document.createElement('button');
        aiBtn.id = 'ai-bot-btn';
        aiBtn.className = 'icon-btn';
        aiBtn.title = 'Toggle Cyber AI Auto-Reply Bot';
        aiBtn.innerHTML = '🤖';
        aiBtn.onclick = toggleAIBot;
        chatHeaderActions.prepend(aiBtn);
      }
    }
  }, 1400);
});

// --- FEATURE 1: Secret Chat Vault & PIN ---
function toggleChatVault() {
  const friendNameElem = document.getElementById('active-friend-name');
  if (!friendNameElem || friendNameElem.innerText === 'Friend Name') {
    alert("Please open a chat to lock it in the Secret Vault!");
    return;
  }
  const chatName = friendNameElem.innerText.trim();
  const vaultKey = `vault_lock_${chatName}`;
  const isLocked = localStorage.getItem(vaultKey) === 'true';

  if (!isLocked) {
    let pin = prompt("Set a 4-digit Secret PIN to lock this chat:");
    if (pin && pin.length >= 3) {
      localStorage.setItem(vaultKey, 'true');
      localStorage.setItem(`vault_pin_${chatName}`, pin);
      alert(`🔐 Chat with ${chatName} is now SECURED inside the Secret Vault!`);
      document.getElementById('active-chat').classList.add('hidden');
      document.getElementById('chat-placeholder').classList.remove('hidden');
    } else {
      alert("PIN must be at least 3-4 digits.");
    }
  } else {
    let enteredPin = prompt("Enter Secret PIN to unlock this chat:");
    const savedPin = localStorage.getItem(`vault_pin_${chatName}`);
    if (enteredPin === savedPin) {
      localStorage.setItem(vaultKey, 'false');
      alert(`🔓 Chat unlocked successfully!`);
    } else {
      alert("❌ Incorrect PIN! Access Denied.");
    }
  }
}

// --- FEATURE 2: AI Cyber Bot Auto-Reply ---
let aiBotActive = false;
function toggleAIBot() {
  aiBotActive = !aiBotActive;
  if (aiBotActive) {
    alert("🤖 Cyber AI Companion Activated! It will now auto-reply to incoming messages in cyberpunk style.");
    // Listen to incoming messages for auto-reply simulation
    window._aiInterval = setInterval(simulateAIResponse, 4000);
  } else {
    clearInterval(window._aiInterval);
    alert("🤖 Cyber AI Companion Deactivated.");
  }
}

function simulateAIResponse() {
  if (!aiBotActive) return;
  const display = document.getElementById('messages-display');
  if (!display) return;

  const responses = [
    "⚡ [AI BOT]: Neural link established. Affirmative.",
    "🤖 [AI BOT]: Processing quantum data stream...",
    "⚡ [AI BOT]: Acknowledged, human. Encryption verified.",
    "🤖 [AI BOT]: Systems optimal. Standing by for next command."
  ];
  const randomReply = responses[Math.floor(Math.random() * responses.length)];
  
  // Render dummy incoming AI response safely
  const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  display.innerHTML += `
    <div class="msg received">
      <div class="media-box">
        <p style="margin-top:4px; color:#00ffcc; font-family:monospace;">${randomReply}</p>
        <div style="float:right; display:flex; align-items:center; gap:4px; margin-top:2px; margin-left:8px; font-size:10px; color:#8696a0; font-weight:600;">
          <span>${timeString}</span>
        </div>
      </div>
    </div>`;
  display.scrollTop = display.scrollHeight;
}
