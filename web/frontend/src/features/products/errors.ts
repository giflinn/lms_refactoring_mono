export type Fields = {
  categoryId?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  buttonText?: string;
  price?: string;
  daysUntilCancel?: string;
  activeDurationDays?: string;
  durationMinutes?: string;
  slotTypeIds?: string;
  coverFile?: string;
};

export type MappedError = {
  fields: Fields;
  general?: string;
};

const FIELD_MESSAGES: Record<string, { field: keyof Fields; message: string }> = {
  category_required: { field: "categoryId", message: "Выберите категорию." },
  category_not_found: { field: "categoryId", message: "Категория не найдена." },
  title_required: { field: "title", message: "Введите название." },
  title_too_long: { field: "title", message: "Название слишком длинное." },
  subtitle_too_long: { field: "subtitle", message: "Подпись слишком длинная." },
  description_required: { field: "description", message: "Введите описание." },
  description_too_long: {
    field: "description",
    message: "Описание слишком длинное.",
  },
  button_text_required: { field: "buttonText", message: "Введите текст кнопки." },
  button_text_too_long: {
    field: "buttonText",
    message: "Текст кнопки слишком длинный.",
  },
  invalid_price: {
    field: "price",
    message: "Введите цену в тенге (или оставьте пустым).",
  },
  days_until_cancel_required: {
    field: "daysUntilCancel",
    message: "Укажите количество дней.",
  },
  invalid_days_until_cancel: {
    field: "daysUntilCancel",
    message: "Введите целое число от 0 до 365.",
  },
  invalid_active_duration_days: {
    field: "activeDurationDays",
    message: "Введите целое число дней (1–3650) или оставьте пустым.",
  },
  invalid_duration_minutes: {
    field: "durationMinutes",
    message: "Длительность должна быть от 1 до 600 минут.",
  },
  invalid_slot_type_ids: {
    field: "slotTypeIds",
    message: "Не удалось разобрать список типов слотов.",
  },
  slot_types_required: {
    field: "slotTypeIds",
    message: "Выберите хотя бы один тип слота.",
  },
  slot_type_archived: {
    field: "slotTypeIds",
    message: "Один из выбранных типов архивирован — обновите выбор.",
  },
  slot_type_not_found: {
    field: "slotTypeIds",
    message: "Тип слота не найден — обновите страницу.",
  },
  cover_file_required: {
    field: "coverFile",
    message: "Загрузите изображение.",
  },
  cover_kind_required: {
    field: "coverFile",
    message: "Выберите вариант обложки.",
  },
  invalid_cover_kind: {
    field: "coverFile",
    message: "Неизвестный тип обложки.",
  },
};

const GENERAL_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав для этого действия.",
  product_not_found: "Товар не найден.",
  booking_fields_must_pair:
    "Длительность и типы слотов нужно сохранять вместе.",
  category_has_products:
    "В категории есть товары — перенесите их в другую категорию или удалите.",
  name_required: "Введите название.",
  name_too_long: "Название слишком длинное.",
  name_already_exists: "Категория с таким названием уже существует.",
  category_not_found: "Категория не найдена.",
  unsupported_mime_type: "Поддерживаются только JPEG, PNG и WebP.",
  LIMIT_FILE_SIZE: "Файл слишком большой (максимум 5 МБ).",
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
