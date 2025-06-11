const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const port = 3000;

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files from current directory

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'photo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// Serve static files from uploads directory
app.use('/uploads', express.static(UPLOADS_DIR));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MANAGERS_FILE = path.join(DATA_DIR, 'managers.json');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize data files if they don't exist
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]');
}
if (!fs.existsSync(MANAGERS_FILE)) {
    fs.writeFileSync(MANAGERS_FILE, '[]');
}
if (!fs.existsSync(ENTRIES_FILE)) {
    fs.writeFileSync(ENTRIES_FILE, '[]');
}

// Helper functions for data persistence
function readData(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return [];
    }
}

function writeData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error);
        throw error;
    }
}

// Helper function to generate IDs
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { fullName, email, password, instituteId } = req.body;
        const users = readData(USERS_FILE);

        // Validate institute ID
        if (!instituteId || !/^\d{6}$/.test(instituteId)) {
            return res.status(400).json({ message: 'Institute ID must be exactly 6 digits' });
        }

        // Check if user already exists
        if (users.find(user => user.email === email)) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Check if institute ID is already registered
        if (users.find(user => user.instituteId === instituteId)) {
            return res.status(400).json({ message: 'Institute ID already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = {
            _id: generateId(),
            fullName,
            email,
            password: hashedPassword,
            instituteId,
            department: '',
            roomNumber: ''
        };

        users.push(newUser);
        writeData(USERS_FILE, users);

        // Return user without password
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({ message: 'User registered successfully', user: userWithoutPassword });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Error registering user' });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login attempt for email:', email); // Debug log

        const users = readData(USERS_FILE);
        console.log('Available users:', users.map(u => ({ email: u.email, id: u._id }))); // Debug log

        // Find user
        const user = users.find(u => u.email === email);
        if (!user) {
            console.log('User not found with email:', email); // Debug log
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            console.log('Invalid password for user:', email); // Debug log
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Return user without password
        const { password: _, ...userWithoutPassword } = user;
        console.log('Login successful for user:', userWithoutPassword); // Debug log
        res.json({ 
            message: 'Login successful', 
            user: userWithoutPassword 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// Update user profile with photo
app.post('/api/users/:userId/profile', upload.single('photo'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { fullName, instituteId, department, roomNumber } = req.body;
        
        // Validate required fields
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u._id === userId);
        
        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Validate institute ID if provided
        if (instituteId && !/^\d{6}$/.test(instituteId)) {
            return res.status(400).json({ message: 'Institute ID must be exactly 6 digits' });
        }

        // Update user data
        const updatedUser = {
            ...users[userIndex],
            fullName: fullName || users[userIndex].fullName,
            instituteId: instituteId || users[userIndex].instituteId,
            department: department || users[userIndex].department,
            roomNumber: roomNumber || users[userIndex].roomNumber
        };

        // If photo was uploaded, update photoUrl
        if (req.file) {
            const photoUrl = `/uploads/${req.file.filename}`;
            updatedUser.photoUrl = photoUrl;
        }

        users[userIndex] = updatedUser;
        writeData(USERS_FILE, users);

        // Return updated user without password
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json({ message: 'Profile updated successfully', user: userWithoutPassword });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Error updating profile: ' + error.message });
    }
});

// Manager registration
app.post('/api/managers/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        const managers = readData(MANAGERS_FILE);

        // Check if manager already exists
        if (managers.find(manager => manager.email === email)) {
            return res.status(400).json({ message: 'Manager already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new manager
        const newManager = {
            _id: generateId(),
            fullName,
            email,
            password: hashedPassword
        };

        managers.push(newManager);
        writeData(MANAGERS_FILE, managers);

        // Return manager without password
        const { password: _, ...managerWithoutPassword } = newManager;
        res.status(201).json({ message: 'Manager registered successfully', manager: managerWithoutPassword });
    } catch (error) {
        console.error('Manager registration error:', error);
        res.status(500).json({ message: 'Error registering manager' });
    }
});

// Manager login
app.post('/api/manager/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Manager login attempt for email:', email);

        const managers = readData(MANAGERS_FILE);
        console.log('Available managers:', managers.map(m => ({ email: m.email, id: m._id })));

        // Find manager
        const manager = managers.find(m => m.email === email);
        if (!manager) {
            console.log('Manager not found with email:', email);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, manager.password);
        if (!validPassword) {
            console.log('Invalid password for manager:', email);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Return manager without password
        const { password: _, ...managerWithoutPassword } = manager;
        console.log('Manager login successful:', managerWithoutPassword);
        res.json({ 
            message: 'Login successful', 
            manager: managerWithoutPassword 
        });
    } catch (error) {
        console.error('Manager login error:', error);
        res.status(500).json({ message: 'Error during login' });
    }
});

// Get all users
app.get('/api/users', (req, res) => {
    try {
        const users = readData(USERS_FILE);
        res.json(users);
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ message: 'Error getting users' });
    }
});

