/**
 * One-time script to create an admin account.
 * Usage: node scripts/create-admin.js "Admin Name" admin@example.com yourpassword
 */
require('dotenv').config({ path: './config.env' });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

async function createAdmin() {
    const [, , name, email, password] = process.argv;

    if (!name || !email || !password) {
        console.error('Usage: node scripts/create-admin.js "Admin Name" admin@example.com yourpassword');
        process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    const adminCount = await Admin.countDocuments();
    if (adminCount >= 1) {
        console.error('Only one admin account is allowed. An admin already exists.');
        process.exit(1);
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
        console.error('Admin with this email already exists.');
        process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await Admin.create({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'admin'
    });

    console.log(`Admin "${name}" created successfully.`);
    await mongoose.disconnect();
}

createAdmin().catch((error) => {
    console.error(error);
    process.exit(1);
});
