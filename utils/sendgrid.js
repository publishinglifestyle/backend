const sgMail = require('@sendgrid/mail');
const fs = require('fs').promises;
const path = require('path');
sgMail.setApiKey(process.env.SENDGRID_KEY);

const SENDER_EMAIL = process.env.SENDER_EMAIL || "your-email@example.com";

async function sendResetPasswordEmail(to, token) {
    try {
        // Read the HTML content from the file
        let html = await fs.readFile(path.join(__dirname, '../emails', 'reset_password.html'), 'utf8');

        // Replace the placeholder with the actual reset link
        const resetLink = `https://lowcontent.ai/reset_password?resetToken=${token}`;
        html = html.replace('{{RESET_LINK}}', resetLink);

        const msg = {
            to: to,
            from: SENDER_EMAIL,
            subject: 'Password Reset Request',
            html: html
        };

        await sgMail.send(msg);
        console.log('Password reset email sent');
        return { success: true };
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendResetPasswordEmail
};
