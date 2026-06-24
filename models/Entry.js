const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
    userId: String,
    session: String,
    status: String,
    name: String,
    department: String,
    roomNumber: String,
    instituteId: String,
    timestamp: String,
    date: String,
    time: String
});

module.exports = mongoose.model('Entry', entrySchema);