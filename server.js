const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));
app.use(express.json());

// Simple login - store users
const users = new Map();

app.post('/login', (req, res) => {
    const { email, password, name } = req.body;
    const userId = email;
    users.set(userId, { email, name: name || email.split('@')[0] });
    res.json({ success: true, name: users.get(userId).name });
});

// Get all users
app.get('/users', (req, res) => {
    res.json(Array.from(users.values()));
});

// Store online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join', (userData) => {
        onlineUsers.set(socket.id, { id: socket.id, name: userData.name, email: userData.email });
        io.emit('online-users', Array.from(onlineUsers.values()));
    });
    
    socket.on('offer', (data) => {
        socket.to(data.targetId).emit('offer', {
            offer: data.offer,
            fromId: socket.id,
            fromName: data.fromName
        });
    });
    
    socket.on('answer', (data) => {
        socket.to(data.targetId).emit('answer', {
            answer: data.answer,
            fromId: socket.id
        });
    });
    
    socket.on('ice-candidate', (data) => {
        socket.to(data.targetId).emit('ice-candidate', {
            candidate: data.candidate,
            fromId: socket.id
        });
    });
    
    socket.on('hangup', (data) => {
        socket.to(data.targetId).emit('hangup');
    });
    
    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('online-users', Array.from(onlineUsers.values()));
    });
});

server.listen(3000, () => {
    console.log('✅ Server running at http://localhost:3000');
});