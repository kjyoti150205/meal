'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Complaint = require('../models/Complaint');
const { transporter } = require('../utils/email');
const { getAdminManagerEmails } = require('../utils/emailService');
const {
    notifyStudent,
    notifyAllManagers,
    notifyAllAdmins,
    fireAndForget
} = require('../utils/notificationHelper');

async function sendNewComplaintEmail(complaint) {
    try {
        const managerEmails = await getAdminManagerEmails();
        const fallbackManager = process.env.MANAGER_EMAIL;
        const fallbackAdmin   = process.env.ADMIN_EMAIL;
        const recipients = [...new Set([...managerEmails, fallbackManager, fallbackAdmin].filter(Boolean))];

        if (!recipients.length || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.log('ℹ️ New Complaint email skipped — no email recipients or credentials configured.');
            return;
        }

        const createdAtStr = new Date(complaint.createdAt || Date.now()).toLocaleString('en-IN', {
            dateStyle: 'full',
            timeStyle: 'medium'
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipients.join(', '),
            subject: 'New Student Complaint Received',
            html: `
                <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <div style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:24px;text-align:center;color:#ffffff;">
                        <h2 style="margin:0;font-size:22px;">New Student Complaint Received</h2>
                        <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">Hostel Meal Tracker</p>
                    </div>
                    <div style="padding:24px;color:#374151;">
                        <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;">
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;width:35%;">Student Name:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.studentName}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Student Email:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.email}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Institute ID:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.instituteId || 'N/A'}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Room Number:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.roomNumber || 'N/A'}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Complaint Category:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.category}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Priority:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.priority}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Complaint Subject:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong>${complaint.subject}</strong></td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;vertical-align:top;">Complaint Message:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.description || complaint.subject}</td></tr>
                            <tr><td style="padding:8px 0;font-weight:600;">Date & Time:</td><td style="padding:8px 0;">${createdAtStr}</td></tr>
                        </table>
                    </div>
                </div>
            `
        };

        if (complaint.image) {
            const absolutePath = path.join(__dirname, '..', complaint.image);
            if (fs.existsSync(absolutePath)) {
                mailOptions.attachments = [{ filename: path.basename(absolutePath), path: absolutePath }];
            }
        }

        await transporter.sendMail(mailOptions);
        console.log(`[ComplaintEmail] ✅ Notification sent to managers/admins for complaint ${complaint._id}`);
    } catch (err) {
        console.error('[ComplaintEmail] ❌ Failed to send new complaint email:', err.message);
    }
}

async function sendComplaintUpdatedEmail(complaint) {
    try {
        if (!complaint.email || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            return;
        }

        const updatedAtStr = new Date(complaint.updatedAt || Date.now()).toLocaleString('en-IN', {
            dateStyle: 'full',
            timeStyle: 'medium'
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: complaint.email,
            subject: `Your Complaint Status: ${complaint.status}`,
            html: `
                <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
                    <div style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:24px;text-align:center;color:#ffffff;">
                        <h2 style="margin:0;font-size:22px;">Complaint Status Update</h2>
                        <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">Hostel Meal Tracker</p>
                    </div>
                    <div style="padding:24px;color:#374151;">
                        <p style="margin-top:0;">Dear <strong>${complaint.studentName}</strong>,</p>
                        <p>Your complaint status has been updated by hostel management.</p>
                        <table style="width:100%;border-collapse:collapse;font-size:14px;line-height:1.6;margin:16px 0;">
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;width:35%;">Category:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">${complaint.category}</td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Subject:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><strong>${complaint.subject}</strong></td></tr>
                            <tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;">Current Status:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:12px;background:#eef0fb;color:#4338ca;">${complaint.status}</span></td></tr>
                            ${complaint.managerReply ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-weight:600;vertical-align:top;">Manager Reply:</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;background:#f8f9ff;border-left:3px solid #6366f1;padding:8px 12px;border-radius:6px;">${complaint.managerReply}</td></tr>` : ''}
                            <tr><td style="padding:8px 0;font-weight:600;">Updated Date & Time:</td><td style="padding:8px 0;">${updatedAtStr}</td></tr>
                        </table>
                        <p style="margin-bottom:0;font-size:13px;color:#6b7280;">Log in to your Meal Tracker dashboard to view details.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`[ComplaintEmail] ✅ Update notification sent to student ${complaint.email}`);
    } catch (err) {
        console.error('[ComplaintEmail] ❌ Failed to send complaint update email:', err.message);
    }
}

exports.createComplaint = async (req, res) => {
    try {
        const {
            studentId,
            userId,
            studentName,
            email,
            instituteId,
            department,
            roomNumber,
            category,
            subject,
            description,
            complaint: complaintMsg,
            priority
        } = req.body;

        const effectiveStudentId = studentId || userId || req.user?.id;
        const effectiveDescription = description || complaintMsg || subject;

        if (!effectiveStudentId || !studentName || !email || !category || !subject) {
            return res.status(400).json({ message: 'Please fill in all required fields.' });
        }

        const complaint = new Complaint({
            studentId: effectiveStudentId,
            userId: effectiveStudentId,
            studentName,
            email,
            instituteId: instituteId || '',
            department: department || '',
            roomNumber: roomNumber || '',
            category,
            subject,
            description: effectiveDescription,
            priority: priority || 'Medium',
            image: req.file ? `/uploads/${req.file.filename}` : null
        });

        await complaint.save();

        fireAndForget(async () => {
            await sendNewComplaintEmail(complaint);

            await notifyStudent(effectiveStudentId, {
                type: 'complaint_submitted',
                title: 'Complaint Submitted',
                message: `Your complaint "${subject}" has been submitted successfully.`,
                icon: 'fa-paper-plane',
                metadata: { complaintId: complaint._id }
            });

            await notifyAllManagers({
                type: 'new_complaint',
                title: 'New Complaint',
                message: `${studentName} submitted a ${complaint.priority} priority complaint: ${subject}`,
                icon: 'fa-exclamation-circle',
                metadata: { complaintId: complaint._id, priority: complaint.priority }
            });

            await notifyAllAdmins({
                type: 'complaint_received',
                title: 'Complaint Received',
                message: `New complaint from ${studentName}: ${subject}`,
                icon: 'fa-inbox',
                metadata: { complaintId: complaint._id, priority: complaint.priority }
            });
        });

        res.status(201).json({
            message: 'Complaint submitted successfully.',
            complaint
        });
    } catch (error) {
        console.error('Create complaint error:', error);
        res.status(500).json({ message: error.message || 'Failed to submit complaint' });
    }
};

exports.getMyComplaints = async (req, res) => {
    try {
        const studentId = req.params.studentId || req.params.userId || req.query.studentId || req.query.userId || req.user?.id;
        const userEmail = req.user?.email;

        if (!studentId && !userEmail) {
            return res.status(400).json({ message: 'Student ID or email is required' });
        }

        const orConditions = [];

        if (studentId) {
            orConditions.push({ studentId: studentId });
            orConditions.push({ userId: studentId });
            if (mongoose.Types.ObjectId.isValid(studentId)) {
                const objId = new mongoose.Types.ObjectId(studentId);
                orConditions.push({ studentId: objId });
                orConditions.push({ userId: objId });
            }
        }

        if (userEmail) {
            orConditions.push({ email: userEmail.toLowerCase() });
        }

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const complaints = await Complaint.find({ $or: orConditions }).sort({ createdAt: -1 }).lean();
        res.json(complaints);
    } catch (error) {
        console.error('Get my complaints error:', error);
        res.status(500).json({ message: 'Failed to fetch your complaints' });
    }
};

exports.getAllComplaints = async (req, res) => {
    try {
        const { status, priority, studentId, userId, search } = req.query;
        const filter = {};

        if (studentId || userId) {
            const sid = studentId || userId;
            filter.$or = [{ studentId: sid }, { userId: sid }];
        }

        if (status && status !== 'all') filter.status = status;
        if (priority && priority !== 'all') filter.priority = priority;

        if (search) {
            const searchRegex = new RegExp(search.trim(), 'i');
            const searchFilter = [
                { studentName: searchRegex },
                { email: searchRegex },
                { category: searchRegex },
                { subject: searchRegex },
                { description: searchRegex },
                { roomNumber: searchRegex }
            ];

            if (filter.$or) {
                filter.$and = [
                    { $or: filter.$or },
                    { $or: searchFilter }
                ];
                delete filter.$or;
            } else {
                filter.$or = searchFilter;
            }
        }

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        const complaints = await Complaint.find(filter).sort({ createdAt: -1 }).lean();
        res.json(complaints);
    } catch (error) {
        console.error('Get all complaints error:', error);
        res.status(500).json({ message: 'Failed to fetch complaints' });
    }
};

exports.updateComplaint = async (req, res) => {
    try {
        const { status, managerReply } = req.body;
        const complaintId = req.params.id;

        const existingComplaint = await Complaint.findById(complaintId);
        if (!existingComplaint) {
            return res.status(404).json({ message: 'Complaint not found' });
        }

        const previousStatus = existingComplaint.status;
        const hadReply = !!existingComplaint.managerReply;

        const updateData = {};

        if (status) {
            const validStatuses = ['Pending', 'In Progress', 'Resolved', 'Rejected'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ message: 'Invalid status value' });
            }
            updateData.status = status;
            if (status === 'Resolved' && previousStatus !== 'Resolved') {
                updateData.resolvedAt = new Date();
            } else if (status !== 'Resolved') {
                updateData.resolvedAt = null;
            }
        }

        if (typeof managerReply === 'string') {
            updateData.managerReply = managerReply.trim();
        }

        const updatedComplaint = await Complaint.findByIdAndUpdate(
            complaintId,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        console.log(`[ComplaintUpdate] ✅ Complaint ${updatedComplaint._id} updated in MongoDB: status="${updatedComplaint.status}", reply="${updatedComplaint.managerReply}"`);

        fireAndForget(async () => {
            await sendComplaintUpdatedEmail(updatedComplaint);

            const targetStudentId = updatedComplaint.studentId || updatedComplaint.userId;

            if (status && status !== previousStatus && targetStudentId) {
                let title = 'Complaint Status Updated';
                let message = `Your complaint "${updatedComplaint.subject}" status is now ${status}.`;
                let icon = 'fa-info-circle';

                if (status === 'In Progress') {
                    title = 'Complaint In Progress';
                    message = `Your complaint "${updatedComplaint.subject}" is now being addressed by management.`;
                    icon = 'fa-spinner';
                } else if (status === 'Resolved') {
                    title = 'Complaint Resolved';
                    message = `Your complaint "${updatedComplaint.subject}" has been resolved.`;
                    icon = 'fa-check-circle';
                } else if (status === 'Pending') {
                    title = 'Complaint Marked Pending';
                    message = `Your complaint "${updatedComplaint.subject}" is marked as Pending.`;
                    icon = 'fa-clock';
                } else if (status === 'Rejected') {
                    title = 'Complaint Rejected';
                    message = `Your complaint "${updatedComplaint.subject}" has been rejected.`;
                    icon = 'fa-times-circle';
                }

                await notifyStudent(targetStudentId, {
                    type: `complaint_${status.toLowerCase().replace(/\s+/g, '_')}`,
                    title,
                    message,
                    icon,
                    metadata: { complaintId: updatedComplaint._id, status }
                });
            }

            if (typeof managerReply === 'string' && managerReply.trim() && (!hadReply || managerReply.trim() !== existingComplaint.managerReply) && targetStudentId) {
                await notifyStudent(targetStudentId, {
                    type: 'manager_reply',
                    title: 'Manager Reply',
                    message: `Manager replied to your complaint "${updatedComplaint.subject}": "${managerReply.trim()}"`,
                    icon: 'fa-reply',
                    metadata: { complaintId: updatedComplaint._id }
                });
            }
        });

        res.json({
            message: 'Complaint updated successfully',
            complaint: updatedComplaint
        });
    } catch (error) {
        console.error('Update complaint error:', error);
        res.status(500).json({ message: error.message || 'Failed to update complaint' });
    }
};

exports.deleteComplaint = async (req, res) => {
    try {
        const complaint = await Complaint.findByIdAndDelete(req.params.id);

        if (!complaint) {
            return res.status(404).json({ message: 'Complaint not found' });
        }

        if (complaint.image) {
            const absolutePath = path.join(__dirname, '..', complaint.image);
            fs.unlink(absolutePath, () => {});
        }

        res.json({ message: 'Complaint deleted successfully' });
    } catch (error) {
        console.error('Delete complaint error:', error);
        res.status(500).json({ message: 'Failed to delete complaint' });
    }
};
