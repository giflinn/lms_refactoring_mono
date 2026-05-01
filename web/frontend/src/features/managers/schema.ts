import { z } from "zod";
import { EMAIL_RE, PHONE_RE } from "../../lib/validation";

export const managerFormSchema = z.object({
  firstName: z.string().trim().min(1, "Введите имя"),
  lastName: z.string().trim().min(1, "Введите фамилию"),
  email: z
    .string()
    .trim()
    .min(1, "Введите email")
    .regex(EMAIL_RE, "Введите корректный email"),
  phone: z
    .string()
    .trim()
    .min(1, "Введите телефон")
    .regex(PHONE_RE, "Введите номер в формате +7…"),
  comment: z.string(),
  isSenior: z.boolean(),
});

export type ManagerFormValues = z.infer<typeof managerFormSchema>;
