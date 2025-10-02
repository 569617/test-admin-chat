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
    // --- ОТОБРАЖЕНИЕ ПРОФИЛЯ И ВЫХОД ---
    myUsernameDisplay.textContent = currentUser;
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('username');
        window.location.href = '/index.html';
    });
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
            const chats = await response.json();
            chatList.innerHTML = '';
            chats.forEach(chat => {
                const li = document.createElement('li');
                li.className = 'chat-list-item';
                li.dataset.username = chat.username;
                li.innerHTML = `
                    <div class="chat-info">
                        <span class="chat-name">${chat.username}</span>
                        <span class="chat-status ${chat.isOnline ? 'status-online' : 'status-offline'}">
                            ${chat.isOnline ? 'Онлайн' : 'Оффлайн'}
                        </span>
                    </div>
                    <div class="chat-badge-menu-wrapper">
                        ${chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
                        <div class="chat-item-menu">
                            <button class="menu-button">⋮</button>
                            <div class="menu-content hidden">
                                <a href="#" class="delete-chat-button">Удалить</a>
                            </div>
                        </div>
                    </div>
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
        const menuButton = e.target.closest('.menu-button');
        const deleteButton = e.target.closest('.delete-chat-button');
        const chatItem = e.target.closest('li.chat-list-item');

        if (menuButton) { // Клик по трём точкам
            const menu = menuButton.nextElementSibling;
            menu.classList.toggle('hidden');
        } else if (deleteButton) { // Клик по кнопке "Удалить"
            const otherUser = chatItem.dataset.username;
            if (confirm(`Вы уверены, что хотите удалить чат с ${otherUser}?`)) {
                fetch('/chats', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentUser, otherUser })
                }).then(() => loadChatList());
            }
        } else if (chatItem) { // Клик по самому чату
            const otherUser = chatItem.dataset.username;
            startChat(otherUser);
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
    // НОВЫЙ обработчик: изменение статуса пользователя
    socket.on('user status changed', ({ username, isOnline }) => {
        const chatItem = chatList.querySelector(`[data-username="${username}"]`);
        if (chatItem) {
            const statusElement = chatItem.querySelector('.chat-status');
            statusElement.textContent = isOnline ? 'Онлайн' : 'Оффлайн';
            statusElement.className = `chat-status ${isOnline ? 'status-online' : 'status-offline'}`;
        }
    });

    loadChatList();
});