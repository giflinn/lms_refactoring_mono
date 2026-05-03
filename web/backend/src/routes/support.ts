import { Router } from "express";
import { getSettings, SETTING_KEYS } from "../services/appSettings";

export const supportRouter = Router();

// Public — mobile clients fetch this on launch and on entering the chat help
// dialog. No auth so the values can render even before the user is signed in
// (e.g. on the login screen "questions?" link). Empty string ⇒ UI hides the
// related affordance.
supportRouter.get("/support/info", async (_req, res, next) => {
  try {
    const settings = await getSettings([
      SETTING_KEYS.supportWhatsapp,
      SETTING_KEYS.supportHours,
    ]);
    res.json({
      whatsapp: settings[SETTING_KEYS.supportWhatsapp] ?? "",
      hours: settings[SETTING_KEYS.supportHours] ?? "",
    });
  } catch (err) {
    next(err);
  }
});
