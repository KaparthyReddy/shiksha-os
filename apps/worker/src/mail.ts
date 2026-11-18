import nodemailer from "nodemailer";

export interface MailConfig {
  SMTP_HOST: string;
  SMTP_PORT: number;
  MAIL_FROM: string;
}

export interface Message {
  to: string | string[];
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export function createMailer(cfg: MailConfig) {
  const transport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: false,
    ignoreTLS: true, // dev/Mailpit. Production SMTP settings come with the deployment docs.
  });
  return {
    async send(msg: Message): Promise<void> {
      await transport.sendMail({ from: cfg.MAIL_FROM, ...msg });
    },
  };
}

export type Mailer = ReturnType<typeof createMailer>;
