// Per-Chat Custom Wallpaper Feature (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const chatHeaderActions = document.querySelector('.chat-header-actions');
    if (chatHeaderActions) {
      const wallpaperBtn = document.createElement('button');
      wallpaperBtn.className = 'icon-btn';
      wallpaperBtn.title = 'Change Chat Wallpaper for this Friend';
      wallpaperBtn.innerHTML = '🎨';
      wallpaperBtn.onclick = openWallpaperSelector;
      chatHeaderActions.prepend(wallpaperBtn);
    }
  }, 1000);
});

// Jab bhi chat khulegi ya switch hogi, yeh function background apply kar dega
function applyCurrentChatWallpaper() {
  const friendId = window.activeFriendId; // main.js se active friend ki ID le rahe hain
  const messagesDisplay = document.getElementById('messages-display');
  if (!messagesDisplay) return;

  if (friendId) {
    const savedWallpaper = localStorage.getItem(`wallpaper_${friendId}`);
    if (savedWallpaper) {
      applyWallpaperStyle(savedWallpaper, messagesDisplay);
      return;
    }
  }
  
  // Default wallpaper agar is friend ke liye kuch set nahi hai
  messagesDisplay.style.background = 'var(--chat-bg)';
  messagesDisplay.style.backgroundSize = 'auto';
}

// Har baar chat open hone par wallpaper check karne ke liye ek chhota sa hook laga rahe hain
const originalOpenChat = window.openChat;
if (typeof originalOpenChat === 'function') {
  window.openChat = function(...args) {
    originalOpenChat.apply(this, args);
    setTimeout(applyCurrentChatWallpaper, 100); // Chat khulne ke turant baad wallpaper load ho jayega
  };
}

function openWallpaperSelector() {
  const friendId = window.activeFriendId;
  if (!friendId) {
    alert("Please open a chat first to change its wallpaper!");
    return;
  }

  let choice = prompt(
    "Choose Chat Background for this Contact:\n\n" +
    "1. Default WhatsApp Theme\n" +
    "2. Dark Charcoal\n" +
    "3. Soft Mint\n" +
    "4. Lavender Night\n" +
    "5. Sunset Gradient\n" +
    "6. Upload Custom Photo (From Device)\n\nEnter option (1-6):"
  );
  
  if (!choice) return;

  const wallpapers = {
    '1': 'var(--chat-bg)',
    '2': '#0b141a',
    '3': '#e1f5fe',
    '4': '#1a102f',
    '5': 'linear-gradient(135deg, #2c3e50, #4ca1af)'
  };

  if (wallpapers[choice]) {
    const selected = wallpapers[choice];
    localStorage.setItem(`wallpaper_${friendId}`, selected);
    applyCurrentChatWallpaper();
    alert("Wallpaper updated for this chat!");
  } else if (choice === '6') {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Image = `url('${event.target.result}')`;
        localStorage.setItem(`wallpaper_${friendId}`, base64Image);
        applyCurrentChatWallpaper();
        alert("Custom photo wallpaper applied for this chat!");
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  } else {
    alert("Invalid option selected.");
  }
}

function applyWallpaperStyle(bgValue, element) {
  if (bgValue.startsWith('url(')) {
    element.style.background = bgValue;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
  } else {
    element.style.background = bgValue;
    element.style.backgroundSize = 'auto';
  }
}
