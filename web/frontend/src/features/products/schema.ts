import { z } from "zod";

// Price is typed by the user as integer tenge (no kopecks). An empty string
// means "по запросу" — handled outside the schema so the user-visible
// validation only fires on actual numeric input.
const PRICE_RE = /^\d{1,10}$/;

export const productFormSchema = z
  .object({
    categoryId: z.string().min(1, "Выберите категорию"),
    title: z.string().trim().min(1, "Введите название").max(120),
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
    isPromo: z.boolean(),
    isActive: z.boolean(),
    isTopSearch: z.boolean(),
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
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;
