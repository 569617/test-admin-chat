require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const { createClient } = require('@vercel/kv');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const SOCKET_SERVER_URL = "https://test-admin-chat.onrender.com"; 
const socket = io(SOCKET_SERVER_URL);
socket.emit('user connected', currentUser);
const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

app.use(helmet());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
// --- Карта онлайн пользователей ---
const onlineUsers = new Map();
// --- Эндпоинты ---

app.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ message: "Пожалуйста, заполните все поля." });
        const userExists = await kv.exists(`user:${username}`);
        if (userExists) return res.status(400).json({ message: "Пользователь с таким именем уже существует." });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = { username, email, password: hashedPassword };
        await kv.set(`user:${username}`, JSON.stringify(user));
        res.status(201).json({ message: "Регистрация прошла успешно!" });
    } catch (error) {
        console.error("Ошибка регистрации:", error);
        res.status(500).json({ message: "Ошибка на сервере." });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const userData = await kv.get(`user:${username}`);
        if (!userData) return res.status(400).json({ message: "Неверное имя пользователя или пароль." });
        const user = JSON.parse(JSON.stringify(userData));
        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (isPasswordCorrect) res.status(200).json({ message: "Вход выполнен успешно!", username: user.username });
        else res.status(400).json({ message: "Неверное имя пользователя или пароль." });
    } catch (error) {
        console.error("Ошибка входа:", error);
        res.status(500).json({ message: "Ошибка на сервере." });
    }
});

app.get('/search/users', async (req, res) => {
    try {
        const { term, currentUser } = req.query;
        if (!term) return res.json([]);
        const userKeys = [];
        for await (const key of kv.scanIterator({ match: 'user:*' })) { userKeys.push(key); }
        const matchedUsernames = userKeys
            .map(key => key.replace('user:', ''))
            .filter(username => username.toLowerCase().includes(term.toLowerCase()) && username !== currentUser);
        res.json(matchedUsernames);
    } catch (error) {
        console.error("Ошибка поиска:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});

app.get('/chats', async (req, res) => {
    try {
        const { username } = req.query;
        const chatPartners = await kv.get(`chats:${username}`) || [];
        const unreadCounts = {};
        for (const partner of chatPartners) {
            const count = await kv.get(`unread:${username}:${partner}`) || 0;
            unreadCounts[partner] = count;
        }
        res.json({ chatPartners, unreadCounts });
    } catch (error) {
        console.error("Ошибка получения чатов:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});

app.post('/chats', async (req, res) => {
    try {
        const { user1, user2 } = req.body;
        let user1Chats = await kv.get(`chats:${user1}`) || [];
        if (!user1Chats.includes(user2)) {
            user1Chats.push(user2);
            await kv.set(`chats:${user1}`, user1Chats);
        }
        let user2Chats = await kv.get(`chats:${user2}`) || [];
        if (!user2Chats.includes(user1)) {
            user2Chats.push(user1);
            await kv.set(`chats:${user2}`, user2Chats);
        }
        res.status(200).json({ message: "Чат добавлен" });
    } catch (error) {
        console.error("Ошибка добавления чата:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});
// НОВЫЙ эндпоинт для удаления чата
app.delete('/chats', async (req, res) => {
    try {
        const { currentUser, otherUser } = req.body;

        // 1. Удаляем чат из списков обоих пользователей
        let currentUserChats = await kv.get(`chats:${currentUser}`) || [];
        await kv.set(`chats:${currentUser}`, currentUserChats.filter(u => u !== otherUser));
        
        let otherUserChats = await kv.get(`chats:${otherUser}`) || [];
        await kv.set(`chats:${otherUser}`, otherUserChats.filter(u => u !== currentUser));

        // --- НОВОЕ: Полностью удаляем историю сообщений ---
        const roomName = [currentUser, otherUser].sort().join('-');
        await kv.del(`messages:${roomName}`);
        
        res.status(200).json({ message: "Чат и история сообщений полностью удалены" });
    } catch (error) { 
        console.error("Ошибка при удалении чата:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});
// НОВЫЙ эндпоинт для сохранения публичного ключа
app.post('/public-key', async (req, res) => {
    try {
        const { username, publicKey } = req.body;
        // Сохраняем ключ в базе под ключом public_key:имя_пользователя
        await kv.set(`public_key:${username}`, publicKey);
        res.status(200).json({ message: "Публичный ключ сохранён" });
    } catch (error) {
        console.error("Ошибка сохранения публичного ключа:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});
app.post('/chats/read', async (req, res) => {
    try {
        const { currentUser, otherUser } = req.body;
        await kv.set(`unread:${currentUser}:${otherUser}`, 0);
        res.status(200).json({ message: "Счётчик сброшен" });
    } catch (error) {
        console.error("Ошибка сброса счётчика:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});

app.get('/messages/:room', async (req, res) => {
    try {
        const { room } = req.params;
        const messages = await kv.lrange(`messages:${room}`, 0, -1);
        res.json(messages);
    } catch (error) {
        console.error("Ошибка загрузки истории:", error);
        res.status(500).json({ message: "Ошибка на сервере" });
    }
});


// --- ЛОГИКА SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('user connected', (username) => {
        console.log(`Пользователь ${username} подключился с сокетом ${socket.id}`);
        onlineUsers.set(username, socket.id);
        socket.broadcast.emit('user status changed', { username, isOnline: true });
        onlineUsers.set(username, socket.id);
        // Вот эта строка "кричит" всем остальным:
        socket.broadcast.emit('user status changed', { username, isOnline: true }); 
    });

    socket.on('private message', async ({ to, message, from }) => {
        const messageData = { from, message, timestamp: Date.now() };
        const roomName = [from, to].sort().join('-');
        
        await kv.lpush(`messages:${roomName}`, messageData);
        await kv.incr(`unread:${to}:${from}`);

        const toSocketId = onlineUsers.get(to);
        if (toSocketId) {
            io.to(toSocketId).emit('private message', messageData);
        }
    });
    

    socket.on('disconnect', () => {
        for (let [username, id] of onlineUsers.entries()) {
        if (id === socket.id) {
            onlineUsers.delete(username);
            io.emit('user status changed', { username, isOnline: false }); // Уведомляем всех, что пользователь оффлайн
            break;
        }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});