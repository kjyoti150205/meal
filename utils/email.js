const nodemailer = require("nodemailer");

console.log("EMAIL USER INSIDE EMAIL.JS =", process.env.EMAIL_USER);
console.log("EMAIL PASS INSIDE EMAIL.JS =", process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.verify((err, success) => {
    if (err) {
        console.log("❌ SMTP Verify Error:", err);
    } else {
        console.log("✅ SMTP Server Ready");
    }
});

async function sendPasswordResetOTP(email, otp) {
    return transporter.sendMail({
        from: `"Meal Tracker" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Meal Tracker Admin Password Reset OTP",
        text: `Your OTP is ${otp}\n\nValid for 10 minutes.`
    });
}

async function sendApprovalEmail(user) {
    await transporter.sendMail({
        from: `"Meal Tracker Team" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "🎉 Meal Tracker Account Approved",
        html: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden">

            <div style="background:#4f46e5;color:white;padding:20px;text-align:center">
                <h2>🍽️ Meal Tracker</h2>
                <p>Account Verification Successful</p>
            </div>

            <div style="padding:25px">

                <h3>Hello ${user.fullName}, 👋</h3>

                <p>
                    Congratulations! Your Meal Tracker account has been
                    <b style="color:green;">approved successfully</b>.
                </p>

                <p>You can now login and access all Meal Tracker services.</p>

                <table style="width:100%;border-collapse:collapse;margin-top:20px">

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Full Name</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.fullName}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Email</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.email}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Institute ID</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.instituteId}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Department</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.department || "-"}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Room Number</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.roomNumber || "-"}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Batch</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.batch}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Registration Date</b></td>
                        <td style="padding:10px;border:1px solid #ddd">
                            ${new Date(user.createdAt).toLocaleString()}
                        </td>
                    </tr>

                </table>

                <br>

                <div style="background:#eef7ff;padding:15px;border-left:4px solid #2196f3;border-radius:5px">

                    <b>Login Information</b><br><br>

                    Email : ${user.email}<br>
                    Password : <i>The password you created during registration.</i><br>

                </div>

                <br>

                <div style="background:#e8f5e9;padding:15px;border-radius:5px">
                    ✅ Your account is now active.<br>
                    You can login and start marking your meals.
                </div>

                <br>

                <p>
                    If you did not create this account, please contact the Hostel Administrator immediately.
                </p>

                <br>

                <p>
                    Regards,<br>
                    <b>Meal Tracker Administration Team</b>
                </p>

            </div>

            <div style="background:#f5f5f5;padding:15px;text-align:center;font-size:12px;color:#777">
                © 2026 Meal Tracker System
            </div>

        </div>
        `
    });
}

async function sendRejectionEmail(user) {
    return transporter.sendMail({
        from: `"Meal Tracker Team" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "❌ Meal Tracker Account Verification Update",
        html: `
        <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border:1px solid #ddd;border-radius:10px;overflow:hidden">

            <div style="background:#dc3545;color:white;padding:20px;text-align:center">
                <h2>🍽️ Meal Tracker</h2>
                <p>Account Verification Status</p>
            </div>

            <div style="padding:25px">

                <h3>Hello ${user.fullName}, 👋</h3>

                <p>
                    We regret to inform you that your <b>Meal Tracker</b>
                    account verification request has been
                    <span style="color:red;font-weight:bold;">rejected</span>.
                </p>

                <table style="width:100%;border-collapse:collapse;margin-top:20px">

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Full Name</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.fullName}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Email</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.email}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Institute ID</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.instituteId}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Department</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.department || "-"}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Room Number</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.roomNumber || "-"}</td>
                    </tr>

                    <tr>
                        <td style="padding:10px;border:1px solid #ddd"><b>Batch</b></td>
                        <td style="padding:10px;border:1px solid #ddd">${user.batch || "-"}</td>
                    </tr>

                </table>

                <br>

                <div style="background:#fff3cd;padding:15px;border-left:5px solid #ffc107;border-radius:5px">
                    <b>Possible Reasons for Rejection</b>
                    <ul>
                        <li>Incorrect Institute ID</li>
                        <li>Incomplete profile information</li>
                        <li>Verification details could not be confirmed</li>
                    </ul>
                </div>

                <br>

                <div style="background:#f8d7da;padding:15px;border-radius:5px">
                    <b>What should you do?</b>
                    <ul>
                        <li>Verify that all your registration details are correct.</li>
                        <li>Contact the Hostel Administrator if you believe this decision was made in error.</li>
                        <li>You may register again using the correct information if permitted.</li>
                    </ul>
                </div>

                <br>

                <p>
                    If you have any questions, please contact the Hostel Administration.
                </p>

                <br>

                <p>
                    Regards,<br>
                    <b>Meal Tracker Administration Team</b>
                </p>

            </div>

            <div style="background:#f5f5f5;padding:15px;text-align:center;font-size:12px;color:#777">
                © 2026 Meal Tracker System
            </div>

        </div>
        `
    });
}

module.exports = {
    transporter,
    sendPasswordResetOTP,
    sendApprovalEmail,
    sendRejectionEmail
};