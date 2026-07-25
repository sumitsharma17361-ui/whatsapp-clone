// Meta AI Companion Feature (Alag se banayi gayi file)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // Sidebar ke chats section ya header me Meta AI trigger button jod rahe hain
    const searchBox = document.querySelector('.search-box');
    if (searchBox && !document.getElementById('meta-ai-btn')) {
      const metaBtn = document.createElement('button');
      metaBtn.id = 'meta-ai-btn';
      metaBtn.className = 'btn-add';
      metaBtn.title = 'Chat with Meta AI';
      metaBtn.innerHTML = '🤖';
      metaBtn.style.background = '#00a884';
      metaBtn.style.color = 'white';
      metaBtn.style.marginLeft = '5px';
      metaBtn.onclick = openMetaAIChat;
      searchBox.appendChild(metaBtn);
    }
  }, 1500);
});

function openMetaAIChat() {
  // Meta AI ke sath chat karne ke liye ek mock window ya alert modal khol rahe hain
  const query = prompt("Ask Meta AI anything (e.g., 'Write a poem', 'What is quantum computing?'):");
  if (!query) return;

  // Simple smart automated responses based on keywords (Meta AI simulation)
  let aiResponse = "I am Meta AI, your virtual assistant. How can I help you today?";
  const q = query.toLowerCase();

  if (q.includes('hello') || q.includes('hi')) {
    aiResponse = "Hello! How can I assist you right now?";
  } else if (q.includes('poem')) {
    aiResponse = "Lines of code in glowing night,\nWhatsApp Ultra shining bright,\nFriends connected far and near,\nTalking loud and crystal clear!";
  } else if (q.includes('javascript') || q.includes('code')) {
    aiResponse = "JavaScript is a versatile programming language used for both frontend and backend development.";
  } else {
    aiResponse = `Here is what I found regarding "${query}": It's an interesting topic! Let me know if you need code snippets or deep analysis.`;
  }

  alert(`🤖 Meta AI Assistant:\n\n${aiResponse}`);
}
