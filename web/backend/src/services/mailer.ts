import nodemailer, { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env",
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

function getFromAddress(): string {
  return process.env.SMTP_FROM ?? '"Slyamova Zhanna" <noreply@slyamova.kz>';
}

export async function sendPasswordResetCode(
  to: string,
  code: string,
): Promise<void> {
  await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    subject: "Восстановление пароля — Slyamova Zhanna",
    text:
      `Ваш код для восстановления пароля: ${code}\n\n` +
      `Код действителен 10 минут.\n\n` +
      `Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.`,
    html: passwordResetHtml(code),
  });
}

function passwordResetHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; background: #f6f6f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
      <h2 style="color: #2D033B; margin: 0 0 16px;">Восстановление пароля</h2>
      <p style="color: #50555C; font-size: 15px;">Ваш код для восстановления пароля:</p>
      <div style="font-size: 32px; font-weight: 600; letter-spacing: 8px; color: #810CA8; padding: 16px; background: #F9F9F9; border-radius: 8px; text-align: center; margin: 16px 0;">${code}</div>
      <p style="color: #667085; font-size: 13px;">Код действителен 10 минут.</p>
      <p style="color: #667085; font-size: 13px;">Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.</p>
    </div>
  </body>
</html>
  `.trim();
}
