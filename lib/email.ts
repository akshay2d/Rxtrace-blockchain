// Email service for sending invitations
import { createTransport } from 'nodemailer';

const transporter = createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export async function sendInvitationEmail(params: {
  to: string;
  companyName: string;
  role: string;
  inviterName: string;
  customMessage?: string;
  inviteUrl: string;
}) {
  const { to, companyName, role, inviterName, customMessage, inviteUrl } = params;

  // Skip if SMTP not configured (dev environment)
  if (!process.env.SMTP_USER) {
    console.log('📧 SMTP not configured - Email would be sent to:', to);
    console.log('   Invite URL:', inviteUrl);
    return { success: true, skipped: true };
  }

  const emailHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0052CC; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #FF6B35; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RxTrace India</h1>
      <p>You're Invited to Join ${companyName}</p>
    </div>
    <div class="content">
      <p>Hello,</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on RxTrace India as a <strong>${role}</strong>.</p>
      ${customMessage ? `<p style="background: white; padding: 15px; border-left: 4px solid #0052CC; margin: 20px 0;"><em>"${customMessage}"</em></p>` : ''}
      <p>RxTrace India is a pharmaceutical traceability platform for generating GS1-compliant labels and tracking medicines.</p>
      <p>Click the button below to accept the invitation and create your account:</p>
      <center>
        <a href="${inviteUrl}" class="button">Accept Invitation</a>
      </center>
      <p style="font-size: 12px; color: #666;">Or copy this link: ${inviteUrl}</p>
      <p><strong>Role Permissions:</strong></p>
      <ul>
        <li><strong>Admin:</strong> Full access including team management and billing</li>
        <li><strong>Manager:</strong> Label generation, product management, reports</li>
        <li><strong>Operator:</strong> Label generation and basic scanning</li>
      </ul>
    </div>
    <div class="footer">
      <p>This invitation was sent by ${inviterName} from ${companyName}</p>
      <p>© 2026 RxTrace India. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || `"RxTrace India" <${process.env.SMTP_USER}>`,
      to,
      subject: `You're invited to join ${companyName} on RxTrace India`,
      html: emailHTML,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Failed to send invitation email:', error);
    return { success: false, error: error.message };
  }
}
