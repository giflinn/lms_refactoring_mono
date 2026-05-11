// Seeds the live product catalog from Zhanna's product list (Apr 2026).
// Idempotent — safe to re-run; matches existing rows by natural keys (category
// name, product title, lms course title, telegram group title) and updates
// fields in place. Existing order_items keep their FK because product UUIDs
// are preserved on update.
//
// Run:
//   npm run seed:catalog
//
// New products without a Telegram group yet (e.g. "Пробуждение") are seeded
// with is_active=false so they don't appear in the mobile catalog until the
// admin attaches the group from the UI.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  lmsCourses,
  productCategories,
  products,
  productSlotTypes,
  slotTypes,
  telegramGroups,
} from "../src/db/schema";

type ProductKind = "booking" | "telegram" | "lms" | "plain";

type ProductSeed = {
  title: string;
  category: string;
  subtitle?: string;
  description: string;
  buttonText: string;
  price: number | null; // tenge whole units; null = "по запросу"
  daysUntilCancel?: number; // default 1
  activeDurationDays?: number | null;
  durationMinutes?: number | null;
  telegramGroupTitle?: string;
  lmsCourseTitle?: string;
  slotTypeNames?: string[];
  isActive?: boolean;
  kind: ProductKind;
};

// ---------------------------------------------------------------------------
// Catalog data (mirrors /Telegram Desktop/для_приложения_продукты_от_23_04_2026.docx)
// ---------------------------------------------------------------------------

const CATEGORY_NAMES = [
  "Продукты Жанны Слямовой",
  "ИНФОПРОДУКТЫ",
  "ТРЕНИНГИ",
  "ПЕЧАТНАЯ ПРОДУКЦИЯ",
  "ЗАРЯЖЕННЫЕ ПРОДУКТЫ",
  "ИНДИВИДУАЛЬНЫЕ КОНСУЛЬТАЦИИ",
  "РЕТРИТЫ",
  "Наставничество",
] as const;

