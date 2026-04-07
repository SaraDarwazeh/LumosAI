/**
 * Email Tools (Gmail Integration)
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ToolHandler, ToolResult } from './tool.interface';
import { PrismaService } from '../../../database/prisma.service';
import { google } from 'googleapis';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailTools {
  private readonly logger = new Logger(EmailTools.name);
  private readonly timeoutMs = 15000;
  private readonly retryAttempts = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Send Email Handler
   */
  sendEmailHandler(): ToolHandler {
    return {
      execute: async (userId: string, input: Record<string, unknown>): Promise<ToolResult> => {
        const startTime = Date.now();
        try {
          this.logger.debug(`Sending email for user: ${userId}`, { input });

          const to = String(input.to || '');
          const subject = String(input.subject || '');
          const body = String(input.body || '');
          const cc = input.cc ? String(input.cc) : undefined;
          const bcc = input.bcc ? String(input.bcc) : undefined;

          if (!to || !subject || !body) {
            return {
              success: false,
              error: 'Missing required fields: to, subject, body',
              executionTime: Date.now() - startTime,
            };
          }

          if (!this.isValidEmail(to)) {
            return {
              success: false,
              error: `Invalid recipient email: ${to}`,
              executionTime: Date.now() - startTime,
            };
          }

          const googleAccount = await this.prisma.googleAccount.findUnique({
            where: { userId },
          });

          if (!googleAccount) {
            return {
              success: false,
              error: 'No Google account connected. Please connect your Google account first.',
              executionTime: Date.now() - startTime,
            };
          }

          try {
            return await this.sendViaGmail({
              googleAccount,
              to,
              subject,
              body,
              cc,
              bcc,
              userId,
              startTime,
            });
          } catch (gmailError) {
            const errorMessage = gmailError instanceof Error ? gmailError.message : String(gmailError);
            this.logger.warn(`Gmail send failed: ${errorMessage}`, gmailError);

            if (this.isSmtpConfigured()) {
              return await this.sendViaSmtp({
                to,
                subject,
                body,
                cc,
                bcc,
                userId,
                startTime,
              });
            }

            return {
              success: false,
              error: `Failed to send email via Gmail: ${errorMessage}`,
              executionTime: Date.now() - startTime,
            };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to send email: ${message}`, error);
          return {
            success: false,
            error: `Failed to send email: ${message}`,
            executionTime: Date.now() - startTime,
          };
        }
      },

      canExecute: async (userId: string): Promise<boolean> => {
        const googleAccount = await this.prisma.googleAccount.findUnique({
          where: { userId },
        });
        return !!googleAccount;
      },

      getAccessDeniedReason: async (userId: string): Promise<string | null> => {
        const googleAccount = await this.prisma.googleAccount.findUnique({
          where: { userId },
        });
        if (!googleAccount) {
          return 'No Google account connected. Please connect your Google account first.';
        }
        return null;
      },
    };
  }

  private async sendViaGmail(options: {
    googleAccount: { accessToken: string; refreshToken: string; expiryDate: Date };
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    userId: string;
    startTime: number;
  }): Promise<ToolResult> {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    auth.setCredentials({
      access_token: options.googleAccount.accessToken,
      refresh_token: options.googleAccount.refreshToken,
      expiry_date: options.googleAccount.expiryDate.getTime(),
    });

    const gmail = google.gmail({ version: 'v1', auth });
    const message = this.buildEmailMessage({
      to: options.to,
      subject: options.subject,
      body: options.body,
      cc: options.cc,
      bcc: options.bcc,
    });

    const response = await this.retryAsync(
      () =>
        gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: message,
          },
        }),
      this.retryAttempts,
      500,
    );

    this.logger.debug(`Email sent successfully via Gmail for user ${options.userId}`, {
      messageId: response.data.id,
    });

    return {
      success: true,
      data: {
        transport: 'gmail',
        messageId: response.data.id,
        to: options.to,
        subject: options.subject,
        timestamp: new Date().toISOString(),
      },
      executionTime: Date.now() - options.startTime,
    };
  }

  private async sendViaSmtp(options: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    userId: string;
    startTime: number;
  }): Promise<ToolResult> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!host || !port || !user || !pass || !from) {
      throw new NotFoundException('SMTP fallback is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const mailOptions = {
      from,
      to: options.to,
      subject: options.subject,
      html: options.body,
      text: options.body.replace(/<[^>]+>/g, ''),
      cc: options.cc,
      bcc: options.bcc,
    };

    const info = await transporter.sendMail(mailOptions);
    this.logger.debug(`Email sent successfully via SMTP for user ${options.userId}`, {
      messageId: info.messageId,
    });

    return {
      success: true,
      data: {
        transport: 'smtp',
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
        timestamp: new Date().toISOString(),
      },
      executionTime: Date.now() - options.startTime,
    };
  }

  private isSmtpConfigured(): boolean {
    return !!(
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      (process.env.SMTP_FROM || process.env.SMTP_USER)
    );
  }

  private buildEmailMessage(options: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
  }): string {
    const headers = [
      `To: ${options.to}`,
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
    ];

    if (options.cc) {
      headers.push(`Cc: ${options.cc}`);
    }

    if (options.bcc) {
      headers.push(`Bcc: ${options.bcc}`);
    }

    const message = headers.join('\r\n') + '\r\n\r\n' + options.body;
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private async retryAsync<T>(fn: () => Promise<T>, attempts = 3, delayMs = 300): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Email send attempt ${attempt} failed: ${message}`);
        if (attempt === attempts) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}
