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

app.get('/api/users', (req, res) => {
    const users = getUsers();
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ success: true, users: safeUsers });
});

// ========== WEBRTC SIGNALING ==========
let onlineUsers = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('user-join', (userData) => {
        onlineUsers.push({ socketId: socket.id, name: userData.name, email: userData.email });
        io.emit('update-users', onlineUsers);
    });
    
    socket.on('call-user', (data) => {
        io.to(data.to).emit('incoming-call', {
            from: socket.id,
            fromName: data.fromName,
            offer: data.offer
        });
    });
    
    socket.on('answer-call', (data) => {
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
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));