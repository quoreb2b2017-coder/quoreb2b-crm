import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class ResendMailService {
  private readonly logger = new Logger(ResendMailService.name);
  private readonly client: Resend | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.client = key ? new Resend(key) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async sendOtpEmail(to: string, code: string): Promise<void> {
    if (!this.client) {
      this.logger.warn(`RESEND_API_KEY not set — OTP email not sent to ${to}`);
      return;
    }

    const from =
      this.config.get<string>('RESEND_FROM_EMAIL') || 'QuoreB2B CRM <onboarding@resend.dev>';

    const { error } = await this.client.emails.send({
      from,
      to,
      subject: 'Your QuoreB2B CRM sign-in code',
      html: `
        <div style="font-family:Inter,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:24px">
          <h2 style="color:#0f172a;margin:0 0 12px">Sign in to QuoreB2B CRM</h2>
          <p style="color:#64748b;font-size:15px;line-height:1.5">Use this one-time code to complete Super Admin sign-in. It expires in 10 minutes.</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:0.35em;color:#007a5c;margin:24px 0">${code}</p>
          <p style="color:#94a3b8;font-size:12px">If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend failed for ${to}: ${error.message}`);
      throw new Error('Failed to send OTP email');
    }
  }
}
