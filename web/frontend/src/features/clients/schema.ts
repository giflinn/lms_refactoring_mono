import { z } from "zod";
import { PHONE_RE } from "../../lib/validation";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const clientFormSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "Введите телефон")
    .regex(PHONE_RE, "Введите номер в формате +7…"),
  birthDate: z
    .string()
    .trim()
    .refine((v) => v === "" || ISO_DATE_RE.test(v), "Неверная дата"),
  comment: z.string(),
  managerId: z.string().min(1, "Выберите менеджера"),
  clientCategory: z.enum(["new", "regular", "vip"]),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;
