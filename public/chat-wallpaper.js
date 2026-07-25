// Chat Wallpaper Customizer with Custom Photo Support (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
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

    // Pehle se saved wallpaper (color ya photo) apply karein
    const savedWallpaper = localStorage.getItem('chatWallpaper');
    if (savedWallpaper) {
      applyWallpaperStyle(savedWallpaper);
    }
  }, 1000);
});

function openWallpaperSelector() {
  let choice = prompt(
    "Choose Chat Background Option:\n" +
    "1. Classic WhatsApp\n" +
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
    localStorage.setItem('chatWallpaper', selected);
    applyWallpaperStyle(selected);
  } else if (choice === '6') {
    // Hidden file input create kar rahe hain custom photo select karne ke liye
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Image = `url('${event.target.result}')`;
        localStorage.setItem('chatWallpaper', base64Image);
        applyWallpaperStyle(base64Image);
        alert("Custom photo wallpaper applied successfully!");
      };
      reader.readAsDataURL(file);
    };
    fileInput.click();
  } else {
    alert("Invalid option selected.");
  }
}

function applyWallpaperStyle(bgValue) {
  const messagesDisplay = document.getElementById('messages-display');
  if (messagesDisplay) {
    if (bgValue.startsWith('url(')) {
      messagesDisplay.style.background = bgValue;
      messagesDisplay.style.backgroundSize = 'cover';
      messagesDisplay.style.backgroundPosition = 'center';
    } else {
      messagesDisplay.style.background = bgValue;
      messagesDisplay.style.backgroundSize = 'auto';
    }
  }
}
