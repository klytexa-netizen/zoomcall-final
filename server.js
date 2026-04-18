const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));
app.use(express.json());

// Simple login
app.post('/login', (req, res) => {
    const { email, name } = req.body;
    res.json({ success: true, name: name || email.split('@')[0] });
});

// Online users
let onlineUsers = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join', (user) => {
        onlineUsers.push({ id: socket.id, name: user.name, email: user.email });
        io.emit('users', onlineUsers);
    });
    
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', { offer: data.offer, from: socket.id, fromName: data.fromName });
    });
    
    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', { answer: data.answer, from: socket.id });
    });
    
    socket.on('ice', (data) => {
        socket.to(data.target).emit('ice', { candidate: data.candidate, from: socket.id });
    });
    
    socket.on('disconnect', () => {
        onlineUsers = onlineUsers.filter(u => u.id !== socket.id);
        io.emit('users', onlineUsers);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});