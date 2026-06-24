const User = require('./models/User');
const Manager = require('./models/Manager');
const Entry = require('./models/Entry');
const adminAuthRoutes = require('./routes/adminAuth');
const adminUsersRoutes = require('./routes/adminUsers');
const authAdmin = require('./middleware/authAdmin');
const { transporter } = require('./utils/email');
require('dotenv').config({ path: './config.env' });

const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const port = 3000;
console.log(process.env.MONGO_URI);
// MongoDB Connection
console.log(process.env.MONGO_URI);
mongoose.connection.once('open', () => {
    console.log('✅ MongoDB Connected Successfully');
});
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("✅ MongoDB Connected");
})
.catch((err) => {
    console.error("❌ MongoDB Error:", err);
});
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("✅ MongoDB Connected");
})
.catch((err) => {
    console.error("❌ MongoDB Error:", err);
});

mongoose.connection.on('error', err => {
    console.log("DB Error:", err);
});

mongoose.connection.once('open', () => {
    console.log("DB Opened Successfully");
});
// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', __dirname);

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));
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

        if (!instituteId || !/^\d{6}$/.test(instituteId)) {
            return res.status(400).json({
                message: 'Institute ID must be exactly 6 digits'
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: 'User already exists'
            });
        }

        const existingInstitute = await User.findOne({ instituteId });
        if (existingInstitute) {
            return res.status(400).json({
                message: 'Institute ID already registered'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
    fullName,
    email,
    password: hashedPassword,
    instituteId,
    verificationStatus: 'pending'
});

console.log("Before Save:", newUser);

console.log("After Save:", newUser);
        await newUser.save();

        const userWithoutPassword = {
            _id: newUser._id,
            fullName: newUser.fullName,
            email: newUser.email,
            instituteId: newUser.instituteId
        };

        res.status(201).json({
            message: 'User registered successfully',
            user: userWithoutPassword
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Registration failed'
        });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({
                message: 'Invalid credentials'
            });
        }

        if (user.verificationStatus === 'pending') {
            return res.status(403).json({
                message: 'Your account is waiting for admin verification'
            });
        }

        if (user.verificationStatus === 'rejected') {
            return res.status(403).json({
                message: 'Your account has been rejected'
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).json({
                message: 'Invalid credentials'
            });
        }

        const { password: _, ...userWithoutPassword } = user.toObject();

        res.json({
            message: 'Login successful',
            user: userWithoutPassword
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: 'Server error'
        });
    }
});
// Update user profile with photo
app.post('/api/users/:userId/profile', upload.single('photo'), async (req, res) => {
try {
const { userId } = req.params;
const { fullName, instituteId, department, roomNumber } = req.body;


    if (!userId) {
        return res.status(400).json({
            message: 'User ID is required'
        });
    }

    const user = await User.findById(userId);

    if (!user) {
        return res.status(404).json({
            message: 'User not found'
        });
    }

    if (instituteId && !/^\d{6}$/.test(instituteId)) {
        return res.status(400).json({
            message: 'Institute ID must be exactly 6 digits'
        });
    }

    user.fullName = fullName || user.fullName;
    user.instituteId = instituteId || user.instituteId;
    user.department = department || user.department;
    user.roomNumber = roomNumber || user.roomNumber;

    if (req.file) {
        user.photoUrl = `/uploads/${req.file.filename}`;
    }

    await user.save();

    const userObj = user.toObject();
    delete userObj.password;

    res.json({
        message: 'Profile updated successfully',
        user: userObj
    });

}catch (error) {
    console.error('FULL ERROR:', error);

    res.status(500).json({
        message: error.message,
        stack: error.stack
    });
}


});

