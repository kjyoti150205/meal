/**
 * emailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared email notification service for Hostel Meal Tracker.
 *
 * Provides:
 *   getAdminManagerEmails()     — fetch all admin + approved-manager emails from DB
 *   sendLoginEmail(data, recipients)
 *   sendProfileUpdateEmail(data, recipients)
 *
 * All functions are non-throwing: errors are logged and swallowed so the
 * calling request handler is never blocked or failed by email issues.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { transporter, sendMailDispatcher } = require('./email');
const Admin           = require('../models/Admin');
const Manager         = require('../models/Manager');

// ─────────────────────────────────────────────────────────────────────────────
// Shared: collect all admin + approved-manager email addresses
// ─────────────────────────────────────────────────────────────────────────────
async function getAdminManagerEmails() {
    try {
        const [admins, managers] = await Promise.all([
            Admin.find({}, 'email').lean(),
            Manager.find({ verificationStatus: 'approved' }, 'email').lean()
        ]);

        const emails = [
            ...admins.map(a => a.email),
            ...managers.map(m => m.email)
        ].filter(Boolean);

        return [...new Set(emails)];
    } catch (err) {
        console.error('[EmailService] getAdminManagerEmails error:', err.message);
        return [];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: HTML shell (header + footer wrapper)
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailShell({ headerBg, headerEmoji, headerTitle, headerSubtitle, bodyHtml }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${headerTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="background:#f3f4f6;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="620" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,.10);max-width:620px;">

          <!-- ═══ HEADER ═══ -->
          <tr>
            <td style="background:${headerBg};padding:32px 36px;text-align:center;">
              <p style="margin:0 0 6px;font-size:38px;line-height:1;">${headerEmoji}</p>
              <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;
                         color:#fff;letter-spacing:.5px;">Meal Tracker</h1>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,.80);">
                Hostel Meal Management System
              </p>
            </td>
          </tr>

          <!-- ═══ BADGE ROW ═══ -->
          <tr>
            <td style="padding:22px 36px 0;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#f0f9ff;border:1.5px solid #bae6fd;
                             border-radius:999px;padding:9px 26px;">
                    <span style="font-size:15px;font-weight:700;color:#0369a1;
                                 letter-spacing:.3px;">${headerTitle}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ═══ BODY ═══ -->
          ${bodyHtml}

          <!-- ═══ FOOTER ═══ -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                       padding:18px 36px;text-align:center;">
              <p style="margin:0 0 3px;font-size:12px;color:#6b7280;">
                This is an automated alert from <strong>Meal Tracker</strong>.
                Do not reply to this email.
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;">
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: render a detail table from a rows array  [ [label, value], ... ]
// ─────────────────────────────────────────────────────────────────────────────
function buildDetailTable(rows) {
    const rowsHtml = rows.map(([label, value], i) => `
      <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'};">
        <td style="padding:11px 16px;font-size:13px;font-weight:600;color:#6b7280;
                   width:42%;border-bottom:1px solid #e5e7eb;">${label}</td>
        <td style="padding:11px 16px;font-size:14px;color:#111827;font-weight:500;
                   border-bottom:1px solid #e5e7eb;">${value || '—'}</td>
      </tr>`).join('');

    return `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border-collapse:collapse;border:1px solid #e5e7eb;
                    border-radius:10px;overflow:hidden;">
        ${rowsHtml}
      </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: render a diff table for profile changes
// ─────────────────────────────────────────────────────────────────────────────
function buildDiffTable(changes) {
    if (!changes || changes.length === 0) {
        return '<p style="color:#6b7280;font-size:14px;">No field changes detected.</p>';
    }

    const header = `
      <tr style="background:#4f46e5;">
        <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#fff;
                   text-align:left;border-bottom:1px solid #4338ca;">Field</th>
        <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#fff;
                   text-align:left;border-bottom:1px solid #4338ca;">Previous</th>
        <th style="padding:10px 14px;font-size:12px;font-weight:700;color:#fff;
                   text-align:left;border-bottom:1px solid #4338ca;">Updated To</th>
      </tr>`;

    const rowsHtml = changes.map((c, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'};">
        <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#374151;
                   border-bottom:1px solid #e5e7eb;">${c.field}</td>
        <td style="padding:10px 14px;font-size:13px;color:#9ca3af;
                   text-decoration:line-through;border-bottom:1px solid #e5e7eb;">${c.previous || '—'}</td>
        <td style="padding:10px 14px;font-size:13px;color:#16a34a;font-weight:600;
                   border-bottom:1px solid #e5e7eb;">${c.updated}</td>
      </tr>`).join('');

    return `
      <table width="100%" cellpadding="0" cellspacing="0"
             style="border-collapse:collapse;border:1px solid #e5e7eb;
                    border-radius:10px;overflow:hidden;">
        ${header}
        ${rowsHtml}
      </table>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple User-Agent parser (no external dependencies)
// Returns { browser, device }
// ─────────────────────────────────────────────────────────────────────────────
function parseUserAgent(ua) {
    if (!ua) return { browser: 'Unknown', device: 'Unknown' };

    // Browser
    let browser = 'Unknown';
    if (/Edg\//.test(ua))            browser = 'Microsoft Edge';
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua))    browser = 'Google Chrome';
    else if (/Firefox\//.test(ua))   browser = 'Mozilla Firefox';
    else if (/Safari\//.test(ua))    browser = 'Apple Safari';
    else if (/MSIE|Trident/.test(ua)) browser = 'Internet Explorer';

    // Device
    let device = 'Desktop';
    if (/Mobi|Android/i.test(ua))    device = 'Mobile';
    else if (/Tablet|iPad/i.test(ua)) device = 'Tablet';

    return { browser, device };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN ALERT EMAIL
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {Object} user        Mongoose User document (or plain object)
 * @param {Object} meta
 * @param {string} meta.ip
 * @param {string} meta.browser
 * @param {string} meta.device
 * @param {Date}   meta.loginTime
 * @param {string[]} recipients  All email addresses to notify
 */
