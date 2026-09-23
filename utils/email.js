const nodemailer = require("nodemailer");

console.log("EMAIL USER INSIDE EMAIL.JS =", process.env.EMAIL_USER);
console.log("EMAIL PASS INSIDE EMAIL.JS =", process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Universal dispatcher:
// 1. Brevo API (over HTTPS port 443, delivers to ANY student email!)
// 2. Resend API (over HTTPS port 443)
// 3. Nodemailer fallback (with 5s timeout)
async function sendMailDispatcher({ to, subject, html, text }) {
    if (process.env.BREVO_API_KEY) {
        try {
            const recipientList = (Array.isArray(to) ? to : [to]).map(e => ({ email: String(e).trim() }));
            const senderEmail = process.env.EMAIL_USER || 'meal.tracker07@gmail.com';
            const res = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'api-key': process.env.BREVO_API_KEY,
                    'Content-Type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'Meal Tracker', email: senderEmail },
                    to: recipientList,
                    subject,
                    htmlContent: html || text,
                    textContent: text || undefined
                })
            });
            const data = await res.json();
            if (res.ok) {
                console.log(`[Brevo] ✅ Email delivered to ${JSON.stringify(to)}: "${subject}"`);
                return data;
            } else {
                console.error(`[Brevo] ⚠️ API error:`, data);
            }
        } catch (brevoErr) {
            console.error(`[Brevo] ⚠️ HTTP request failed:`, brevoErr.message);
        }
    }

    if (process.env.RESEND_API_KEY) {
        try {
            const senderEmail = process.env.RESEND_FROM || 'Meal Tracker <onboarding@resend.dev>';
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: senderEmail,
                    to: Array.isArray(to) ? to : [to],
                    subject,
                    html: html || text,
                    text: text || undefined
                })
            });
            const data = await res.json();
            if (res.ok) {
                console.log(`[Resend] ✅ Email sent to ${to}: "${subject}"`);
                return data;
            } else {
                console.error(`[Resend] ⚠️ API error:`, data);
            }
        } catch (apiErr) {
            console.error(`[Resend] ⚠️ HTTP request failed:`, apiErr.message);
        }
    }

    const fromAddress = `"Meal Tracker" <${process.env.EMAIL_USER || 'no-reply@mealtracker.local'}>`;
    return transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text
    });
}

