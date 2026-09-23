const jwt = require('jsonwebtoken');

function authStudent(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied. Token required.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!['student', 'manager', 'admin'].includes(decoded.role)) {
            return res.status(403).json({ message: 'Invalid role.' });
        }

        req.student = decoded;
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Session expired. Please login again.' });
        }
        return res.status(401).json({ message: 'Invalid token.' });
    }
}

module.exports = authStudent;
