// Advanced Meta AI Real Chat Interface (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const searchBox = document.querySelector('.search-box');
    if (searchBox && !document.getElementById('meta-ai-btn')) {
      const metaBtn = document.createElement('button');
      metaBtn.id = 'meta-ai-btn';
      metaBtn.className = 'btn-add';
      metaBtn.title = 'Open Meta AI Assistant';
      metaBtn.innerHTML = '✨ Meta AI';
      metaBtn.style.cssText = "background: linear-gradient(135deg, #00c6ff, #0072ff); color: white; border: none; padding: 6px 12px; border-radius: 20px; font-weight: bold; cursor: pointer; margin-left: 6px; font-size: 12px;";
      metaBtn.onclick = openMetaAIWindow;
      searchBox.appendChild(metaBtn);
    }
  }, 1500);
});

function openMetaAIWindow() {
  // Purana modal agar ho toh hata dein
  const existingModal = document.getElementById('meta-ai-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'meta-ai-modal';
  modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:5000; display:flex; align-items:center; justifyContent:center;";
  
  modal.innerHTML = `
    <div style="width: 450px; max-width: 90%; height: 600px; background: #111b21; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.5); border: 1px solid #30383f;">
      <div style="background: #202c33; padding: 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #30383f;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 35px; height: 35px; background: linear-gradient(135deg, #00c6ff, #0072ff); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">✨</div>
          <div>
            <h3 style="color: #e9edef; margin: 0; font-size: 16px;">Meta AI</h3>
            <span style="color: #00a884; font-size: 11px;">Online & Ready</span>
          </div>
        </div>
        <button id="close-meta-modal" style="background: none; border: none; color: #8696a0; font-size: 24px; cursor: pointer;">&times;</button>
      </div>
      
      <div id="meta-chat-messages" style="flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #0b141a;">
        <div style="background: #202c33; color: #e9edef; padding: 10px 14px; border-radius: 8px; max-width: 80%; align-self: flex-start; font-size: 13px;">
          Hello! I am your advanced Meta AI. Ask me anything—coding, math, logic, or general questions! 🚀
        </div>
      </div>
      
      <div style="padding: 12px; background: #202c33; display: flex; gap: 8px; align-items: center;">
        <input type="text" id="meta-ai-input" placeholder="Ask Meta AI a complex question..." style="flex: 1; background: #2a3942; border: none; padding: 10px 14px; border-radius: 8px; color: white; outline: none; font-size: 13px;">
        <button id="meta-ai-send" style="background: #00a884; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: bold;">Send</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('close-meta-modal').onclick = () => modal.remove();
  
  const sendBtn = document.getElementById('meta-ai-send');
  const inputField = document.getElementById('meta-ai-input');

  const handleSend = async () => {
    const text = inputField.value.trim();
    if (!text) return;

    const chatContainer = document.getElementById('meta-chat-messages');
    
    // User message bubble
    chatContainer.innerHTML += `
      <div style="background: #005c4b; color: #e9edef; padding: 10px 14px; border-radius: 8px; max-width: 80%; align-self: flex-end; font-size: 13px;">
        ${text}
      </div>`;
    inputField.value = '';
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Loading indicator
    const loadingId = 'loading-' + Date.now();
    chatContainer.innerHTML += `
      <div id="${loadingId}" style="background: #202c33; color: #8696a0; padding: 10px 14px; border-radius: 8px; max-width: 80%; align-self: flex-start; font-size: 13px; font-style: italic;">
        Meta AI is thinking...
      </div>`;
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
      // Backend API call
      const res = await fetch('/api/meta-ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('token')
        },
        body: JSON.stringify({ prompt: text })
      });
      const data = await res.json();
      
      document.getElementById(loadingId).remove();

      chatContainer.innerHTML += `
        <div style="background: #202c33; color: #e9edef; padding: 10px 14px; border-radius: 8px; max-width: 85%; align-self: flex-start; font-size: 13px; white-space: pre-wrap; line-height: 1.4;">
          ${data.reply || data.error}
        </div>`;
      chatContainer.scrollTop = chatContainer.scrollHeight;
    } catch (err) {
      document.getElementById(loadingId).remove();
      chatContainer.innerHTML += `
        <div style="background: #3f1d1d; color: #ff8080; padding: 10px 14px; border-radius: 8px; max-width: 80%; align-self: flex-start; font-size: 13px;">
          Error connecting to Meta AI server.
        </div>`;
    }
  };

  sendBtn.onclick = handleSend;
  inputField.onkeypress = (e) => { if (e.key === 'Enter') handleSend(); };
}
