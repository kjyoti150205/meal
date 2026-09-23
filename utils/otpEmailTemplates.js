'use strict';
/**
 * otpEmailTemplates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional HTML email templates for OTP delivery.
 *
 * Three template functions:
 *   buildLoginOtpEmail(name, otp, role)
 *   buildEmailVerifyOtpEmail(name, otp)
 *   buildForgotPasswordOtpEmail(name, otp, role)
 *
 * All return { subject, html }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { transporter } = require('./email');

const YEAR = new Date().getFullYear();

// ─────────────────────────────────────────────────────────────────────────────
// Shared HTML wrapper
// ─────────────────────────────────────────────────────────────────────────────
function wrap({ headerBg, headerEmoji, badgeText, badgeBg, badgeFg, bodyHtml }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:28px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0"
           style="background:#fff;border-radius:18px;overflow:hidden;
                  box-shadow:0 6px 30px rgba(0,0,0,0.10);max-width:580px;">

      <!-- HEADER -->
      <tr>
        <td style="background:${headerBg};padding:30px 36px;text-align:center;">
          <div style="font-size:40px;margin-bottom:8px;">${headerEmoji}</div>
          <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fff;
                     letter-spacing:0.4px;">Meal Tracker</h1>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.82);">
            Hostel Meal Management System
          </p>
        </td>
      </tr>

      <!-- BADGE -->
      <tr>
        <td style="padding:22px 36px 0;text-align:center;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="background:${badgeBg};border:1.5px solid ${badgeFg};
                         border-radius:999px;padding:8px 24px;">
                <span style="font-size:14px;font-weight:700;color:${badgeFg};">
                  ${badgeText}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- BODY -->
      ${bodyHtml}

      <!-- FOOTER -->
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                   padding:18px 36px;text-align:center;">
          <p style="margin:0 0 3px;font-size:12px;color:#6b7280;">
            This OTP is valid for <strong>5 minutes</strong> and can only be used once.
            Do not share it with anyone.
          </p>
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            &copy; ${YEAR} Meal Tracker System &middot; Automated Security Alert
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP box — big centred digit display
// ─────────────────────────────────────────────────────────────────────────────
function otpBox(otp, accentColor) {
    const digits = String(otp).split('');
    const cells = digits.map(d => `
      <td style="width:44px;height:54px;background:#f8fafc;
                 border:2px solid ${accentColor};border-radius:10px;
                 font-size:26px;font-weight:800;color:${accentColor};
                 text-align:center;vertical-align:middle;line-height:54px;">
        ${d}
      </td>`).join('<td style="width:6px;"></td>');

    return `
    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>${cells}</tr>
    </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOGIN OTP EMAIL
// ─────────────────────────────────────────────────────────────────────────────
function buildLoginOtpEmail(name, otp, role = 'student') {
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

    const bodyHtml = `
      <tr>
        <td style="padding:20px 36px 4px;">
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
            Hi <strong>${name}</strong>,
          </p>
          <p style="margin:8px 0 0;font-size:14px;color:#4b5563;line-height:1.6;">
            You are signing in as <strong>${roleLabel}</strong> to Meal Tracker.
            Use the OTP below to complete your login.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:20px 36px;">
          ${otpBox(otp, '#4f46e5')}
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px 20px;">
          <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;
                      border-radius:0 8px 8px 0;padding:13px 16px;">
            <p style="margin:0;font-size:13px;color:#0369a1;line-height:1.6;">
              ⏱ This OTP expires in <strong>5 minutes</strong>.<br>
              🔒 Never share this code with anyone — Meal Tracker staff will never ask for it.
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px 24px;">
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                      border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#92400e;">
              ⚠️ If you did not attempt to login, please ignore this email
              and consider changing your password immediately.
            </p>
          </div>
        </td>
      </tr>`;

    return {
        subject: `🔐 Your Login OTP - Hostel Meal Tracker`,
        html: wrap({
            headerBg:    '#4f46e5',
            headerEmoji: '🔐',
            badgeText:   '🔐 Login Verification',
            badgeBg:     '#ede9fe',
            badgeFg:     '#4f46e5',
            bodyHtml
        })
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EMAIL VERIFICATION OTP (Registration)
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailVerifyOtpEmail(name, otp) {
    const bodyHtml = `
      <tr>
        <td style="padding:20px 36px 4px;">
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
            Hi <strong>${name}</strong>, welcome to Meal Tracker! 🎉
          </p>
          <p style="margin:8px 0 0;font-size:14px;color:#4b5563;line-height:1.6;">
            Please verify your email address using the OTP below to
            activate your account.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:20px 36px;">
          ${otpBox(otp, '#16a34a')}
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px 20px;">
          <div style="background:#f0fdf4;border-left:4px solid #22c55e;
                      border-radius:0 8px 8px 0;padding:13px 16px;">
            <p style="margin:0;font-size:13px;color:#15803d;line-height:1.6;">
              ✅ After email verification, your account will be reviewed by the Administrator.<br>
              ⏱ OTP expires in <strong>5 minutes</strong>.
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px 24px;">
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                      border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#92400e;">
              ⚠️ If you did not register on Meal Tracker, please ignore this email.
            </p>
          </div>
        </td>
      </tr>`;

    return {
        subject: `✅ Verify Your Email - Hostel Meal Tracker`,
        html: wrap({
            headerBg:    '#16a34a',
            headerEmoji: '✅',
            badgeText:   '✅ Email Verification',
            badgeBg:     '#dcfce7',
            badgeFg:     '#15803d',
            bodyHtml
        })
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. FORGOT PASSWORD OTP
// ─────────────────────────────────────────────────────────────────────────────
function buildForgotPasswordOtpEmail(name, otp, role = 'student') {
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

    const bodyHtml = `
      <tr>
        <td style="padding:20px 36px 4px;">
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
            Hi <strong>${name || roleLabel}</strong>,
          </p>
          <p style="margin:8px 0 0;font-size:14px;color:#4b5563;line-height:1.6;">
            We received a password reset request for your Meal Tracker account.
            Use the OTP below to proceed.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:20px 36px;">
          ${otpBox(otp, '#dc2626')}
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px 20px;">
          <div style="background:#fef2f2;border-left:4px solid #f87171;
                      border-radius:0 8px 8px 0;padding:13px 16px;">
            <p style="margin:0;font-size:13px;color:#b91c1c;line-height:1.6;">
              ⏱ This OTP expires in <strong>5 minutes</strong>.<br>
              🔒 Do not share this OTP with anyone.
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px 24px;">
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                      border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#92400e;">
              ⚠️ If you did not request a password reset, someone may be trying
              to access your account. Please contact the Hostel Administrator immediately.
            </p>
          </div>
        </td>
      </tr>`;

    return {
        subject: `🔑 Password Reset OTP - Hostel Meal Tracker`,
        html: wrap({
            headerBg:    '#dc2626',
            headerEmoji: '🔑',
            badgeText:   '🔑 Password Reset',
            badgeBg:     '#fee2e2',
            badgeFg:     '#dc2626',
            bodyHtml
        })
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: send any of the three email types
// ─────────────────────────────────────────────────────────────────────────────
async function sendOtpEmail(toEmail, template) {
    const { subject, html } = template;
    await transporter.sendMail({
        from:    `"Meal Tracker Security" <${process.env.EMAIL_USER}>`,
        to:      toEmail,
        subject,
        html
    });
    console.log(`[OtpEmail] ✅ "${subject}" → ${toEmail}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    buildLoginOtpEmail,
    buildEmailVerifyOtpEmail,
    buildForgotPasswordOtpEmail,
    sendOtpEmail
};