// Get all entries
app.get('/api/entries', (req, res) => {
    try {
        const entries = readData(ENTRIES_FILE);
        res.json(entries);
    } catch (error) {
        console.error('Error getting entries:', error);
        res.status(500).json({ message: 'Error getting entries' });
    }
});

// Get entries for a specific user
app.get('/api/entries/user/:userId', (req, res) => {
    const entries = readData(ENTRIES_FILE);
    const userEntries = entries.filter(entry => entry.userId === req.params.userId);
    res.json(userEntries);
});

// Get user verification status
app.get('/api/users/verification/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.find(u => u._id === userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            verificationStatus: user.verificationStatus || 'pending',
            verificationTimestamp: user.verificationTimestamp
        });
    } catch (error) {
        console.error('Error getting verification status:', error);
        res.status(500).json({ message: 'Failed to get verification status' });
    }
});

// Update verification status (admin only)
app.post('/api/users/verify/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const { status, adminId } = req.body;

        if (!['verified', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid verification status' });
        }

        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const userIndex = users.findIndex(u => u._id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        users[userIndex].verificationStatus = status;
        users[userIndex].verifiedBy = adminId;
        users[userIndex].verificationTimestamp = new Date().toISOString();

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ message: 'Verification status updated successfully' });
    } catch (error) {
        console.error('Error updating verification status:', error);
        res.status(500).json({ message: 'Failed to update verification status' });
    }
});

// Create entry
app.post('/api/entries', (req, res) => {
    try {
        const { userId, session, status, name, department, roomNumber } = req.body;
        console.log('Received entry request:', req.body);

        // Validate required fields
        if (!userId || !session || !status) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const entries = readData(ENTRIES_FILE);
        const users = readData(USERS_FILE);
        const user = users.find(u => u._id === userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if entry already exists for this session today
        const today = new Date().toISOString().split('T')[0];
        const existingEntry = entries.find(entry => 
            entry.userId === userId && 
            entry.session === session && 
            entry.timestamp.startsWith(today)
        );

        if (existingEntry) {
            return res.status(400).json({ message: 'Entry already exists for this session today' });
        }

        // Create new entry with additional information
        const newEntry = {
            _id: generateId(),
            userId,
            session,
            status,
            name: name || user.fullName,
            department: department || user.department,
            roomNumber: roomNumber || user.roomNumber,
            instituteId: user.instituteId,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleDateString(),
            time: new Date().toLocaleTimeString()
        };

        entries.push(newEntry);
        writeData(ENTRIES_FILE, entries);
        console.log('Entry created successfully:', newEntry);

        res.status(201).json({ message: 'Entry created successfully', entry: newEntry });
    } catch (error) {
        console.error('Error creating entry:', error);
        res.status(500).json({ message: 'Error creating entry: ' + error.message });
    }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        const users = readData(USERS_FILE);
        const managers = readData(MANAGERS_FILE);

        // Check in users
        const userIndex = users.findIndex(user => user.email === email);
        if (userIndex !== -1) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            users[userIndex].password = hashedPassword;
            writeData(USERS_FILE, users);
            return res.json({ message: 'Password reset successful' });
        }

        // Check in managers
        const managerIndex = managers.findIndex(manager => manager.email === email);
        if (managerIndex !== -1) {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            managers[managerIndex].password = hashedPassword;
            writeData(MANAGERS_FILE, managers);
            return res.json({ message: 'Password reset successful' });
        }

        res.status(404).json({ message: 'User not found' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Error resetting password' });
    }
});

// Upload profile photo
app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const photoUrl = `/uploads/${req.file.filename}`;
        res.json({ photoUrl });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ message: 'Error uploading photo' });
    }
});

// Remove profile photo
app.delete('/api/users/:userId/photo', (req, res) => {
    try {
        const { userId } = req.params;
        const users = readData(USERS_FILE);
        
        const userIndex = users.findIndex(u => u._id === userId);
        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Remove old photo if exists
        if (users[userIndex].photoUrl) {
            const oldPhotoPath = path.join(__dirname, users[userIndex].photoUrl);
            if (fs.existsSync(oldPhotoPath)) {
                fs.unlinkSync(oldPhotoPath);
            }
        }

        // Update user data
        users[userIndex] = {
            ...users[userIndex],
            photoUrl: null
        };

        writeData(USERS_FILE, users);

        // Return updated user without password
        const { password: _, ...userWithoutPassword } = users[userIndex];
        res.json({ 
            message: 'Profile photo removed successfully', 
            user: userWithoutPassword 
        });
    } catch (error) {
        console.error('Photo removal error:', error);
        res.status(500).json({ message: 'Error removing profile photo' });
    }
});

