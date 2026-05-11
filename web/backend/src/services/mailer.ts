import nodemailer, { Transporter } from "nodemailer";
import { config } from "../config";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const { host, port, user, pass, tlsServername } = config.smtp;
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
    ...(tlsServername ? { tls: { servername: tlsServername } } : {}),
  });
  return transporter;
}

function getFromAddress(): string {
  return config.smtp.from ?? '"Slyamova Zhanna" <noreply@slyamova.kz>';
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

export async function sendEmailVerificationCode(
  to: string,
  code: string,
): Promise<void> {
  await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    subject: "Подтверждение email — Slyamova Zhanna",
    text:
      `Ваш код для подтверждения email: ${code}\n\n` +
      `Код действителен 10 минут.\n\n` +
      `Если вы не регистрировались — просто проигнорируйте это письмо.`,
    html: emailVerificationHtml(code),
  });
}

function emailVerificationHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; background: #f6f6f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
      <h2 style="color: #2D033B; margin: 0 0 16px;">Подтверждение email</h2>
      <p style="color: #50555C; font-size: 15px;">Ваш код для подтверждения email:</p>
      <div style="font-size: 32px; font-weight: 600; letter-spacing: 8px; color: #810CA8; padding: 16px; background: #F9F9F9; border-radius: 8px; text-align: center; margin: 16px 0;">${code}</div>
      <p style="color: #667085; font-size: 13px;">Код действителен 10 минут.</p>
      <p style="color: #667085; font-size: 13px;">Если вы не регистрировались — просто проигнорируйте это письмо.</p>
    </div>
  </body>
</html>
  `.trim();
}

export async function sendStaffInvite(
  to: string,
  password: string,
): Promise<void> {
  await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    subject: "Доступ в админ-панель — Slyamova Zhanna",
    text:
      `Для вас создана учётная запись в админ-панели Slyamova Zhanna.\n\n` +
      `Логин: ${to}\n` +
      `Временный пароль: ${password}\n\n` +
      `Рекомендуем сменить пароль после первого входа.`,
    html: staffCredentialsHtml({
      heading: "Добро пожаловать в админ-панель",
      lead: "Для вас создана учётная запись. Используйте данные ниже для входа и смените пароль после первого входа.",
      email: to,
      password,
    }),
  });
}

export async function sendStaffPasswordReset(
  to: string,
  password: string,
): Promise<void> {
  await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    subject: "Новый пароль — Slyamova Zhanna",
    text:
      `Ваш пароль в админ-панели Slyamova Zhanna был сброшен администратором.\n\n` +
      `Логин: ${to}\n` +
      `Новый пароль: ${password}\n\n` +
      `Рекомендуем сменить пароль после первого входа.`,
    html: staffCredentialsHtml({
      heading: "Пароль сброшен",
      lead: "Ваш пароль в админ-панели был сброшен администратором. Используйте новые данные для входа.",
      email: to,
      password,
    }),
  });
}

function staffCredentialsHtml({
  heading,
  lead,
  email,
  password,
}: {
  heading: string;
  lead: string;
  email: string;
  password: string;
}): string {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, sans-serif; background: #f6f6f6; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px;">
      <h2 style="color: #2D033B; margin: 0 0 16px;">${heading}</h2>
      <p style="color: #50555C; font-size: 15px;">${lead}</p>
      <div style="background: #F9F9F9; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="color: #667085; font-size: 13px; margin: 0 0 4px;">Логин</p>
        <p style="color: #0E131F; font-size: 15px; font-weight: 600; margin: 0 0 12px;">${email}</p>
        <p style="color: #667085; font-size: 13px; margin: 0 0 4px;">Пароль</p>
        <p style="color: #810CA8; font-size: 18px; font-weight: 600; font-family: 'SF Mono', Menlo, monospace; margin: 0;">${password}</p>
      </div>
      <p style="color: #667085; font-size: 13px;">Рекомендуем сменить пароль после первого входа.</p>
    </div>
  </body>
</html>
  `.trim();
}
