import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import {
  verificationEmailTemplate,
  passwordResetEmailTemplate,
  deleteAccountTemplate,
} from "./email.templates";

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly logger = new Logger(EmailService.name);

  public constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>("RESEND_API_KEY");
    this.fromEmail = this.configService.getOrThrow<string>("RESEND_FROM_EMAIL");
    this.resend = new Resend(apiKey);
  }

  // better-auth passes the full ready-to-use URL — no token handling needed here
  public async sendVerificationEmail(to: string, url: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: "Verify your Interview Khichuri account",
      html: verificationEmailTemplate(url),
      text: `Welcome to Interview Khichuri. Verify your email: ${url}\n\nLink expires in 1 hour.`,
    });
  }

  public async sendPasswordResetEmail(to: string, url: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: "Reset your Interview Khichuri password",
      html: passwordResetEmailTemplate(url),
      text: `We received a request to reset your Interview Khichuri password. Follow this link and reset your password: ${url}\n\nLink expires in 1 hour.`,
    });
  }

  public async sendDeleteAccountVerification(
    to: string,
    url: string
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: "Regarding your Interview Khichuri Account Deletion request",
      html: deleteAccountTemplate(url),
      text: ` We received a request to permanently delete your Interview Khichuri account and all associated data. This action cannot be undone. Follow this link ${url} to complete the process `,
    });
  }

  private async sendEmail({
    to,
    subject,
    text,
    html,
  }: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      this.logger.error(`Email send failed → ${to}: ${error.message}`);
      throw new InternalServerErrorException("Failed to send email");
    }
  }
}