//mangager registr
app.post('/api/managers/register', async (req, res) => {
try {
const { fullName, email, password } = req.body;


    const existingManager = await Manager.findOne({ email });

    if (existingManager) {
        return res.status(400).json({
            message: 'Manager already exists'
        });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newManager = new Manager({
        fullName,
        email,
        password: hashedPassword
    });

    await newManager.save();

    const managerObj = newManager.toObject();
    delete managerObj.password;

    res.status(201).json({
        message: 'Manager registered successfully',
        manager: managerObj
    });

} catch (error) {
console.error('Manager registration error:', error);


res.status(500).json({
    message: error.message,
    stack: error.stack
});

}


});
//manager login
app.post('/api/manager/login', async (req, res) => {
try {
const { email, password } = req.body;


    const manager = await Manager.findOne({ email });

    if (!manager) {
        return res.status(401).json({
            message: 'Invalid credentials'
        });
    }

    const validPassword = await bcrypt.compare(
        password,
        manager.password
    );

    if (!validPassword) {
        return res.status(401).json({
            message: 'Invalid credentials'
        });
    }

    const managerObj = manager.toObject();
    delete managerObj.password;

    res.json({
        message: 'Login successful',
        manager: managerObj
    });

} catch (error) {
    console.error('Manager login error:', error);
    res.status(500).json({
        message: 'Error during login'
    });
}

});

// Get all users
app.get('/api/users', async (req, res) => {
try {
const users = await User.find().select('-password');
res.json(users);
} catch (error) {
console.error(error);
res.status(500).json({
message: 'Error getting users'
});
}
});

app.get('/api/entries', async (req, res) => {
try {
const entries = await Entry.find();
res.json(entries);
} catch (error) {
console.error(error);
res.status(500).json({
message: 'Error getting entries'
});
}
});

app.get('/api/entries/user/:userId', async (req, res) => {
try {
const entries = await Entry.find({
userId: req.params.userId
});


    res.json(entries);
} catch (error) {
    console.error(error);
    res.status(500).json({
        message: 'Error getting user entries'
    });
}


});

app.get('/api/users/verification/:userId', async (req, res) => {
try {
const user = await User.findById(req.params.userId);


    if (!user) {
        return res.status(404).json({
            message: 'User not found'
        });
    }

    res.json({
        verificationStatus: user.verificationStatus || 'pending',
        verificationTimestamp: user.verificationTimestamp
    });

} catch (error) {
    console.error(error);
    res.status(500).json({
        message: 'Failed to get verification status'
    });
}


});


// Update verification status (admin only)
app.post('/api/users/verify/:userId', async (req, res) => {
try {
const { userId } = req.params;
const { status, adminId } = req.body;


    const manager = await Manager.findById(adminId);
    const user = await User.findById(userId);

    user.verificationStatus = status;
    user.verifiedBy = manager._id;
    user.verificationTimestamp = new Date();

    await user.save();

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Account Verification Update',
        html: `
            <h2>Hello ${user.fullName}</h2>
            <p>Your account status is: <b>${status}</b></p>
        `
    });

    res.json({
        message: 'Verification status updated successfully'
    });

} catch (error) {
    console.error(error);
    res.status(500).json({
        message: 'Failed to update verification status'
    });
}


});


// Create entry
app.post('/api/entries', (req, res) => {
    try {

        const {
            userId,
            session,
            status,
            name,
            department,
            roomNumber
        } = req.body;

        console.log("==============");
        console.log("Received Body:", req.body);
        console.log("Received userId:", userId);

        const entries = readData(ENTRIES_FILE);
        const users = readData(USERS_FILE);

        console.log("Users Count:", users.length);
        console.log("First User:", users[0]);

        const user = users.find(
            u => String(u._id) === String(userId)
        );

        console.log("Matched User:", user);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        const today = new Date()
            .toISOString()
            .split('T')[0];

        const existingEntry = entries.find(
            entry =>
                entry.userId === userId &&
                entry.session === session &&
                entry.timestamp.startsWith(today)
        );

        if (existingEntry) {
            return res.status(400).json({
                message:
                'Entry already exists for this session today'
            });
        }

        const newEntry = {
            _id: generateId(),
            userId,
            session,
            status,
            name: name || user.fullName,
            department:
                department || user.department,
            roomNumber:
                roomNumber || user.roomNumber,
            instituteId:
                user.instituteId,
            timestamp:
                new Date().toISOString(),
            date:
                new Date().toLocaleDateString(),
            time:
                new Date().toLocaleTimeString()
        };

        entries.push(newEntry);

        writeData(ENTRIES_FILE, entries);

        res.status(201).json({
            message:
            'Entry created successfully',
            entry: newEntry
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message:
            'Error creating entry'
        });

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
      const { password: _, ...userWithoutPassword } = user.toObject();

res.json({
    message: 'Login successful',
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