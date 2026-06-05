import nodemailer from 'nodemailer';
import { config, isMailConfigured } from '../config.js';

let transporter = null;

function getTransporter() {
    if (!isMailConfigured()) return null;
    if (!transporter) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: config.mail.user, pass: config.mail.pass }
        });
    }
    return transporter;
}

export async function sendMail({ to, subject, html }) {
    const transport = getTransporter();
    if (!transport) {
        return { skipped: true, reason: 'not_configured' };
    }
    try {
        const info = await transport.sendMail({
            from: config.mail.from,
            to,
            subject,
            html
        });
        return { skipped: false, messageId: info.messageId };
    } catch (err) {
        console.error('E-posta gönderilemedi:', subject, err.message);
        return { skipped: true, reason: 'send_failed', error: err };
    }
}
