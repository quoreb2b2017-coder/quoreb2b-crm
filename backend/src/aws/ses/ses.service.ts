import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

@Injectable()
export class SesService {
  private readonly logger = new Logger(SesService.name);
  private readonly client: SESClient;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private config: ConfigService) {
    this.fromEmail = config.get<string>('AWS_SES_FROM_EMAIL', '');
    this.fromName = config.get<string>('AWS_SES_FROM_NAME', 'QuoreB2B CRM');
    this.client = new SESClient({
      region: config.get<string>('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    try {
      await this.client.send(
        new SendEmailCommand({
          Source: `${this.fromName} <${this.fromEmail}>`,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: subject },
            Body: {
              Html: { Data: html },
              ...(text ? { Text: { Data: text } } : {}),
            },
          },
        }),
      );
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error);
      throw error;
    }
  }
}