const LMS_COURSES: { title: string; description: string }[] = [
  {
    title: "Генерация энергии",
    description:
      "Марафон по управлению энергией. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
  {
    title: "РОДной ребёнок",
    description:
      "Интенсив по взаимоотношениям с детьми. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
  {
    title: "Миссия Души",
    description:
      "Марафон по определению предназначения и знакомству с Душой. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
  {
    title: "Денежная энергия (марафон)",
    description:
      "Марафон по освоению законов денежной энергии. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
  {
    title: "Рождение жизни",
    description:
      "Марафон для тех, кто не может родить, кто ждёт ребёнка, у кого был выкидыш или аборт. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
  {
    title: "Моя реальность",
    description:
      "Курс генерации мышления, создания денег из воздуха. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
  {
    title: "Я Женщина (мастер-класс)",
    description:
      "Мастер-класс, пробуждающий женственность и гармоничные отношения в паре. Видео, аудио и текстовые материалы для самостоятельного изучения.",
  },
];

const PRODUCTS: ProductSeed[] = [
  // --- "Продукты Жанны Слямовой" ---
  {
    title: "Денежная прокачка (офлайн)",
    category: "Продукты Жанны Слямовой",
    description:
      "Получасовое погружение по расширению канала изобилия. Проходит офлайн — запись на конкретное время.",
    buttonText: "Записаться",
    price: 8000,
    durationMinutes: 30,
    slotTypeNames: ["Денежная прокачка(офлайн)"],
    kind: "booking",
  },
  {
    title: "Денежная прокачка (онлайн)",
    category: "Продукты Жанны Слямовой",
    description:
      "Получасовое погружение по расширению канала изобилия. Проходит онлайн в закрытом Telegram-чате. Доступ к записи — сутки.",
    buttonText: "Получить доступ",
    price: 8000,
    activeDurationDays: 1,
    telegramGroupTitle: "Денежная прокачка (онлайн)",
    kind: "telegram",
  },
  {
    title: "ProСВЕТ",
    category: "Продукты Жанны Слямовой",
    description:
      "Закрытое сообщество для тех, кто хочет легко и комфортно перейти на новый уровень вибраций для масштабного роста и развития. Абонемент на 6 месяцев.",
    buttonText: "Получить доступ",
    price: 120000,
    activeDurationDays: 180,
    telegramGroupTitle: "ProСВЕТ",
    kind: "telegram",
  },
  {
    title: "Пробуждение",
    category: "Продукты Жанны Слямовой",
    description:
      "Предновогодний марафон очищения себя и пространства, исполнения желаний, техник и ритуалов. Доступ через закрытый Telegram-чат — подключение группы выполняет администратор перед запуском марафона.",
    buttonText: "Получить доступ",
    price: 15000,
    activeDurationDays: 30,
    isActive: false, // draft — нет TG-группы; админ привяжет её в UI
    kind: "plain",
  },
  {
    title: "Утренняя медитация",
    category: "Продукты Жанны Слямовой",
    subtitle: "60 минут",
    description:
      "Очищающее и исцеляющее погружение на тонком плане с применением гонга и тибетских чаш. Проходит в утреннее энергетически сильное время. Запись на конкретный слот.",
    buttonText: "Записаться",
    price: 2000,
    durationMinutes: 60,
    slotTypeNames: ["Утренняя медитация"],
    kind: "booking",
  },

  // --- "ИНФОПРОДУКТЫ" — LMS ---
  {
    title: "Генерация энергии",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 3 суток",
    description:
      "Марафон по управлению энергией. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 30000,
    activeDurationDays: 3,
    lmsCourseTitle: "Генерация энергии",
    kind: "lms",
  },
  {
    title: "РОДной ребёнок",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 7 дней",
    description:
      "Интенсив по взаимоотношениям с детьми. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 50000,
    activeDurationDays: 7,
    lmsCourseTitle: "РОДной ребёнок",
    kind: "lms",
  },
  {
    title: "Миссия Души",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 7 дней",
    description:
      "Марафон по определению предназначения, знакомство с Душой. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 50000,
    activeDurationDays: 7,
    lmsCourseTitle: "Миссия Души",
    kind: "lms",
  },
  {
    title: "Денежная энергия (марафон)",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 7 дней",
    description:
      "Марафон по освоению законов денежной энергии. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 50000,
    activeDurationDays: 7,
    lmsCourseTitle: "Денежная энергия (марафон)",
    kind: "lms",
  },
  {
    title: "Рождение жизни",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 6 дней",
    description:
      "Марафон для тех, кто не может родить, кто ждёт ребёнка, у кого был выкидыш или аборт. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 50000,
    activeDurationDays: 6,
    lmsCourseTitle: "Рождение жизни",
    kind: "lms",
  },
  {
    title: "Моя реальность",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 7 дней",
    description:
      "Курс генерации мышления, создания денег из воздуха. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 50000,
    activeDurationDays: 7,
    lmsCourseTitle: "Моя реальность",
    kind: "lms",
  },
  {
    title: "Я Женщина (мастер-класс)",
    category: "ИНФОПРОДУКТЫ",
    subtitle: "Длительность — 12 дней",
    description:
      "Мастер-класс, пробуждающий женственность и гармоничные отношения в паре. Видео, аудио и текстовые материалы для самостоятельного изучения.",
    buttonText: "Открыть курс",
    price: 50000,
    activeDurationDays: 12,
    lmsCourseTitle: "Я Женщина (мастер-класс)",
    kind: "lms",
  },

  // --- "ТРЕНИНГИ" ---
  {
    title: "Денежная энергия (тренинг)",
    category: "ТРЕНИНГИ",
    description:
      "Тренинг о законах денег и об управлении денежной энергией. Офлайн встреча — запись на конкретные дату и время через менеджера.",
    buttonText: "Записаться через менеджера",
    price: 50000,
    kind: "plain",
  },
  {
    title: "Я Женщина (тренинг)",
    category: "ТРЕНИНГИ",
    description:
      "Тренинг, пробуждающий женственность, яркие чувства между мужчиной и женщиной, укрепляющий отношения. Офлайн встреча — запись через менеджера.",
    buttonText: "Записаться через менеджера",
    price: 80000,
    kind: "plain",
  },

  // --- "ПЕЧАТНАЯ ПРОДУКЦИЯ" ---
  {
    title: "Книга «Денежная энергия»",
    category: "ПЕЧАТНАЯ ПРОДУКЦИЯ",
    description:
      "На русском и казахском языках. Учит законам денег, управлению денежной энергией; заменяет негативные денежные установки на позитивные. Содержит теоретическую и практическую части.",
    buttonText: "Купить",
    price: 10000,
    kind: "plain",
  },
  {
    title: "Книга «Я Женщина»",
    category: "ПЕЧАТНАЯ ПРОДУКЦИЯ",
    description:
      "На русском и казахском языках. Раскрывает ценность женщины, показывает путь к счастливым отношениям. Содержит теоретическую и практическую части.",
    buttonText: "Купить",
    price: 20000,
    kind: "plain",
  },
  {
    title: "Блокнот Благодарности",
    category: "ПЕЧАТНАЯ ПРОДУКЦИЯ",
    description:
      "Пробуждает внутреннее изобилие, учит правильно взаимодействовать со Вселенной, открывает сердце.",
    buttonText: "Купить",
    price: 20000,
    kind: "plain",
  },
  {
    title: "Чековая книжка Вселенского Банка Изобилия",
    category: "ПЕЧАТНАЯ ПРОДУКЦИЯ",
    description:
      "Эзотерическая техника, помогающая привлечь необходимую сумму для конкретной цели. В книжке 12 чеков на целый год.",
    buttonText: "Купить",
    price: 15000,
    kind: "plain",
  },
  {
    title: "Карта Желаний",
    category: "ПЕЧАТНАЯ ПРОДУКЦИЯ",
    description:
      "Инструмент, помогающий воплотить желания в реальность.",
    buttonText: "Купить",
    price: 25000,
    kind: "plain",
  },

  // --- "ЗАРЯЖЕННЫЕ ПРОДУКТЫ" ---
  {
    title: "Браслет из натуральных камней",
    category: "ЗАРЯЖЕННЫЕ ПРОДУКТЫ",
    description:
      "Талисман-оберег, приносящий удачу, замужество, защиту и новые возможности.",
    buttonText: "Купить",
    price: 20000,
    kind: "plain",
  },
  {
    title: "Монеты на Деньги, Любовь, Успех",
    category: "ЗАРЯЖЕННЫЕ ПРОДУКТЫ",
    description:
      "Талисман, который хранится в кошельке и генерирует соответствующие монетам энергии.",
    buttonText: "Купить",
    price: 5000,
    kind: "plain",
  },
  {
    title: "Маккарты",
    category: "ЗАРЯЖЕННЫЕ ПРОДУКТЫ",
    description:
      "Инструмент самопознания, помогающий понять своё внутреннее состояние и получить подсказку от карт.",
    buttonText: "Купить",
    price: 50000,
    kind: "plain",
  },

  // --- "ИНДИВИДУАЛЬНЫЕ КОНСУЛЬТАЦИИ" ---
  {
    title: "ВИП-встреча",
    category: "ИНДИВИДУАЛЬНЫЕ КОНСУЛЬТАЦИИ",
    description:
      "Индивидуальная диагностика, рекомендации, ответы на все запросы. Офлайн встреча — запись на конкретные дату и время через менеджера.",
    buttonText: "Записаться через менеджера",
    price: 80000,
    kind: "plain",
  },
  {
    title: "Индивидуальная живая сессия",
    category: "ИНДИВИДУАЛЬНЫЕ КОНСУЛЬТАЦИИ",
    description:
      "Двухчасовая консультация с проработками по нескольким запросам, проходит офлайн и онлайн. По вопросам сессии обращайтесь к менеджеру.",
    buttonText: "Связаться с менеджером",
    price: null,
    kind: "plain",
  },

  // --- "РЕТРИТЫ" ---
  {
    title: "Городской ретрит",
    category: "РЕТРИТЫ",
    description:
      "Внутренняя перезагрузка и эмоциональное восстановление вне города на определённую тему. По вопросам ретрита обращайтесь к менеджеру.",
    buttonText: "Связаться с менеджером",
    price: null,
    kind: "plain",
  },
  {
    title: "Ретрит по святым местам",
    category: "РЕТРИТЫ",
    description:
      "Паломничество по святым местам: освобождение от ненужных программ, блоков, сглаза, порчи; внутренние проработки; благословение от РОДа и святых; заряд Души под открытым энергетическим порталом. По вопросам ретрита обращайтесь к менеджеру.",
    buttonText: "Связаться с менеджером",
    price: null,
    kind: "plain",
  },

  // --- "Наставничество" ---
  {
    title: "Индивидуальное годовое наставничество",
    category: "Наставничество",
    description:
      "Годовое сопровождение Жанны во всех сферах жизни, особенно финансовой. Включает диагностики, сессию с проработками, живые встречи с разбором. По вопросам наставничества обращайтесь к менеджеру.",
    buttonText: "Связаться с менеджером",
    price: null,
    kind: "plain",
  },
];

// ---------------------------------------------------------------------------

async function upsertCategory(name: string): Promise<string> {
  const [existing] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(eq(productCategories.name, name))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(productCategories)
    .values({ name })
    .returning({ id: productCategories.id });
  console.log(`  + category "${name}"`);
  return created.id;
}

async function deleteCategoryIfUnused(name: string): Promise<void> {
  const [cat] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(eq(productCategories.name, name))
    .limit(1);
  if (!cat) return;
  const linked = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, cat.id))
    .limit(1);
  if (linked.length > 0) {
    console.log(`  ! skip delete category "${name}" — has products`);
    return;
  }
  await db.delete(productCategories).where(eq(productCategories.id, cat.id));
  console.log(`  - deleted category "${name}"`);
}

async function findLmsCourseId(title: string): Promise<string | null> {
  const [row] = await db
    .select({ id: lmsCourses.id })
    .from(lmsCourses)
    .where(and(eq(lmsCourses.title, title), isNull(lmsCourses.archivedAt)))
    .limit(1);
  return row?.id ?? null;
}

// Rename the placeholder "Второй курс" → "Генерация энергии" so the existing
// course (already linked from the existing "Генерация энергии" product) gets
// a sensible title without breaking the FK.
async function renamePlaceholderCourse(): Promise<void> {
  const [secondCourse] = await db
    .select({ id: lmsCourses.id })
    .from(lmsCourses)
    .where(eq(lmsCourses.title, "Второй курс"))
    .limit(1);
  if (!secondCourse) return;
  const existingTarget = await findLmsCourseId("Генерация энергии");
  if (existingTarget && existingTarget !== secondCourse.id) {
    console.log(
      `  ! "Генерация энергии" already exists; leaving "Второй курс" alone`,
    );
    return;
  }
  await db
    .update(lmsCourses)
    .set({
      title: "Генерация энергии",
      description: LMS_COURSES[0].description,
      updatedAt: new Date(),
    })
    .where(eq(lmsCourses.id, secondCourse.id));
  console.log(`  ~ renamed lms course "Второй курс" → "Генерация энергии"`);
}

async function deletePlaceholderCourseIfUnused(title: string): Promise<void> {
  const [course] = await db
    .select({ id: lmsCourses.id })
    .from(lmsCourses)
    .where(eq(lmsCourses.title, title))
    .limit(1);
  if (!course) return;
  const linked = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.lmsCourseId, course.id))
    .limit(1);
  if (linked.length > 0) {
    console.log(`  ! skip delete course "${title}" — linked to product`);
    return;
  }
  await db.delete(lmsCourses).where(eq(lmsCourses.id, course.id));
  console.log(`  - deleted course "${title}"`);
}

async function upsertLmsCourse(title: string, description: string): Promise<string> {
  const existing = await findLmsCourseId(title);
  if (existing) {
    await db
      .update(lmsCourses)
      .set({ description, updatedAt: new Date() })
      .where(eq(lmsCourses.id, existing));
    return existing;
  }
  const [created] = await db
    .insert(lmsCourses)
    .values({ title, description })
    .returning({ id: lmsCourses.id });
  console.log(`  + lms course "${title}"`);
  return created.id;
}

async function findTelegramGroupId(title: string): Promise<string | null> {
  const [row] = await db
    .select({ id: telegramGroups.id })
    .from(telegramGroups)
    .where(and(eq(telegramGroups.title, title), isNull(telegramGroups.archivedAt)))
    .limit(1);
  return row?.id ?? null;
}

async function findSlotTypeId(name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: slotTypes.id })
    .from(slotTypes)
    .where(and(eq(slotTypes.name, name), isNull(slotTypes.archivedAt)))
    .limit(1);
  return row?.id ?? null;
}

