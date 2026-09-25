const nodemailer = require('nodemailer');
const { emailConfig, appUrl } = require('../config/env');
const AppError = require('./appError');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const emailLayout = ({ name, title, message, buttonText, buttonUrl }) => `
  <div style="background:#f4f7fb;padding:40px 16px;font-family:Arial,sans-serif;color:#172033;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#173b6c;padding:28px 32px;color:#ffffff;">
        <div style="font-size:22px;font-weight:700;">Employee Portal</div>
        <div style="margin-top:6px;color:#c9d8ed;font-size:13px;">Account security notification</div>
      </div>
      <div style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:26px;color:#172033;">${escapeHtml(title)}</h1>
        <p style="font-size:16px;line-height:1.6;">Hello ${escapeHtml(name)},</p>
        <p style="font-size:16px;line-height:1.6;">${escapeHtml(message)}</p>
        <a href="${escapeHtml(buttonUrl)}" style="display:inline-block;margin:12px 0 20px;background:#e56b35;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:7px;font-weight:700;">${escapeHtml(buttonText)}</a>
        <p style="font-size:13px;line-height:1.6;color:#687386;">This link expires for your security. If you did not request this, you can safely ignore this email.</p>
      </div>
      <div style="border-top:1px solid #e3e8f0;padding:18px 32px;color:#687386;font-size:12px;">Please do not reply to this automated message.</div>
    </div>
  </div>`;

const transporter = emailConfig.host && emailConfig.user && emailConfig.password
  ? nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.password
      }
    })
  : null;

const sendEmail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    console.log(`[development email] To: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }

  try {
    await transporter.sendMail({
      from: emailConfig.from,
      to,
      subject,
      text,
      html
    });
  } catch (error) {
    console.error('Email delivery failed:', error.message);
    throw new AppError('Email service unavailable. Please try again later.', 503);
  }
};

const sendVerificationEmail = (user, token) => {
  const verificationUrl = `${appUrl}/?mode=verify&token=${token}`;

  return sendEmail({
    to: user.email,
    subject: 'Verify your Employee Portal account',
    text: `Hello ${user.name}, verify your email here: ${verificationUrl}`,
    html: emailLayout({
      name: user.name,
      title: 'Verify your email',
      message: 'Confirm your email address to activate your account and continue securely.',
      buttonText: 'Verify email address',
      buttonUrl: verificationUrl
    })
  });
};

const sendPasswordResetEmail = (user, token) => {
  const resetUrl = `${appUrl}/?mode=reset&token=${token}`;

  return sendEmail({
    to: user.email,
    subject: 'Reset your Employee Portal password',
    text: `Reset your password here: ${resetUrl}`,
    html: emailLayout({
      name: user.name,
      title: 'Reset your password',
      message: 'Use the button below to choose a new password for your Employee Portal account.',
      buttonText: 'Reset password',
      buttonUrl: resetUrl
    })
  });
};

const sendAnnouncementEmail = (user, announcement) => sendEmail({
  to: user.email,
  subject: `New announcement: ${announcement.title}`,
  text: `Hello ${user.name},\n\n${announcement.title}\n\n${announcement.description}\n\nView it in Employee Portal: ${appUrl}/`,
  html: emailLayout({
    name: user.name,
    title: announcement.title,
    message: announcement.description,
    buttonText: 'Open Employee Portal',
    buttonUrl: appUrl
  })
});

const sendAnnouncementEmails = async (users, announcement) => {
  const results = await Promise.allSettled(
    users.map((user) => sendAnnouncementEmail(user, announcement))
  );

  return {
    sent: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length
  };
};

const sendLetterEmail = (user, letter) => sendEmail({
  to: user.email,
  subject: `${letter.title} - Employee Portal`,
  text: `Hello ${user.name},\n\nYour ${letter.letterType} letter is ready in Employee Portal.`,
  html: letter.content
});

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendAnnouncementEmails, sendLetterEmail };
