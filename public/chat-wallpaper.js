// Strict Per-Chat Custom Wallpaper Feature (Instant Load)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const chatHeaderActions = document.querySelector('.chat-header-actions');
    if (chatHeaderActions) {
      if (!document.getElementById('wallpaper-custom-btn')) {
        const wallpaperBtn = document.createElement('button');
        wallpaperBtn.id = 'wallpaper-custom-btn';
        wallpaperBtn.className = 'icon-btn';
        wallpaperBtn.title = 'Change Chat Wallpaper for this Friend';
        wallpaperBtn.innerHTML = '🎨';
        wallpaperBtn.onclick = openWallpaperSelector;
        chatHeaderActions.prepend(wallpaperBtn);
      }
    }
  }, 1000);
});

function getCurrentChatKey() {
  const friendNameElem = document.getElementById('active-friend-name');
  if (friendNameElem && friendNameElem.innerText && friendNameElem.innerText !== 'Friend Name') {
    return "wp_user_" + friendNameElem.innerText.trim();
  }
  return null;
}

function applyCurrentChatWallpaper() {
  const chatKey = getCurrentChatKey();
  const messagesDisplay = document.getElementById('messages-display');
  if (!messagesDisplay) return;

  if (chatKey) {
    const savedWallpaper = localStorage.getItem(chatKey);
    if (savedWallpaper) {
      applyWallpaperStyle(savedWallpaper, messagesDisplay);
      return;
    }
  }
  
  messagesDisplay.style.background = 'var(--chat-bg)';
  messagesDisplay.style.backgroundSize = 'auto';
}

// Hook into openChat with immediate execution
const originalOpenChat = window.openChat;
if (typeof originalOpenChat === 'function' && !window._wallpaperHooked) {
  window._wallpaperHooked = true;
  window.openChat = function(...args) {
    originalOpenChat.apply(this, args);
    // Turant bina delay ke wallpaper apply karein taaki flicker na ho
    requestAnimationFrame(applyCurrentChatWallpaper);
  };
}

function openWallpaperSelector() {
  const chatKey = getCurrentChatKey();

  if (!chatKey) {
    alert("Please open a specific friend's chat first to change its wallpaper!");
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
    localStorage.setItem(chatKey, selected);
    applyCurrentChatWallpaper();
    alert("Wallpaper updated successfully for this chat!");
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
        localStorage.setItem(chatKey, base64Image);
        applyCurrentChatWallpaper();
        alert("Custom photo wallpaper applied successfully for this chat!");
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