async function upsertProduct(
  seed: ProductSeed,
  categoryIds: Map<string, string>,
): Promise<void> {
  const categoryId = categoryIds.get(seed.category);
  if (!categoryId) throw new Error(`missing category "${seed.category}"`);

  let telegramGroupId: string | null = null;
  if (seed.telegramGroupTitle) {
    telegramGroupId = await findTelegramGroupId(seed.telegramGroupTitle);
    if (!telegramGroupId) {
      throw new Error(
        `telegram group "${seed.telegramGroupTitle}" not found — create it in admin first`,
      );
    }
  }

  let lmsCourseId: string | null = null;
  if (seed.lmsCourseTitle) {
    lmsCourseId = await findLmsCourseId(seed.lmsCourseTitle);
    if (!lmsCourseId) {
      throw new Error(`lms course "${seed.lmsCourseTitle}" not found`);
    }
  }

  const slotTypeIds: string[] = [];
  for (const name of seed.slotTypeNames ?? []) {
    const id = await findSlotTypeId(name);
    if (!id) throw new Error(`slot_type "${name}" not found`);
    slotTypeIds.push(id);
  }

  const priceStr = seed.price === null ? null : seed.price.toFixed(2);

  const payload = {
    categoryId,
    title: seed.title,
    subtitle: seed.subtitle ?? null,
    description: seed.description,
    buttonText: seed.buttonText,
    price: priceStr,
    daysUntilCancel: seed.daysUntilCancel ?? 1,
    activeDurationDays: seed.activeDurationDays ?? null,
    durationMinutes: seed.durationMinutes ?? null,
    telegramGroupId,
    lmsCourseId,
    isActive: seed.isActive ?? true,
  };

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.title, seed.title))
    .limit(1);

  let productId: string;
  if (existing) {
    await db
      .update(products)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(products.id, existing.id));
    productId = existing.id;
    console.log(`  ~ product "${seed.title}"`);
  } else {
    const [created] = await db
      .insert(products)
      .values(payload)
      .returning({ id: products.id });
    productId = created.id;
    console.log(`  + product "${seed.title}"`);
  }

  // Sync product_slot_types: clear existing rows then re-insert. Simpler than
  // diffing — the table is small and seeds are infrequent.
  await db
    .delete(productSlotTypes)
    .where(eq(productSlotTypes.productId, productId));
  for (const slotTypeId of slotTypeIds) {
    await db.insert(productSlotTypes).values({ productId, slotTypeId });
  }
}

async function main() {
  console.log("Categories:");
  const categoryIds = new Map<string, string>();
  for (const name of CATEGORY_NAMES) {
    categoryIds.set(name, await upsertCategory(name));
  }
  await deleteCategoryIfUnused("First");

  console.log("LMS courses:");
  await renamePlaceholderCourse();
  await deletePlaceholderCourseIfUnused("Первый курс");
  for (const course of LMS_COURSES) {
    await upsertLmsCourse(course.title, course.description);
  }

  console.log("Products:");
  for (const seed of PRODUCTS) {
    await upsertProduct(seed, categoryIds);
  }

  console.log(`\nDone. ${PRODUCTS.length} products in catalog seed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
