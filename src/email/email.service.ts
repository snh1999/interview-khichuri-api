import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  verificationEmailTemplate,
  passwordResetEmailTemplate,
} from './email.templates';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly logger = new Logger(EmailService.name);

  public constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
    this.fromEmail = this.configService.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.resend = new Resend(apiKey);
  }

  // better-auth passes the full ready-to-use URL — no token handling needed here
  public async sendVerificationEmail(to: string, url: string): Promise<void> {
    await this.sendEmail(
      to,
      'Verify your Interview Khichuri account',
      verificationEmailTemplate(url),
    );
  }

  public async sendPasswordResetEmail(to: string, url: string): Promise<void> {
    await this.sendEmail(
      to,
      'Reset your Interview Khichuri password',
      passwordResetEmailTemplate(url),
    );
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      this.logger.error(`Email send failed → ${to}: ${error.message}`);
      throw new InternalServerErrorException('Failed to send email');
    }
  }
}
