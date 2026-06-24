const mongoose = require('mongoose');

const managerSchema = new mongoose.Schema({
    fullName: String,
    email: String,
    password: String
});

module.exports = mongoose.model('Manager', managerSchema);