async function sendLoginEmail(user, meta, recipients) {
    const toList = [...new Set((recipients || []).filter(Boolean))];
    if (toList.length === 0) {
        console.warn('[LoginEmail] No recipients — skipping.');
        return;
    }

    const { ip, browser, device, loginTime } = meta;

    const formattedDate = new Date(loginTime).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full'
    });
    const formattedTime = new Date(loginTime).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        timeStyle: 'medium'
    });

    const detailTable = buildDetailTable([
        ['👤 Student Name',  user.fullName  || '—'],
        ['🆔 Institute ID',  user.instituteId || '—'],
        ['📅 Login Date',    formattedDate],
        ['⏰ Login Time',    formattedTime],
        ['💻 Device',        device],
        ['🌐 Browser',       browser],
        ['🔗 IP Address',    ip || 'Not available'],
    ]);

    const bodyHtml = `
      <tr>
        <td style="padding:20px 36px 0;">
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
            Dear <strong>${user.fullName || 'Student'}</strong>,
            a successful login was recorded for your Meal Tracker account.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 36px;">${detailTable}</td>
      </tr>
      <tr>
        <td style="padding:0 36px 24px;">
          <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                      border-radius:0 8px 8px 0;padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
              ⚠️ <strong>Security Notice:</strong> If this login was not made by you,
              please change your password immediately and contact the Hostel Administrator.
            </p>
          </div>
        </td>
      </tr>`;

    const html = buildEmailShell({
        headerBg:       '#4f46e5',
        headerEmoji:    '🔐',
        headerTitle:    '🔐 Login Alert',
        headerSubtitle: 'Account Security Notification',
        bodyHtml
    });

    const subject = `🔐 Login Alert - Hostel Meal Tracker`;

    await sendMailDispatcher({
        to:   toList,
        subject,
        html
    });

    console.log(`[LoginEmail] ✅ Sent to [${toList.join(', ')}]`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE UPDATE EMAIL
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {Object} user      Updated Mongoose User document (already saved)
 * @param {Array}  changes   [{ field, previous, updated }, ...]
 * @param {string[]} recipients
 */
async function sendProfileUpdateEmail(user, changes, recipients) {
    const toList = [...new Set((recipients || []).filter(Boolean))];
    if (toList.length === 0) {
        console.warn('[ProfileEmail] No recipients — skipping.');
        return;
    }

    if (!changes || changes.length === 0) {
        console.log('[ProfileEmail] No actual changes detected — skipping.');
        return;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full'
    });
    const formattedTime = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        timeStyle: 'medium'
    });

    const diffTable = buildDiffTable(changes);

    // Check if photo was updated
    const photoChanged = changes.some(c => c.field === 'Profile Photo');

    const bodyHtml = `
      <tr>
        <td style="padding:20px 36px 0;">
          <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
            Dear <strong>${user.fullName || 'Student'}</strong>,
            your Hostel Meal Tracker profile was updated successfully.
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:16px 36px 4px;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#6b7280;
                    text-transform:uppercase;letter-spacing:.6px;">Changes Made</p>
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px;">${diffTable}</td>
      </tr>

      <tr>
        <td style="padding:16px 36px 4px;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#6b7280;
                    text-transform:uppercase;letter-spacing:.6px;">Update Details</p>
        </td>
      </tr>

      <tr>
        <td style="padding:0 36px;">
          ${buildDetailTable([
              ['👤 Student Name',  user.fullName    || '—'],
              ['🆔 Institute ID',  user.instituteId || '—'],
              ['📅 Date',          formattedDate],
              ['⏰ Time',          formattedTime],
          ])}
        </td>
      </tr>

      ${photoChanged ? `
      <tr>
        <td style="padding:14px 36px 0;">
          <div style="background:#f0fdf4;border-left:4px solid #22c55e;
                      border-radius:0 8px 8px 0;padding:12px 16px;">
            <p style="margin:0;font-size:13px;color:#15803d;">
              📸 Your profile photo was also updated.
            </p>
          </div>
        </td>
      </tr>` : ''}

      <tr>
        <td style="padding:16px 36px 24px;">
          <div style="background:#fff7ed;border-left:4px solid #f97316;
                      border-radius:0 8px 8px 0;padding:14px 18px;">
            <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.6;">
              ⚠️ If you did not make these changes, please contact the Hostel Administrator immediately.
            </p>
          </div>
        </td>
      </tr>`;

    const html = buildEmailShell({
        headerBg:       '#d97706',
        headerEmoji:    '✏️',
        headerTitle:    '✏️ Profile Updated',
        headerSubtitle: 'Profile Change Notification',
        bodyHtml
    });

    const subject = `✏️ Your Hostel Profile Was Updated`;

    await sendMailDispatcher({
        to:   toList,
        subject,
        html
    });

    console.log(`[ProfileEmail] ✅ Sent to [${toList.join(', ')}] — ${changes.length} field(s) changed`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
    getAdminManagerEmails,
    parseUserAgent,
    sendLoginEmail,
    sendProfileUpdateEmail
};
