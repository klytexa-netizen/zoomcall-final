const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

// ========== USER STORAGE ==========
const USERS_FILE = 'users.json';
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));

function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE)); }
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

// ========== VALIDATION ==========
function isValidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;
    const blockedDomains = ['tempmail.com', 'mailinator.com', 'yopmail.com', 'guerrillamail.com', 'test.com', 'example.com', 'fake.com'];
    const domain = email.split('@')[1];
    if (blockedDomains.includes(domain)) return false;
    return true;
}

function isValidPassword(password) {
    if (password.length < 6) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[a-zA-Z]/.test(password)) return false;
    return true;
}

// ========== AUTHENTICATION ==========
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !isValidEmail(email)) {
        return res.json({ status: 'error', message: 'Please use a valid email address.' });
    }
    if (!password || !isValidPassword(password)) {
        return res.json({ status: 'error', message: 'Password must be 6+ chars with letters and numbers.' });
    }
    const users = getUsers();
    if (users.find(u => u.email === email)) {
        return res.json({ status: 'error', message: 'User already exists.' });
    }
    users.push({ email, password, name: name || email.split('@')[0], registeredAt: new Date().toISOString() });
    saveUsers(users);
    res.json({ status: 'success', message: 'Registration successful!' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !isValidEmail(email)) {
        return res.json({ status: 'error', message: 'Valid email required.' });
    }
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        res.json({ status: 'success', message: 'Login successful', user: { email: user.email, name: user.name } });
    } else {
        res.json({ status: 'error', message: 'Invalid email or password.' });
    }
});

// Admin data endpoints
app.get('/api/users', (req, res) => {
    const users = getUsers();
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ success: true, users: safeUsers });
});

app.get('/api/actions', (req, res) => {
    const actionsFile = 'actions.json';
    if (fs.existsSync(actionsFile)) {
        const actions = JSON.parse(fs.readFileSync(actionsFile));
        res.json({ success: true, actions });
    } else {
        res.json({ success: true, actions: [] });
    }
});

// ========== WEBRTC SIGNALING ==========
let onlineUsers = [];
let hostId = null;

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    socket.on('user-join', (userData) => {
        // If no host exists, this user becomes the host
        const isHost = (hostId === null);
        if (isHost) {
            hostId = socket.id;
        }
        
        onlineUsers.push({ 
            socketId: socket.id, 
            name: userData.name, 
            email: userData.email, 
            isHost: isHost 
        });
        console.log('👤 User joined:', userData.name, isHost ? '(HOST)' : '');
        io.emit('update-users', onlineUsers);
    });
    
    socket.on('offer', (data) => {
        console.log('📞 Offer from', socket.id, 'to', data.targetId);
        io.to(data.targetId).emit('offer', {
            offer: data.offer,
            fromId: socket.id,
            fromName: data.fromName
        });
    });
    
    socket.on('answer', (data) => {
        console.log('📞 Answer from', socket.id, 'to', data.targetId);
        io.to(data.targetId).emit('answer', {
            answer: data.answer,
            fromId: socket.id
        });
    });
    
    socket.on('ice-candidate', (data) => {
        io.to(data.targetId).emit('ice-candidate', {
            candidate: data.candidate,
            fromId: socket.id
        });
    });
    
    socket.on('end-call', (data) => {
        console.log('📞 Call ended by', socket.id);
        io.to(data.targetId).emit('end-call');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ User disconnected:', socket.id);
        if (hostId === socket.id) {
            hostId = null;
            console.log('👑 Host left, new host will be assigned on next join');
        }
        onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
        io.emit('update-users', onlineUsers);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});