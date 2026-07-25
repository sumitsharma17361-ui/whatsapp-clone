// Chat Wallpaper Customizer Feature (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
  // Chat header me ek wallpaper button inject kar rahe hain bina main.js ko chhede
  setTimeout(() => {
    const chatHeaderActions = document.querySelector('.chat-header-actions');
    if (chatHeaderActions) {
      const wallpaperBtn = document.createElement('button');
      wallpaperBtn.className = 'icon-btn';
      wallpaperBtn.title = 'Change Chat Wallpaper';
      wallpaperBtn.innerHTML = '🎨';
      wallpaperBtn.onclick = openWallpaperSelector;
      chatHeaderActions.prepend(wallpaperBtn);
    }

    // Pehle se saved wallpaper apply karein
    const savedWallpaper = localStorage.getItem('chatWallpaper');
    if (savedWallpaper) {
      applyWallpaperStyle(savedWallpaper);
    }
  }, 1000);
});

function openWallpaperSelector() {
  const wallpapers = [
    { name: 'Classic WhatsApp', value: 'var(--chat-bg)' },
    { name: 'Dark Charcoal', value: '#0b141a' },
    { name: 'Soft Mint', value: '#e1f5fe' },
    { name: 'Lavender Night', value: '#1a102f' },
    { name: 'Sunset Gradient', value: 'linear-gradient(135deg, #2c3e50, #4ca1af)' }
  ];

  let choice = prompt("Choose a Chat Background:\n1. Classic\n2. Dark Charcoal\n3. Soft Mint\n4. Lavender Night\n5. Sunset Gradient\n\nEnter number (1-5):");
  
  if (choice && choice >= 1 && choice <= wallpapers.length) {
    const selected = wallpapers[choice - 1].value;
    localStorage.setItem('chatWallpaper', selected);
    applyWallpaperStyle(selected);
  }
}

function applyWallpaperStyle(bgValue) {
  const messagesDisplay = document.getElementById('messages-display');
  if (messagesDisplay) {
    messagesDisplay.style.background = bgValue;
  }
}
