// Maps backend error codes for the managers API into user-facing Russian
// messages. Codes that aren't field-specific are bucketed under `general`.

const FIELD_MESSAGES: Record<string, { field: keyof Fields; message: string }> = {
  invalid_email: { field: "email", message: "Введите корректный email." },
  email_already_exists: { field: "email", message: "Email уже занят." },
  invalid_phone: {
    field: "phone",
    message: "Введите номер в формате +7…",
  },
  name_required: { field: "firstName", message: "Заполните имя и фамилию." },
};

const GENERAL_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав для этого действия.",
  forbidden_role_target:
    "Вы не можете управлять этим пользователем (нужны права администратора).",
  cannot_act_on_self: "Это действие нельзя применить к себе.",
  cannot_deactivate_self: "Вы не можете деактивировать себя.",
  last_active_staff:
    "Нельзя деактивировать последнего активного сотрудника.",
  manager_not_found: "Менеджер не найден.",
  email_send_failed:
    "Не удалось отправить письмо. Попробуйте ещё раз.",
  network_error: "Нет соединения с сервером.",
  unknown_error: "Что-то пошло не так. Попробуйте ещё раз.",
};

export type Fields = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  comment?: string;
};

export type MappedError = {
  fields: Fields;
  general?: string;
};

export function mapError(code: string): MappedError {
  const field = FIELD_MESSAGES[code];
  if (field) {
    return { fields: { [field.field]: field.message } };
  }
  return { fields: {}, general: GENERAL_MESSAGES[code] ?? GENERAL_MESSAGES.unknown_error };
}
