const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

// ========== EMAIL AND PASSWORD VALIDATION ==========
const USERS_FILE = 'users.json';

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function getUsers() {
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function isValidEmail(email) {
    // Basic email format check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;
    
    // Block fake/temporary email domains
    const blockedDomains = [
        'tempmail.com', '10minutemail.com', 'mailinator.com', 'yopmail.com',
        'guerrillamail.com', 'fakeinbox.com', 'test.com', 'example.com',
        'demo.com', 'fake.com', 'temp-mail.org', 'sharklasers.com',
        'throwaway.com', 'getairmail.com', 'spambox.us', 'trashmail.com'
    ];
    
    const domain = email.split('@')[1].toLowerCase();
    if (blockedDomains.includes(domain)) return false;
    
    return true;
}

function isValidPassword(password) {
    // Minimum 6 characters
    if (password.length < 6) return false;
    
    // Must contain at least one number
    if (!/[0-9]/.test(password)) return false;
    
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(password)) return false;
    
    return true;
}

// ========== AUTHENTICATION ENDPOINTS ==========
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    
    // Validate email
    if (!email || !isValidEmail(email)) {
        return res.json({ 
            status: 'error', 
            message: 'Please use a valid email address. Fake/temporary emails like test.com, mailinator.com are not allowed.' 
        });
    }
    
    // Validate password
    if (!password || !isValidPassword(password)) {
        return res.json({ 
            status: 'error', 
            message: 'Password must be at least 6 characters and contain both letters and numbers.' 
        });
    }
    
    const users = getUsers();
    
    // Check if user already exists
    if (users.find(u => u.email === email)) {
        return res.json({ status: 'error', message: 'User already exists. Please login.' });
    }
    
    // Create new user
    users.push({ 
        email, 
        password, 
        name: name || email.split('@')[0], 
        registeredAt: new Date().toISOString(),
        loginCount: 0
    });
    saveUsers(users);
    
    console.log('✅ New user registered:', email);
    res.json({ status: 'success', message: 'Registration successful! Please login.' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Validate email format
    if (!email || !isValidEmail(email)) {
        return res.json({ 
            status: 'error', 
            message: 'Please enter a valid email address.' 
        });
    }
    
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLogin = new Date().toISOString();
        saveUsers(users);
        
        console.log('✅ User logged in:', email);
        res.json({ 
            status: 'success', 
            message: 'Login successful', 
            user: { email: user.email, name: user.name, loginCount: user.loginCount }
        });
    } else {
        console.log('❌ Failed login attempt:', email);
        res.json({ status: 'error', message: 'Invalid email or password.' });
    }
});

// Get all users (for admin)
app.get('/api/users', (req, res) => {
    const users = getUsers();
    // Remove passwords for security
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ success: true, count: safeUsers.length, users: safeUsers });
});

// ========== STORE ONLINE USERS ==========
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
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔐 Email validation enabled - Only real emails allowed`);
});