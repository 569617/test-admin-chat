document.addEventListener('DOMContentLoaded', () => {
    const currentUser = localStorage.getItem('username');
    if (!currentUser) { window.location.href = '/index.html'; return; }

    const socket = io();
    socket.emit('user connected', currentUser);

    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const chatList = document.getElementById('chat-list');
    const welcomePane = document.getElementById('welcome-pane');
    const chatPane = document.getElementById('chat-pane');
    const chatWithUsername = document.getElementById('chat-with-username');
    const messages = document.getElementById('messages');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');

    let currentChatUser = null;
    let unreadCounts = {};

    function addMessageToList(sender, message) {
        const li = document.createElement('li');
        li.className = sender === currentUser ? 'my-message' : 'other-message';
        if (sender !== currentUser) {
            const senderSpan = document.createElement('span');
            senderSpan.className = 'sender-name';
            senderSpan.textContent = sender;
            li.appendChild(senderSpan);
        }
        const messageSpan = document.createElement('span');
        messageSpan.className = 'message-text';
        messageSpan.textContent = message;
        li.appendChild(messageSpan);
        messages.appendChild(li);
        messages.scrollTop = messages.scrollHeight;
    }

    async function loadChatList() {
        try {
            const response = await fetch(`/chats?username=${currentUser}`);
            const data = await response.json();
            unreadCounts = data.unreadCounts || {};
            chatList.innerHTML = '';
            (data.chatPartners || []).forEach(user => {
                const count = unreadCounts[user] || 0;
                const li = document.createElement('li');
                li.className = 'chat-list-item';
                li.dataset.username = user;
                li.innerHTML = `
                    <span class="chat-name">${user}</span>
                    ${count > 0 ? `<span class="unread-badge">${count}</span>` : ''}
                `;
                chatList.appendChild(li);
            });
        } catch (error) { console.error('Ошибка загрузки списка чатов:', error); }
    }

    async function startChat(otherUser) {
        welcomePane.classList.add('hidden');
        chatPane.classList.remove('hidden');
        chatWithUsername.textContent = otherUser;
        messages.innerHTML = '';
        currentChatUser = otherUser;

        const roomName = [currentUser, otherUser].sort().join('-');
        try {
            const response = await fetch(`/messages/${roomName}`);
            const history = await response.json();
            history.reverse().forEach(msg => addMessageToList(msg.from, msg.message));
        } catch (error) {
            console.error("Ошибка загрузки истории:", error);
        }

        if (unreadCounts[otherUser] > 0) {
            await fetch('/chats/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentUser, otherUser })
            });
            loadChatList();
        }
    }

    searchInput.addEventListener('input', async () => {
        const searchTerm = searchInput.value;
        searchResults.innerHTML = '';
        if (searchTerm.length < 2) return;
        try {
            const response = await fetch(`/search/users?term=${searchTerm}&currentUser=${currentUser}`);
            const users = await response.json();
            users.forEach(user => {
                const li = document.createElement('li');
                li.textContent = user;
                li.className = 'search-result-item';
                searchResults.appendChild(li);
            });
        } catch (error) { console.error('Ошибка при поиске:', error); }
    });

    searchResults.addEventListener('click', async (e) => {
        if (e.target && e.target.nodeName === 'LI') {
            const otherUser = e.target.textContent;
            await fetch('/chats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user1: currentUser, user2: otherUser })
            });
            await loadChatList();
            startChat(otherUser);
            searchInput.value = '';
            searchResults.innerHTML = '';
        }
    });

    chatList.addEventListener('click', (e) => {
        const targetLi = e.target.closest('li.chat-list-item');
        if (targetLi) {
            const otherUser = targetLi.dataset.username;
            startChat(otherUser);
        }
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = messageInput.value;
        if (message && currentChatUser) {
            addMessageToList(currentUser, message);
            socket.emit('private message', { to: currentChatUser, message, from: currentUser });
            messageInput.value = '';
        }
    });

    socket.on('private message', (data) => {
        loadChatList();
        if (data.from === currentChatUser) {
            addMessageToList(data.from, data.message);
            fetch('/chats/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentUser, otherUser: data.from })
            });
        }
    });

    loadChatList();
});