transporter.verify((err, success) => {
    if (err) {
        console.log("❌ SMTP Verify Notice (Free tier blocks SMTP - will use Resend/Console):", err.message);
    } else {
        console.log("✅ SMTP Server Ready");
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Password Reset OTP
// ─────────────────────────────────────────────────────────────────────────────
async function sendPasswordResetOTP(email, otp) {
    console.log(`\n==================================================`);
    console.log(`🔑 [ADMIN OTP] Target: ${email} | Code: ${otp}`);
    console.log(`==================================================\n`);
    return sendMailDispatcher({
        to: email,
        subject: "Meal Tracker Admin Password Reset OTP",
        text: `Your OTP is ${otp}\n\nValid for 10 minutes.`
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Approved Email
// ─────────────────────────────────────────────────────────────────────────────
async function sendApprovalEmail(user) {
    return sendMailDispatcher({
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

// ─────────────────────────────────────────────────────────────────────────────
// Account Rejected Email
// ─────────────────────────────────────────────────────────────────────────────
async function sendRejectionEmail(user) {
    return sendMailDispatcher({
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

// ─────────────────────────────────────────────────────────────────────────────
// Meal Status Email  (ON confirmation  OR  OFF / cancellation)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {Object}   data
 * @param {string}   data.studentName
 * @param {string}   data.instituteId
 * @param {string}   data.department
 * @param {string}   data.hostelName
 * @param {string}   data.roomNumber
 * @param {string}   data.session      "Morning" | "Evening"
 * @param {string}   data.status       "ON" | "OFF"
 * @param {string}   data.mealDate     "YYYY-MM-DD"
 * @param {Date}     data.timestamp
 * @param {string[]} recipients        Deduplicated list of email addresses
 */
async function sendMealEmail(data, recipients) {
    // ── Guard: require at least one valid recipient ──────────────────────────
    const toList = [...new Set((recipients || []).filter(Boolean))];
    if (toList.length === 0) {
        console.warn('[MealEmail] No valid recipients — skipping.');
        return;
    }

    const {
        studentName,
        instituteId,
        department,
        hostelName,
        roomNumber,
        session,
        status,
        mealDate,
        timestamp
    } = data;

    const isOn         = status === 'ON';
    const sessionEmoji = session === 'Morning' ? '🌅' : '🌙';

    // ── Visual tokens (status-aware) ─────────────────────────────────────────
    const headerBg      = isOn ? '#16a34a'  : '#b91c1c';
    const headerEmoji   = isOn ? '🍽️'      : '🚫';
    const statusBadgeBg = isOn ? '#dcfce7'  : '#fee2e2';
    const statusBadgeFg = isOn ? '#15803d'  : '#991b1b';
    const statusBorder  = isOn ? '#86efac'  : '#fca5a5';
    const statusLabel   = isOn ? '✅ Meal ON' : '❌ Meal Cancelled (OFF)';
    const infoBoxBg     = isOn ? '#eff6ff'  : '#fffbeb';
    const infoBoxBorder = isOn ? '#3b82f6'  : '#f59e0b';
    const infoBoxFg     = isOn ? '#1d4ed8'  : '#92400e';
    const infoBoxText   = isOn
        ? '📌 This is a confirmation that your meal selection has been recorded. Please be present at the dining hall during meal hours.'
        : '⚠️ You have cancelled your meal before the cutoff time. If this was a mistake, you can turn it back ON while the session is still open.';

    const subjectLine = isOn
        ? `🍽️ Meal ON — ${session} | ${studentName} | ${mealDate}`
        : `🚫 Meal Cancelled — ${session} | ${studentName} | ${mealDate}`;

    const greetingText = isOn
        ? `Your <strong>${session} Meal</strong> has been marked <strong style="color:#16a34a;">ON</strong> successfully.`
        : `Your <strong>${session} Meal</strong> has been <strong style="color:#b91c1c;">cancelled</strong> (marked OFF) before the cutoff time.`;

    const formattedTime = new Date(timestamp).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium'
    });

    // ── Detail rows ──────────────────────────────────────────────────────────
    const rows = [
        ['👤 Student Name',          studentName  || '—'],
        ['🆔 Institute ID',          instituteId  || '—'],
        ['🏛️ Department',            department   || '—'],
        ['🏠 Hostel Name',           hostelName   || '—'],
        ['🚪 Room Number',           roomNumber   || '—'],
        [`${sessionEmoji} Meal Session`, session],
        ['📋 Meal Status',           isOn ? '✅ ON' : '❌ OFF (Cancelled)'],
        ['📅 Date & Time',           formattedTime],
    ];

    const rowsHtml = rows.map(([label, value], i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
          <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;
                     width:42%;border-bottom:1px solid #e5e7eb;">${label}</td>
          <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:500;
                     border-bottom:1px solid #e5e7eb;">${value}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subjectLine}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;
             font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f3f4f6;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.10);max-width:620px;">

          <!-- HEADER -->
          <tr>
            <td style="background:${headerBg};padding:32px 36px;text-align:center;">
              <p style="margin:0 0 6px 0;font-size:36px;">${headerEmoji}</p>
              <h1 style="margin:0 0 4px 0;font-size:22px;font-weight:700;
                         color:#ffffff;letter-spacing:0.5px;">Meal Tracker</h1>
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85);">
                Hostel Meal Management System
              </p>
            </td>
          </tr>

          <!-- STATUS BADGE -->
          <tr>
            <td style="padding:24px 36px 0 36px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:${statusBadgeBg};border:1.5px solid ${statusBorder};
                             border-radius:999px;padding:10px 28px;">
                    <span style="font-size:16px;font-weight:700;
                                 color:${statusBadgeFg};letter-spacing:0.3px;">
                      ${statusLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- GREETING -->
          <tr>
            <td style="padding:20px 36px 0 36px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
                Dear <strong>${studentName}</strong>, ${greetingText}
              </p>
            </td>
          </tr>

          <!-- DETAIL TABLE -->
          <tr>
            <td style="padding:20px 36px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="border-collapse:collapse;border:1px solid #e5e7eb;
                            border-radius:10px;overflow:hidden;">
                ${rowsHtml}
              </table>
            </td>
          </tr>

          <!-- INFO BOX -->
          <tr>
            <td style="padding:0 36px 24px 36px;">
              <div style="background:${infoBoxBg};border-left:4px solid ${infoBoxBorder};
                          border-radius:0 8px 8px 0;padding:14px 18px;">
                <p style="margin:0;font-size:13px;color:${infoBoxFg};line-height:1.6;">
                  ${infoBoxText}
                </p>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                       padding:20px 36px;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;">
                This is an automated notification from <strong>Meal Tracker</strong>.
                Please do not reply to this email.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                &copy; ${new Date().getFullYear()} Meal Tracker System &middot; Hostel Administration
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

    await sendMailDispatcher({
        to: toList,
        subject: subjectLine,
        html
    });

    console.log(`[MealEmail] ✅ Processed "${subjectLine}" to [${toList.join(', ')}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    transporter,
    sendMailDispatcher,
    sendPasswordResetOTP,
    sendApprovalEmail,
    sendRejectionEmail,
    sendMealEmail
};