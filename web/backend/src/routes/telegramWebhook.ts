// Inbound webhook from Telegram. The only auth signal Telegram gives us is
// the X-Telegram-Bot-Api-Secret-Token header — set on setWebhook, echoed back
// on every POST. Compare with timingSafeEqual to avoid leaking length/match
// position via timing.
//
// We respond 200 immediately even on processing errors: Telegram retries 4xx/
// 5xx for a while, and a single bug shouldn't drown the queue. Real errors
// are logged for the admin/operator to inspect.

import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { webhookCallback } from "grammy";
import { SETTING_KEYS, getSetting } from "../services/appSettings";
import { getBot } from "../services/telegram/bot";

export const telegramWebhookRouter = Router();

telegramWebhookRouter.post(
  "/telegram/webhook",
  async (req: Request, res: Response) => {
    const bot = getBot();
    if (!bot) {
      // Bot not initialised on this process — could be missing token or
      // mid-restart. Acknowledge so Telegram doesn't retry forever; logs
      // surface the reason.
      console.warn("[telegram] webhook hit but bot not initialised");
      res.sendStatus(200);
      return;
    }

    const expected = (
      await getSetting(SETTING_KEYS.telegramWebhookSecret)
    ).trim();
    const actual = req.header("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!expected || !secretsMatch(expected, actual)) {
      // 401 explicitly so a misconfigured webhook is obvious in logs vs a
      // silent 200 — Telegram itself never produces this since it always
      // sends our secret back.
      res.status(401).json({ error: "invalid_secret_token" });
      return;
    }

    try {
      const handler = webhookCallback(bot, "express");
      await handler(req, res);
    } catch (err) {
      console.error("[telegram] webhook handler threw:", err);
      if (!res.headersSent) res.sendStatus(200);
    }
  },
);

function secretsMatch(a: string, b: string): boolean {
  // Pad the shorter string so timingSafeEqual doesn't throw on length mismatch
  // — the comparison itself still fails because the bytes differ.
  const max = Math.max(a.length, b.length);
  const aBuf = Buffer.alloc(max);
  const bBuf = Buffer.alloc(max);
  aBuf.write(a);
  bBuf.write(b);
  return timingSafeEqual(aBuf, bBuf);
}