// Delete entry
app.delete('/api/entries/:entryId', (req, res) => {
    try {
        const entries = readData(ENTRIES_FILE);
        const entryIndex = entries.findIndex(entry => entry._id === req.params.entryId);

        if (entryIndex === -1) {
            return res.status(404).json({ message: 'Entry not found' });
        }

        entries.splice(entryIndex, 1);
        writeData(ENTRIES_FILE, entries);
        res.json({ message: 'Entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting entry:', error);
        res.status(500).json({ message: 'Error deleting entry' });
    }
});

// Add a route to handle the dashboard redirect
app.get('/dashboard.html', (req, res) => {
    res.redirect('/user_dashboard.html');
});

// Index route
app.get('/', (req, res) => {
    res.render('index', {
        welcomeMessage: 'Manage your meals efficiently with our easy-to-use meal tracking system.',
        studentDescription: 'Track your meals and manage your meal preferences as a student.',
        managerDescription: 'Manage meal entries and view reports as a manager.'
    });
});

// Session history endpoints
app.post('/api/users/:userId/sessions', async (req, res) => {
    try {
        const { userId } = req.params;
        const { sessionType, status, date } = req.body;

        const sessions = readData(path.join(DATA_DIR, 'sessions.json')) || [];
        
        // Check if user already has a session for this type and date
        const existingSession = sessions.find(s => 
            s.userId === userId && 
            s.sessionType === sessionType && 
            new Date(s.date).toDateString() === new Date(date).toDateString()
        );

        if (existingSession) {
            return res.status(400).json({ message: 'Session already exists for this time period' });
        }

        // Create new session record
        const newSession = {
            _id: generateId(),
            userId,
            sessionType,
            status,
            date,
            createdAt: new Date().toISOString()
        };

        sessions.push(newSession);
        writeData(path.join(DATA_DIR, 'sessions.json'), sessions);

        res.status(201).json(newSession);
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ message: 'Error creating session' });
    }
});

app.get('/api/users/:userId/sessions', async (req, res) => {
    try {
        const { userId } = req.params;
        const sessions = readData(path.join(DATA_DIR, 'sessions.json')) || [];
        
        // Filter sessions for the specific user
        const userSessions = sessions.filter(session => session.userId === userId);
        
        res.json(userSessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
        res.status(500).json({ message: 'Error fetching sessions' });
    }
});

// Update user profile
app.put('/api/users/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body;
        console.log('Received profile update request:', { userId, updates });

        // Validate required fields
        if (!updates.fullName || !updates.department || !updates.roomNumber) {
            return res.status(400).json({ 
                message: 'Missing required fields: fullName, department, and roomNumber are required' 
            });
        }

        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u._id === userId);

        if (userIndex === -1) {
            console.log('User not found:', userId);
            return res.status(404).json({ message: 'User not found' });
        }

        // Preserve existing data that shouldn't be overwritten
        const existingUser = users[userIndex];
        const updatedUser = {
            ...existingUser,
            fullName: updates.fullName,
            department: updates.department,
            roomNumber: updates.roomNumber,
            instituteId: updates.instituteId || existingUser.instituteId,
            lastUpdated: new Date().toISOString()
        };

        // Update user data
        users[userIndex] = updatedUser;

        // Save to file
        try {
            writeData(USERS_FILE, users);
            console.log('User profile updated successfully:', updatedUser);
        } catch (writeError) {
            console.error('Error writing to users file:', writeError);
            return res.status(500).json({ message: 'Error saving profile update' });
        }

        // Return updated user without password
        const { password, ...userWithoutPassword } = updatedUser;
        res.json({ 
            message: 'Profile updated successfully', 
            user: userWithoutPassword 
        });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ 
            message: 'Error updating profile',
            error: error.message 
        });
    }
});

// Upload user photo
app.post('/api/users/upload-photo', upload.single('photo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const users = readData(USERS_FILE);
        const userIndex = users.findIndex(u => u._id === userId);

        if (userIndex === -1) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user's photo URL
        const photoUrl = '/uploads/' + req.file.filename;
        users[userIndex].photoUrl = photoUrl;
        users[userIndex].lastUpdated = new Date().toISOString();

        writeData(USERS_FILE, users);
        console.log('User photo updated successfully:', users[userIndex]);

        res.json({ 
            message: 'Photo uploaded successfully', 
            photoUrl: photoUrl 
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ message: 'Error uploading photo' });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Data directory:', DATA_DIR);
    console.log('Users file:', USERS_FILE);
    console.log('Entries file:', ENTRIES_FILE);
}); 