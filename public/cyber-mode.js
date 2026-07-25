// Advanced Cyber Matrix & Rola Feature (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const chatHeaderActions = document.querySelector('.chat-header-actions');
    if (chatHeaderActions) {
      if (!document.getElementById('cyber-mode-btn')) {
        const cyberBtn = document.createElement('button');
        cyberBtn.id = 'cyber-mode-btn';
        cyberBtn.className = 'icon-btn';
        cyberBtn.title = 'Activate Hacker / Cyber Mode (Rola Feature)';
        cyberBtn.innerHTML = '⚡';
        cyberBtn.onclick = toggleCyberMode;
        chatHeaderActions.prepend(cyberBtn);
      }
    }
  }, 1300);
});

function toggleCyberMode() {
  let isCyberActive = localStorage.getItem('cyberMode') === 'true';
  isCyberActive = !isCyberActive;
  localStorage.setItem('cyberMode', isCyberActive);
  applyCyberTheme(isCyberActive);
}

function applyCyberTheme(isActive) {
  const appContainer = document.querySelector('.app-container');
  if (!appContainer) return;

  if (isActive) {
    // Cyber Hacker Style Injection
    appContainer.style.filter = 'hue-rotate(90deg) contrast(120%)';
    document.body.style.background = '#000000';
    
    // Sound effect ya alert
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    try { audio.play(); } catch(e){}

    // Create Matrix Rain Effect overlay
    if (!document.getElementById('matrix-rain-canvas')) {
      const canvas = document.createElement('canvas');
      canvas.id = 'matrix-rain-canvas';
      canvas.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:9999; opacity:0.15;";
      document.body.appendChild(canvas);
      startMatrixRain(canvas);
    }
    alert("⚡ CYBER HACKER MODE ACTIVATED! Rola jam gaya dost!");
  } else {
    appContainer.style.filter = 'none';
    document.body.style.background = '';
    const canvas = document.getElementById('matrix-rain-canvas');
    if (canvas) canvas.remove();
    alert("Normal mode restored.");
  }
}

function startMatrixRain(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const letters = '01ABCDEF_WHATSAPP_ULTRA_PRO_SUMIT';
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

// Auto apply on load if saved
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (localStorage.getItem('cyberMode') === 'true') {
      applyCyberTheme(true);
    }
  }, 1500);
});
