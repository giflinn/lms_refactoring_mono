export type Fields = {
  name?: string;
  color?: string;
  slotTypeId?: string;
  startsAt?: string;
  endsAt?: string;
};

export type MappedError = {
  fields: Fields;
  general?: string;
};

const FIELD_MESSAGES: Record<string, { field: keyof Fields; message: string }> = {
  name_required: { field: "name", message: "Введите название." },
  name_too_long: { field: "name", message: "Название слишком длинное." },
  invalid_color: { field: "color", message: "Введите цвет в формате #RRGGBB." },
  slot_type_id_required: {
    field: "slotTypeId",
    message: "Выберите тип слота.",
  },
  invalid_date: { field: "startsAt", message: "Некорректная дата." },
  invalid_range: {
    field: "endsAt",
    message: "Время окончания должно быть позже начала.",
  },
  starts_in_past: {
    field: "startsAt",
    message: "Слот должен начинаться в будущем.",
  },
};

const GENERAL_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав для этого действия.",
  name_already_exists: "Тип с таким названием уже существует.",
  slot_type_not_found: "Тип слота не найден.",
  slot_type_archived: "Этот тип слота архивирован — выберите другой.",
  slot_not_found: "Слот не найден.",
  slot_cancelled: "Слот уже отменён.",
  slot_overlap: "В это время уже есть другой слот.",
  invalid_sort_order: "Некорректный порядок сортировки.",
  no_fields_to_update: "Нет изменений.",
  unknown_error: "Что-то пошло не так. Попробуйте ещё раз.",
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
