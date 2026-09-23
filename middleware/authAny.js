const jwt = require('jsonwebtoken');
const Manager = require('../models/Manager');
const Admin = require('../models/Admin');
const User = require('../models/User');

async function authAny(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied. Token required.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        let role = decoded.role;
        if (!role && decoded.id) {
            const manager = await Manager.findById(decoded.id);
            if (manager) {
                role = 'manager';
            } else {
                const admin = await Admin.findById(decoded.id);
                if (admin) {
                    role = 'admin';
                } else {
                    role = 'student';
                }
            }
        }

        if (!['student', 'manager', 'admin'].includes(role)) {
            return res.status(403).json({ message: 'Invalid role.' });
        }

        req.user = { ...decoded, role };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Session expired. Please login again.' });
        }
        return res.status(401).json({ message: 'Invalid token.' });
    }
}

module.exports = authAny;
