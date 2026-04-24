const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

// ========== DATA STORAGE FILES ==========
const USERS_FILE = 'users.json';
const ACTIONS_FILE = 'actions.json';
const CALLS_FILE = 'calls.json';

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
if (!fs.existsSync(ACTIONS_FILE)) fs.writeFileSync(ACTIONS_FILE, JSON.stringify([]));
if (!fs.existsSync(CALLS_FILE)) fs.writeFileSync(CALLS_FILE, JSON.stringify([]));

function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE)); }
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function logAction(user, action, details) {
    const actions = JSON.parse(fs.readFileSync(ACTIONS_FILE));
    actions.push({ user, action, details, timestamp: new Date().toISOString() });
    fs.writeFileSync(ACTIONS_FILE, JSON.stringify(actions, null, 2));
}

function logCall(callData) {
    const calls = JSON.parse(fs.readFileSync(CALLS_FILE));
    calls.push({ ...callData, timestamp: new Date().toISOString() });
    fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
}

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
        return res.json({ status: 'error', message: 'Password must be 6+ characters with letters and numbers.' });
    }
    const users = getUsers();
    if (users.find(u => u.email === email)) {
        return res.json({ status: 'error', message: 'User already exists.' });
    }
    users.push({ email, password, name: name || email.split('@')[0], registeredAt: new Date().toISOString(), loginCount: 0 });
    saveUsers(users);
    logAction({ email }, 'REGISTER', { success: true });
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
        user.loginCount++;
        user.lastLogin = new Date().toISOString();
        saveUsers(users);
        logAction({ email }, 'LOGIN', { success: true });
        res.json({ status: 'success', message: 'Login successful', user: { email: user.email, name: user.name, loginCount: user.loginCount } });
    } else {
        logAction({ email }, 'LOGIN_FAILED', { success: false });
        res.json({ status: 'error', message: 'Invalid email or password.' });
    }
});

app.get('/api/users', (req, res) => {
    const users = getUsers();
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ success: true, users: safeUsers });
});

app.get('/api/actions', (req, res) => {
    const actions = JSON.parse(fs.readFileSync(ACTIONS_FILE));
    res.json({ success: true, actions });
});

// ========== WEBRTC SIGNALING ==========
let onlineUsers = [];
let hostId = null;

io.on('connection', (socket) => {
    console.log('✅ User connected:', socket.id);
    
    socket.on('user-join', (userData) => {
        const isHost = (hostId === null);
        if (isHost) hostId = socket.id;
        
        onlineUsers.push({ socketId: socket.id, name: userData.name, email: userData.email, isHost: isHost });
        console.log('👤 User joined:', userData.name, isHost ? '(HOST)' : '');
        io.emit('update-users', onlineUsers);
    });
    
    socket.on('offer', (data) => {
        console.log('📞 Offer from', socket.id, 'to', data.targetId);
        io.to(data.targetId).emit('offer', { sdp: data.sdp, fromId: socket.id, fromName: data.fromName });
    });
    
    socket.on('answer', (data) => {
        console.log('📞 Answer from', socket.id, 'to', data.targetId);
        io.to(data.targetId).emit('answer', { sdp: data.sdp, fromId: socket.id });
    });
    
    socket.on('ice-candidate', (data) => {
        io.to(data.targetId).emit('ice-candidate', { candidate: data.candidate, fromId: socket.id });
    });
    
    socket.on('end-call', (data) => {
        io.to(data.targetId).emit('end-call');
    });
    
    socket.on('disconnect', () => {
        if (hostId === socket.id) hostId = null;
        onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
        io.emit('update-users', onlineUsers);
        console.log('❌ User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Zoom Call Server running on http://localhost:${PORT}`);
});