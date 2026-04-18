const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));
app.use(express.json());

// Store online users
let onlineUsers = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('user-join', (userData) => {
        onlineUsers.push({
            socketId: socket.id,
            name: userData.name,
            email: userData.email
        });
        io.emit('update-users', onlineUsers);
        console.log('User joined:', userData.name);
    });
    
    socket.on('call-user', (data) => {
        console.log('Call from', socket.id, 'to', data.to);
        io.to(data.to).emit('incoming-call', {
            from: socket.id,
            fromName: data.fromName,
            offer: data.offer
        });
    });
    
    socket.on('answer-call', (data) => {
        console.log('Answer from', socket.id, 'to', data.to);
        io.to(data.to).emit('call-answered', {
            answer: data.answer,
            from: socket.id
        });
    });
    
    socket.on('ice-candidate', (data) => {
        io.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    });
    
    socket.on('end-call', (data) => {
        io.to(data.to).emit('call-ended');
    });
    
    socket.on('disconnect', () => {
        onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
        io.emit('update-users', onlineUsers);
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});