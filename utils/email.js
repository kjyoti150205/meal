const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendPasswordResetOTP(email, otp) {
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Meal Tracker Admin Password Reset OTP',
        text: `Your OTP is: ${otp}\n\nValid for 10 minutes.`
    });
}

async function sendApprovalEmail(email, fullName) {
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Meal Tracker Account Approved',
        text: `Hello ${fullName || 'User'},\n\nYour Meal Tracker account has been approved.`
    });
}

async function sendRejectionEmail(email, fullName) {
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Meal Tracker Account Rejected',
        text: `Hello ${fullName || 'User'},\n\nYour Meal Tracker account has been rejected.`
    });
}

module.exports = {
    transporter,
    sendPasswordResetOTP,
    sendApprovalEmail,
    sendRejectionEmail
};
