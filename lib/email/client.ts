// PHASE-8: Email client for sending transactional emails
// Uses Resend API (preferred) or nodemailer as fallback

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send transactional email using Resend API or nodemailer fallback
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text } = params;

  const resendApiKey = process.env.RESEND_API_KEY;

  // Try Resend API first
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'RxTrace <noreply@rxtrace.in>',
          to: [to],
          subject,
          html,
          ...(text && { text }),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Resend API error:', error);
        throw new Error(`Resend API failed: ${error}`);
      }

      console.log(`Email sent via Resend to ${to}`);
      return;
    } catch (error) {
      console.error('Failed to send email via Resend:', error);
      // Continue to fallback
    }
  }

  // Fallback to nodemailer
  await sendEmailViaNodemailer({ to, subject, html, text });
}

/**
 * Send email using nodemailer (fallback)
 */
async function sendEmailViaNodemailer(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text } = params;

  const nodemailerModule = await import('nodemailer');
  const nodemailer = nodemailerModule?.default ?? nodemailerModule;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    html,
    ...(text && { text }),
  });

  console.log(`Email sent via nodemailer to ${to}`);
}

/**
 * Send bulk emails (for announcements, etc.)
 */
export async function sendBulkEmails(
  recipients: Array<{ email: string; html: string; subject: string }>,
  options?: { batchSize?: number; delayMs?: number }
): Promise<{ success: number; failed: number }> {
  const batchSize = options?.batchSize || 10;
  const delayMs = options?.delayMs || 1000;

  let success = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (recipient) => {
        try {
          await sendEmail({
            to: recipient.email,
            subject: recipient.subject,
            html: recipient.html,
          });
          success++;
        } catch (error) {
          console.error(`Failed to send email to ${recipient.email}:`, error);
          failed++;
        })
      })
    );

    // Add delay between batches to avoid rate limiting
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { success, failed };
}
