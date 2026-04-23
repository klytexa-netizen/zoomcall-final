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

// Helper functions
function getUsers() { return JSON.parse(fs.readFileSync(USERS_FILE)); }
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function logAction(user, action, details) {
    const actions = JSON.parse(fs.readFileSync(ACTIONS_FILE));
    actions.push({ user, action, details, timestamp: new Date().toISOString() });
    fs.writeFileSync(ACTIONS_FILE, JSON.stringify(actions, null, 2));
}

function logCall(callData) {
    const calls = JSON.parse(fs.readFileSync(CALLS_FILE));
    calls.push(callData);
    fs.writeFileSync(CALLS_FILE, JSON.stringify(calls, null, 2));
}

// ========== EMAIL VALIDATION FUNCTION ==========
function isValidEmail(email) {
    // Email regex pattern for real email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(email)) return false;
    
    // Block common disposable email domains
    const disposableDomains = [
        'tempmail.com', '10minutemail.com', 'throwaway.com', 'guerrillamail.com',
        'mailinator.com', 'yopmail.com', 'fakeinbox.com', 'getairmail.com',
        'temp-mail.org', 'sharklasers.com', 'grr.la', 'guerrillamail.biz',
        'mailcatch.com', 'spambox.us', 'mailnator.com', 'tempinbox.com'
    ];
    
    const domain = email.split('@')[1];
    if (disposableDomains.includes(domain)) return false;
    
    // Block common fake domains
    const fakeDomains = ['test.com', 'example.com', 'fake.com', 'demo.com', 'testmail.com', 'test.org'];
    if (fakeDomains.includes(domain)) return false;
    
    return true;
}

// ========== PASSWORD VALIDATION ==========
function isValidPassword(password) {
    // Password must be at least 6 characters
    if (password.length < 6) return false;
    
    // Should contain at least one number
    if (!/[0-9]/.test(password)) return false;
    
    // Should contain at least one letter
    if (!/[a-zA-Z]/.test(password)) return false;
    
    return true;
}

// ========== API ENDPOINTS ==========
// Register
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    const users = getUsers();
    
    // Validate email
    if (!email || !isValidEmail(email)) {
        return res.json({ 
            status: 'error', 
            message: 'Please enter a valid email address (e.g., name@domain.com). Fake/temporary emails are not allowed.' 
        });
    }
    
    // Validate password
    if (!password || !isValidPassword(password)) {
        return res.json({ 
            status: 'error', 
            message: 'Password must be at least 6 characters and contain both letters and numbers.' 
        });
    }
    
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
        loginCount: 0,
        emailVerified: false
    });
    saveUsers(users);
    logAction({ email, name }, 'REGISTER', { success: true });
    res.json({ status: 'success', message: 'Registration successful! Please login.' });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const users = getUsers();
    
    // Validate email format
    if (!email || !isValidEmail(email)) {
        logAction({ email }, 'LOGIN_FAILED', { reason: 'invalid_email_format' });
        return res.json({ 
            status: 'error', 
            message: 'Please enter a valid email address.' 
        });
    }
    
    // Validate password is not empty
    if (!password) {
        logAction({ email }, 'LOGIN_FAILED', { reason: 'empty_password' });
        return res.json({ status: 'error', message: 'Please enter your password.' });
    }
    
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        user.loginCount = (user.loginCount || 0) + 1;
        user.lastLogin = new Date().toISOString();
        saveUsers(users);
        logAction({ email, name: user.name }, 'LOGIN', { success: true });
        res.json({ 
            status: 'success', 
            message: 'Login successful', 
            user: { email: user.email, name: user.name, loginCount: user.loginCount }
        });
    } else {
        logAction({ email }, 'LOGIN_FAILED', { reason: 'invalid_credentials' });
        res.json({ status: 'error', message: 'Invalid email or password.' });
    }
});

// Log user actions from frontend
app.post('/api/log-action', (req, res) => {
    const { user, action, details } = req.body;
    logAction(user, action, details);
    res.json({ status: 'success' });
});

// Get all users (admin)
app.get('/api/users', (req, res) => {
    const users = getUsers();
    // Remove passwords for security when sending to client
    const safeUsers = users.map(({ password, ...user }) => user);
    res.json({ success: true, count: safeUsers.length, users: safeUsers });
});

// Get all actions (admin)
app.get('/api/actions', (req, res) => {
    const actions = JSON.parse(fs.readFileSync(ACTIONS_FILE));
    res.json({ success: true, count: actions.length, actions });
});

// Get all calls (admin)
app.get('/api/calls', (req, res) => {
    const calls = JSON.parse(fs.readFileSync(CALLS_FILE));
    res.json({ success: true, count: calls.length, calls });
});

// ========== SOCKET.IO FOR VIDEO CALL ==========
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
    console.log(`📁 Data files: ${USERS_FILE}, ${ACTIONS_FILE}, ${CALLS_FILE}`);
    console.log(`🔐 Email validation enabled - Only real emails allowed`);
});