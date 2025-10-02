document.addEventListener('DOMContentLoaded', () => {
    const currentUser = localStorage.getItem('username');
    if (!currentUser) {
        window.location.href = '/index.html';
        return;
    }

    const socket = io();
    socket.emit('user connected', currentUser);

    // --- Все элементы страницы ---
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const chatList = document.getElementById('chat-list');
    const welcomePane = document.getElementById('welcome-pane');
    const chatPane = document.getElementById('chat-pane');
    const chatWithUsername = document.getElementById('chat-with-username');
    const messages = document.getElementById('messages');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('message-input');
    const myUsernameDisplay = document.getElementById('my-username');
    const logoutButton = document.getElementById('logout-button');

    let currentChatUser = null;

    // --- Отображение профиля и выход ---
    myUsernameDisplay.textContent = currentUser;
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('username');
        window.location.href = '/index.html';
    });
    
    // --- Основные функции ---
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
        // Получаем от сервера объект, например: { chatPartners: ['Main'], unreadCounts: {'Main': 0} }
        const data = await response.json(); 

        // ИСПРАВЛЕНИЕ: Мы будем работать со свойством data.chatPartners, а не с data напрямую
        const chatPartners = data.chatPartners || [];
        unreadCounts = data.unreadCounts || {};

        chatList.innerHTML = '';
        chatPartners.forEach(partnerName => { // Теперь мы перебираем правильный массив имён
            const count = unreadCounts[partnerName] || 0;
            const li = document.createElement('li');
            li.className = 'chat-list-item';
            li.dataset.username = partnerName;
            li.innerHTML = `
                <div class="chat-info">
                    <span class="chat-name">${partnerName}</span>
                    <span class="chat-status status-offline">Оффлайн</span>
                </div>
                <div class="chat-badge-menu-wrapper">
                    ${count > 0 ? `<span class="unread-badge">${count}</span>` : ''}
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
    } catch (error) { 
        console.error('Ошибка загрузки списка чатов:', error); 
    }
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
        } catch (error) { console.error("Ошибка загрузки истории:", error); }
        
        await fetch('/chats/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentUser, otherUser })
        });
        loadChatList();
    }

    // --- Обработчики событий ---
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
        if (e.target.nodeName === 'LI') {
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

    if (menuButton) {
        // --- ВОТ ИСПРАВЛЕНИЕ ---
        e.stopPropagation(); // Останавливаем "протекание" клика
        const menu = menuButton.nextElementSibling;
        // Закрываем все другие открытые меню
        document.querySelectorAll('.menu-content').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
    } else if (deleteButton) {
        e.preventDefault();
        const otherUser = chatItem.dataset.username;
        if (confirm(`Вы уверены, что хотите удалить чат с ${otherUser}?`)) {
            fetch('/chats', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentUser, otherUser })
            }).then(() => {
                if(currentChatUser === otherUser) {
                    welcomePane.classList.remove('hidden');
                    chatPane.classList.add('hidden');
                    currentChatUser = null;
                }
                loadChatList();
            });
        }
    } else if (chatItem) {
        // Закрываем все меню при открытии чата
        document.querySelectorAll('.menu-content').forEach(m => m.classList.add('hidden'));
        const otherUser = chatItem.dataset.username;
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
    // public/js/chat.js

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