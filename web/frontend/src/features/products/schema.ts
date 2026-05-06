import { z } from "zod";

// Price is typed by the user as integer tenge (no kopecks). An empty string
// means "по запросу" — handled outside the schema so the user-visible
// validation only fires on actual numeric input.
const PRICE_RE = /^\d{1,10}$/;

export const productFormSchema = z
  .object({
    categoryId: z.string().min(1, "Выберите категорию"),
    title: z.string().trim().min(1, "Введите название").max(120),
    // Optional short caption — empty string acceptable, capped at 60 chars.
    subtitle: z.string().trim().max(60, "Подпись слишком длинная"),
    description: z.string().trim().min(1, "Введите описание").max(2000),
    buttonText: z.string().trim().min(1, "Введите текст кнопки").max(40),
    priceOnRequest: z.boolean(),
    priceTenge: z.string(),
    daysUntilCancel: z
      .string()
      .min(1, "Укажите количество дней")
      .regex(/^\d+$/, "Введите целое число")
      .refine(
        (s) => {
          const n = Number(s);
          return Number.isInteger(n) && n >= 0 && n <= 365;
        },
        { message: "Введите число от 0 до 365" },
      ),
    // Срок активности заказа после оплаты в днях. Пусто = бессрочно для
    // обычных товаров; для bookable не используется (длительность в
    // durationMinutes). Не валидируем как required — пусто допустимо.
    activeDurationDays: z.string(),
    isPromo: z.boolean(),
    isActive: z.boolean(),
    isTopSearch: z.boolean(),
    // Booking section. When false the consultation fields are ignored.
    bookingEnabled: z.boolean(),
    durationMinutes: z.string(),
    slotTypeIds: z.array(z.string()),
    // Telegram-grant section. Mutually exclusive with bookingEnabled.
    telegramEnabled: z.boolean(),
    telegramGroupId: z.string(),
    // LMS-course section. Mutually exclusive with bookingEnabled and
    // telegramEnabled.
    lmsCourseEnabled: z.boolean(),
    lmsCourseId: z.string(),
    // Optional cover-video. videoEnabled gates the whole section. Source is
    // either a YouTube URL or an uploaded file (the form widget toggles
    // between them but persists into the same fields below).
    videoEnabled: z.boolean(),
    videoSource: z.enum(["upload", "youtube"]),
    videoUrl: z.string(),
    videoDisplay: z.enum(["replace", "below"]),
    videoAutoplay: z.boolean(),
  })
  .superRefine((vals, ctx) => {
    if (!vals.priceOnRequest) {
      const v = vals.priceTenge.trim();
      if (!v) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceTenge"],
          message: "Введите цену или включите «По запросу»",
        });
      } else if (!PRICE_RE.test(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["priceTenge"],
          message: "Введите целое число тенге",
        });
      }
    }
    {
      const v = vals.activeDurationDays.trim();
      if (v !== "") {
        if (!/^\d+$/.test(v)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["activeDurationDays"],
            message: "Введите целое число дней",
          });
        } else {
          const n = Number(v);
          if (n <= 0 || n > 3650) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["activeDurationDays"],
              message: "От 1 до 3650 дней",
            });
          }
        }
      }
    }
    if (vals.bookingEnabled) {
      const v = vals.durationMinutes.trim();
      if (!v) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["durationMinutes"],
          message: "Укажите длительность",
        });
      } else if (!/^\d+$/.test(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["durationMinutes"],
          message: "Введите целое число минут",
        });
      } else {
        const n = Number(v);
        if (n <= 0 || n > 600) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["durationMinutes"],
            message: "От 1 до 600 минут",
          });
        }
      }
      if (vals.slotTypeIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slotTypeIds"],
          message: "Выберите хотя бы один тип слота",
        });
      }
    }
    if (vals.telegramEnabled) {
      if (vals.bookingEnabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telegramEnabled"],
          message:
            "Нельзя одновременно бронирование и Telegram-группу. Выключите одно.",
        });
      }
      if (!vals.telegramGroupId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["telegramGroupId"],
          message: "Выберите группу из списка",
        });
      }
    }
    if (vals.lmsCourseEnabled) {
      if (vals.bookingEnabled || vals.telegramEnabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lmsCourseEnabled"],
          message:
            "Курс нельзя совмещать с бронированием или Telegram. Выключите одно.",
        });
      }
      if (!vals.lmsCourseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lmsCourseId"],
          message: "Выберите курс из списка",
        });
      }
    }
    if (vals.videoEnabled && vals.videoSource === "youtube") {
      const v = vals.videoUrl.trim();
      if (!v) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["videoUrl"],
          message: "Вставьте ссылку на YouTube",
        });
      } else if (
        !/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/i.test(
          v,
        )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["videoUrl"],
          message:
            "Поддерживаются ссылки youtube.com/watch?v=… или youtu.be/…",
        });
      }
    }
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;
