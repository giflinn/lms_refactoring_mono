const FIELD_MESSAGES: Record<string, { field: keyof Fields; message: string }> = {
  invalid_phone: { field: "phone", message: "Введите номер в формате +7…" },
  invalid_birth_date: { field: "birthDate", message: "Неверная дата." },
  invalid_client_category: {
    field: "clientCategory",
    message: "Неизвестная категория.",
  },
  manager_required: { field: "managerId", message: "Выберите менеджера." },
  manager_not_found: { field: "managerId", message: "Менеджер не найден." },
};

const GENERAL_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав для этого действия.",
  forbidden_assignment:
    "Только администратор или главный менеджер может менять менеджера клиента.",
  client_not_found: "Клиент не найден.",
  network_error: "Нет соединения с сервером.",
  unknown_error: "Что-то пошло не так. Попробуйте ещё раз.",
};

export type Fields = {
  phone?: string;
  birthDate?: string;
  managerId?: string;
  clientCategory?: string;
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
  return {
    fields: {},
    general: GENERAL_MESSAGES[code] ?? GENERAL_MESSAGES.unknown_error,
  };
}
