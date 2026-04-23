const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

// ========== DATA STORAGE ==========
const USERS_FILE = 'users.json';
const ACTIONS_FILE = 'actions.json';
const CALLS_FILE = 'calls.json';

// Initialize files
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

// ========== STRONG EMAIL VALIDATION ==========
function isValidEmail(email) {
    // Basic email format check
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) return false;
    
    // Extract domain
    const domain = email.split('@')[1].toLowerCase();
    
    // Block fake/disposable email domains
    const blockedDomains = [
        // Fake/temporary domains
        'tempmail.com', '10minutemail.com', 'throwaway.com', 'guerrillamail.com',
        'mailinator.com', 'yopmail.com', 'fakeinbox.com', 'getairmail.com',
        'temp-mail.org', 'sharklasers.com', 'grr.la', 'guerrillamail.biz',
        'mailcatch.com', 'spambox.us', 'mailnator.com', 'tempinbox.com',
        'fakeemail.com', 'trashmail.com', 'dispostable.com', 'maildrop.cc',
        'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
        'spamgourmet.com', 'spamobox.com', 'spambog.com', 'spamcannon.net',
        'spamserver.com', 'spamthis.co.uk', 'spamthisplease.com',
        'tempemail.net', 'tempmail.net', 'tempinbox.co.uk',
        // Test/fake common domains
        'test.com', 'example.com', 'fake.com', 'demo.com', 
        'testmail.com', 'test.org', 'sample.com', 'domain.com',
        'localhost.com', 'invalid.com', 'notreal.com', 'fakemail.com'
    ];
    
    if (blockedDomains.includes(domain)) return false;
    
    // Block common typos or suspicious patterns
    if (email.includes('+')) return false; // Gmail + aliases often used for spam
    if (email.startsWith('test') && domain.includes('test')) return false;
    if (email.startsWith('fake') || email.startsWith('temp')) return false;
    
    return true;
}

// ========== STRONG PASSWORD VALIDATION ==========
function isValidPassword(password) {
    // Minimum length 6
    if (password.length < 6) return false;
    
    // Must contain at least one number
    if (!/[0-9]/.test(password)) return false;
    
    // Must contain at least one letter
    if (!/[a-zA-Z]/.test(password)) return false;
    
    // Block common weak passwords
    const weakPasswords = [
        'password', 'password123', '123456', '12345678', '123456789',
        'qwerty', 'abc123', '111111', 'admin123', 'welcome123'
    ];
    if (weakPasswords.includes(password.toLowerCase())) return false;
    
    return true;
}

// ========== API ENDPOINTS ==========
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    const users = getUsers();
    
    console.log('📝 Registration attempt:', email);
    
    // Validate email - NOW ON BACKEND!
    if (!email || !isValidEmail(email)) {
        console.log('❌ Invalid email rejected:', email);
        return res.json({ 
            status: 'error', 
            message: 'Invalid email. Please use a real email address (e.g., gmail.com, yahoo.com, outlook.com). Fake/temporary emails are not allowed.' 
        });
    }
    
    // Validate password - NOW ON BACKEND!
    if (!password || !isValidPassword(password)) {
        console.log('❌ Weak password rejected for:', email);
        return res.json({ 
            status: 'error', 
            message: 'Password must be at least 6 characters with both letters and numbers. Common passwords like "password123" are not allowed.' 
        });
    }
    
    // Check if user exists
    if (users.find(u => u.email === email)) {
        return res.json({ status: 'error', message: 'User already exists. Please login.' });
    }
    
    // Create user
    users.push({ 
        email, 
        password, 
        name: name || email.split('@')[0], 
        registeredAt: new Date().toISOString(),
        loginCount: 0
    });
    saveUsers(users);
    logAction({ email }, 'REGISTER', { success: true });
    console.log('✅ User registered:', email);
    res.json({ status: 'success', message: 'Registration successful! Please login.' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const users = getUsers();
    
    console.log('🔐 Login attempt:', email);
    
    // Validate email format
    if (!email || !isValidEmail(email)) {
        logAction({ email }, 'LOGIN_FAILED', { reason: 'invalid_email_format' });
        return res.json({ 
            status: 'error', 
            message: 'Please enter a valid email address.' 
        });
    }
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLogin = new Date().toISOString();
        saveUsers(users);
        logAction({ email, name: user.name }, 'LOGIN', { success: true });
        console.log('✅ User logged in:', email);
        res.json({ 
            status: 'success', 
            message: 'Login successful', 
            user: { email: user.email, name: user.name, loginCount: user.loginCount }
        });
    } else {
        logAction({ email }, 'LOGIN_FAILED', { reason: 'invalid_credentials' });
        console.log('❌ Failed login:', email);
        res.json({ status: 'error', message: 'Invalid email or password.' });
    }
});

app.post('/api/log-action', (req, res) => {
    const { user, action, details } = req.body;
    logAction(user, action, details);
    res.json({ status: 'success' });
});

app.get('/api/users', (req, res) => {
    const users = getUsers();
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ success: true, count: safeUsers.length, users: safeUsers });
});

app.get('/api/actions', (req, res) => {
    const actions = JSON.parse(fs.readFileSync(ACTIONS_FILE));
    res.json({ success: true, count: actions.length, actions });
});

app.get('/api/calls', (req, res) => {
    const calls = JSON.parse(fs.readFileSync(CALLS_FILE));
    res.json({ success: true, count: calls.length, calls });
});

// ========== SOCKET.IO ==========
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
        logAction(userData, 'JOINED_CALL', { socketId: socket.id });
    });
    
    socket.on('call-user', (data) => {
        console.log('Call from', socket.id, 'to', data.to);
        logAction({ name: data.fromName }, 'CALL_INITIATED', { targetId: data.to });
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
        logAction({}, 'CALL_ENDED', { targetId: data.to });
        io.to(data.to).emit('call-ended');
    });
    
    socket.on('disconnect', () => {
        const user = onlineUsers.find(u => u.socketId === socket.id);
        if (user) {
            logAction(user, 'LEFT_CALL', {});
        }
        onlineUsers = onlineUsers.filter(u => u.socketId !== socket.id);
        io.emit('update-users', onlineUsers);
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Zoom Call Server running at http://localhost:${PORT}`);
    console.log(`🔐 Email validation: ONLY real emails allowed (no fake/temporary emails)`);
    console.log(`🔒 Password requirements: 6+ chars with letters AND numbers`);
});