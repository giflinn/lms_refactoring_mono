# ТЗ: In-App Purchase (IAP) для цифровых товаров на iOS

Статус: черновик к реализации. Дата: 2026-06-30. Автор-исполнитель: Claude.
Это рабочий план под мою же реализацию — пишу подробно и с якорями на файлы.

## 0. Решение и стратегия (заменяет предыдущий access-only вариант)

Apple отклонила сборку по **3.1.1**: цифра (LMS-курсы, Telegram-доступ)
продавалась через BCC/Kaspi. Витрина — Казахстан, где внешняя оплата цифры
запрещена. **Выбран путь: добавить StoreKit In-App Purchase.**

Маршрутизация оплаты по типу товара (`is_digital`):

| Тип | `is_digital` | iOS оплата | Android/Web оплата |
|---|---|---|---|
| LMS-курс, Telegram-доступ, цифровой файл | `true` | **IAP (StoreKit)** | BCC/Kaspi (как сейчас) |
| Физический товар | `false` | BCC/Kaspi | BCC/Kaspi |
| Консультация/наставничество **1:1** | `false` | BCC/Kaspi (3.1.3(d) разрешает) | BCC/Kaspi |

> **ЖЕЛЕЗНОЕ ПРАВИЛО (иначе повторный реджект 3.1.1):** для товара `is_digital=true`
> на **iOS** в приложении показывается **только** IAP. Kaspi/BCC-кнопки для цифры
> на iOS НЕ показываются — ни как основной, ни как альтернативный способ.
> Ручная Kaspi-оплата цифры допустима только **вне приложения** (менеджер шлёт
> ссылку, клиент платит, менеджер вручную ставит заказу `paid` в админке).

Флаг `is_digital` — **ручной**, без авто-вывода из привязки курса/Telegram и без
CHECK-связки. Существующие товары на проде проставим `true` разово руками.

`is_digital=true` на **Android** ничего не меняет (продаётся как сейчас).
Примечание: у Google Play есть аналогичное правило (Play Billing для цифры) — это
вне рамок данного ТЗ, отдельный разговор.

## 1. Жизненный цикл покупки цифры на iOS (целевой флоу)

```
1. Юзер: «В корзину» → checkout (корзина на iOS = только цифра ИЛИ только не-цифра, см. §6).
2. App → POST /orders → заказ создаётся payment_status='pending', fulfillment='new'. Возвращает orderId.   ← «неоплаченный заказ ДО IAP»
3. App → StoreKit purchase(product.iosIapProductId) через in_app_purchase.
4. StoreKit success → App → POST /payments/apple/verify { orderId, transactionId }.
5. Backend: верифицирует транзакцию (App Store Server API), сверяет product_id с заказом, идемпотентность по transactionId.
6. Backend: apple_iap_transactions(status='paid') + changeOrderPaymentStatus(orderId,'paid',null) → fulfillment 'active' → грант доступа (существующий путь LMS/Telegram).
7. App: completePurchase(finishTransaction) ТОЛЬКО после успешного шага 6.
8. Асинхронно: App Store Server Notifications V2 (REFUND/REVOKE) → changeOrderPaymentStatus(orderId,'refunded') → revoke доступа.
```

«Заказ создаётся неоплаченным до IAP» (шаг 2) — это и есть требование заказчика:
если IAP не завершён, заказ остаётся `pending`, и менеджер может вручную
перевести его в `paid` (например, клиент оплатил Kaspi вне приложения).

## 2. App Store Connect / ops (предусловие, делает владелец аккаунта)

1. Вступить в **App Store Small Business Program** → комиссия 15% (порог $1M/год).
2. Завести **IAP-продукт типа Consumable** на каждый цифровой SKU (≈9 шт сейчас:
   7 курсов + 2 Telegram). Consumable, потому что:
   - доступ часто временный (`active_duration_days`) и перепокупаемый;
   - право доступа храним на сервере (по заказам), не по чеку Apple → «restore» не нужен.
   - product_id вида `kz.zhannaslyamova.lms.<slug>`.
3. Выставить ценовой tier каждому IAP-продукту. Apple показывает свою цену в
   валюте юзера; наш тенге-`price` для iOS-цифры не используется. Чтобы получить
   на руки ту же сумму после 15% — tier ≈ **×1.176** от тенге-цены.
4. Сгенерировать ключ **App Store Server API**: Issuer ID + Key ID + `.p8`.
5. Указать URL вебхука **App Store Server Notifications V2** → `/api/payments/apple/notifications`.
6. IAP-продукты отправляются на ревью **вместе со сборкой**; демо-аккаунт должен
   уметь пройти покупку в **Sandbox** (ревьюеры платят в песочнице).

> Операционная нагрузка: каждый **новый** цифровой курс требует завести новый
> IAP-продукт в ASC и вписать его `product_id` в товар (поле `ios_iap_product_id`).
> Автосоздание не делаем (ASC API тяжёлый, ~9 SKU — заводим руками).

## 3. Модель данных (`web/backend/src/db/schema.ts`)

### 3.1 products (таблица 131-213)
- `isDigital: boolean("is_digital").notNull().default(false)` — ручной флаг.
- `iosIapProductId: text("ios_iap_product_id")` — nullable; ASC product_id для iOS.
- **Никаких** новых CHECK-связок с fulfillment-видами (по требованию — флаг ручной).

### 3.2 enum оплаты (555)
- `paymentMethodEnum` → добавить `"apple_iap"`: `["kaspi","card","apple_iap"]`.

### 3.3 новая таблица `apple_iap_transactions`
`payment_transactions` (714-753) жёстко BCC-форменная (`bccOrder`/`nonce` notNull
unique) — не переиспользуем. Заводим отдельную, по образцу:
```ts
export const appleIapTransactions = pgTable("apple_iap_transactions", {
  id: uuid().primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  transactionId: text("transaction_id").notNull().unique(),       // идемпотентность
  originalTransactionId: text("original_transaction_id"),
  productId: text("product_id").notNull(),                         // ASC product_id
  environment: text("environment").notNull(),                      // 'Production' | 'Sandbox'
  status: appleIapStatusEnum("status").notNull().default("paid"),  // paid | refunded
  rawTransaction: jsonb("raw_transaction").$type<Record<string, unknown>>(),
  createdAt, updatedAt,
}, (t) => [ index().on(t.orderId), index().on(t.transactionId) ]);
```
+ `appleIapStatusEnum = pgEnum("apple_iap_status", ["paid","refunded"])`.

### 3.4 миграция
`npm run db:generate` локально → `db:migrate`. `is_digital` default false; флаги
существующих товаров на проде проставит заказчик руками (или через админ-форму).

## 4. Backend — конфиг и сервисы

### 4.1 config / env (`src/config.ts` + `.env.example`)
- `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`, `APPLE_IAP_PRIVATE_KEY` (содержимое .p8),
  `APPLE_IAP_BUNDLE_ID` (`kz.zhannaslyamova.lms.ios`).
- Все читать только в `config.ts` (правило проекта).

### 4.2 `services/apple/appStoreServer.ts`
- Использовать официальную либу **`app-store-server-library`** (Node) — она делает
  JWT ES256, вызов App Store Server API и проверку JWS-подписей (включая
  нотификации). Не хэндрайтить крипту.
- `getTransactionInfo(transactionId)` → `GET /inApps/v1/transactions/{id}`; вернуть
  декодированный + проверенный `JWSTransactionDecodedPayload` (productId,
  originalTransactionId, environment, bundleId, ...).
- Окружение: пробовать Production, при `4040010` (transaction not found) — Sandbox.

### 4.3 `services/apple/settle.ts` (зеркало `bcc/settle.ts`)
```
settleAppleIap(orderId, verifiedTx): 
  upsert apple_iap_transactions (guard на transaction_id unique → идемпотентно)
  changeOrderPaymentStatus(orderId, 'paid', null)         // orderStatus.ts:60
  // + проставить orders.paymentMethod='apple_iap'
```
`changeOrderPaymentStatus` уже делает firstPaidAt, expires_at, fulfillment→active,
гранты (LMS/Telegram). Переиспользуем как есть.

### 4.4 `routes/applePayments.ts`
- `POST /payments/apple/verify` (requireAuth):
  - body `{ orderId, transactionId }`; заказ принадлежит `req.uid`.
  - заказ содержит цифровой товар; `verifiedTx.productId === product.iosIapProductId`;
    `bundleId === APPLE_IAP_BUNDLE_ID`.
  - `settleAppleIap(...)`; вернуть актуальный статус заказа.
  - ошибки: `{error:"apple_tx_invalid"|"apple_tx_product_mismatch"|"order_not_found"}`.
- `POST /payments/apple/notifications` (без auth; вебхук Apple):
  - распарсить `signedPayload` (JWS) либой; по `notificationType`:
    `REFUND`/`REVOKE` → apple_iap_transactions='refunded' +
    `changeOrderPaymentStatus(orderId,'refunded',null)` (каскад → fulfillment
    cancelled → revoke Telegram/LMS существующим путём). Остальные — лог и 200.
- зарегистрировать роутер в `index.ts`.

### 4.5 платформа и серверные гарды
- middleware `platformDetect`: читать `X-Client-Platform` → `req.clientPlatform`
  ('ios'|'android'|undefined). Расширить `Express.Request` (auth.ts 4-11), повесить
  app-level в `index.ts`. Прецедент парсинга платформы — `routes/feedback.ts`.
- **BCC-init гард** (`routes/payments.ts`, старт BCC-платежа): если заказ содержит
  `is_digital=true` и `req.clientPlatform==='ios'` → `400 {error:"digital_requires_iap"}`.
  Это запрещает оплатить цифру картой/Kaspi с iOS.
- **mixed-cart гард** (`services/orderCreate.ts`, валидация 75-105): при
  `clientPlatform==='ios'` запретить заказ, где есть и цифровой, и не-цифровой
  товар одновременно (`{error:"mixed_cart_not_allowed_ios"}`) — разные рельсы оплаты.

### 4.6 каталог и CRUD товара
- `clientCatalog.ts` serialize (42-70): добавить `isDigital`, `iosIapProductId`.
  Цифру из iOS-каталога **НЕ** прячем (продаём через IAP).
- `products.ts`: `CreateInput`+`parseBody` принять `is_digital` (parseBool) и
  `ios_iap_product_id`; serialize (69-106) вернуть оба; POST/PATCH — сохранить.
  Никакой авто-логики/принудиловки — флаг как пришёл.

## 5. Админка (`web/frontend/src/features/products`)
- `schema.ts`: `isDigital: z.boolean()`, `iosIapProductId: z.string()`.
- `ProductFormDrawer.tsx`:
  - `EMPTY` (~45-57): `isDigital:false`, `iosIapProductId:""`.
  - `reset()` (146-178): из `product.isDigital` / `product.iosIapProductId`.
  - UI: простой `ToggleField` **«Цифровой товар»** в ряду с «Активный/Акция»
    (406-422) — всегда редактируемый, без блокировок.
  - текстовое поле **«iOS IAP product ID»** — показывать, когда `isDigital=true`
    (подсказка: должен совпадать с product_id в App Store Connect).
  - `buildPayload` (303-343): прокинуть `isDigital`, `iosIapProductId` как есть.
- `api.ts`: добавить поля в `Product` (30-72) и `ProductInput` (82-), а также в
  сборку FormData.

## 6. Mobile (Flutter)
- pubspec: добавить `in_app_purchase` (официальный плагин).
- `core/network/api_client.dart` `_headers` (96-98): добавить
  `'X-Client-Platform': Platform.isIOS ? 'ios':'android'` (import dart:io).
- `features/catalog/domain/product.dart`: добавить `isDigital`, `iosIapProductId`.
- Цена на iOS для цифры — показывать **локализованную цену из StoreKit**
  (`ProductDetails.price`), не тенге. `widgets/product_action_bar.dart` (цена 116).
- Корзина: на iOS не давать смешивать цифру и не-цифру в одном чекауте (см. §4.5).
- Чекаут (`features/cart/.../payment_method_sheet.dart`):
  - всегда сначала `OrdersApi.createOrder` (заказ pending).
  - **ветка iOS + цифра:** запустить `in_app_purchase` для `iosIapProductId` →
    на success `POST /payments/apple/verify {orderId, transactionId}` → при `paid`
    показать успех; затем `completePurchase`. **Не показывать Kaspi/BCC.**
    Обработать pending/restored-транзакции плагина (дозавершить verify+complete).
  - **ветка iOS + физика/1:1, и весь Android:** существующий BCC/Kaspi флоу.
- Просмотр купленного (курсы `course_detail_page.dart`/`lesson_page.dart` в
  `ScreenProtected`, открытие из `client_order_detail_page.dart`) — **не трогаем**.
- Чистка: `Тестовый товар` (100₸) скрыть/удалить в админке.

## 7. App Store Connect / переотправка
- Поднять версию/билд; собрать с `--dart-define=API_URL=https://app.zhannaslyamova.net/api`.
- IAP-продукты отправить на ревью вместе со сборкой.
- Демо-аккаунт `apple-review@…` должен проходить покупку в Sandbox и иметь доступ к
  купленному курсу.
- Review Notes: «Digital courses/Telegram access are sold via In-App Purchase.
  Physical goods and 1:1 personal services are paid by card (consumed outside the
  app), per 3.1.3(d)/(e).»

## 8. Критерии приёмки (проверяемые)
- [ ] iOS: цифровой товар → в чекауте **только** IAP; Kaspi/BCC не предлагаются.
- [ ] iOS: успешный IAP → заказ `paid`, доступ к курсу/Telegram выдан (существующий грант).
- [ ] iOS: `POST /payments/apple/verify` идемпотентен (повторный transactionId — no-op).
- [ ] iOS: старт BCC-платежа для цифры → `400 digital_requires_iap`.
- [ ] iOS: смешанная корзина (цифра+физика) → `400 mixed_cart_not_allowed_ios`.
- [ ] iOS: физтовар/1:1-услуга → BCC-оплата работает как раньше.
- [ ] App Store Server Notification REFUND → заказ `refunded`, доступ отозван.
- [ ] Заказ создаётся `pending` до IAP; менеджер может вручную перевести в `paid`.
- [ ] Android/web: продажа цифры через BCC/Kaspi не изменилась.
- [ ] Админ: ручной тумблер «Цифровой товар» + поле IAP product ID сохраняются.

## 9. Решения, которые я принял (подтверди или поправь)
1. **Тип IAP — Consumable** (перепокупаемо, право доступа на сервере, без restore).
   Альтернатива — Non-consumable (для строго бессрочных курсов). Беру Consumable для всех.
2. **Native-стек:** Flutter `in_app_purchase` + Node `app-store-server-library`.
   Не RevenueCat (не плодим стороннего биллинг-посредника — в духе проекта).
3. **Mixed-cart на iOS запрещён** (цифра и физика — разными чекаутами).
4. **Per-SKU IAP-продукты** заводятся в ASC вручную; новый курс = новый IAP-продукт
   + заполнить `ios_iap_product_id`. (≈9 SKU сейчас.)
5. Тенге-цена цифры на iOS не показывается — показывается цена Apple-tier.

## 11. Статус реализации (ветка `feat/ios-iap`)

**Код готов и собирается** (backend `tsc` + тесты, `flutter analyze`, frontend `tsc` — всё зелёное). Прошёл adversarial-ревью (5 линз); Android-safety и миграция — без замечаний; найденные баги починены (revocation-guard при verify закрывает refund-before-verify; recovery по orderId в settle; обязательность `ios_iap_product_id` при `is_digital`; утечка stream-подписки; переиспользование orderId; тексты ошибок).

Известные ограничения v1 (задокументированы, не блокеры): StoreKit-флоу — scoped-listener, не глобальный; «осевшая» незавершённая транзакция закрывается идемпотентностью бэкенда + revocation-guard. Цена на странице товара/в корзине пока тенге; точная цена видна в нативном листе StoreKit и в диалоге оплаты.

**Осталось (ops/тест, кодом не закрывается):**
- [ ] App Store Connect: Small Business Program; IAP-продукты (Consumable) на каждый цифровой SKU + вписать `ios_iap_product_id`; App Store Server API key (.p8/Issuer/Key) → env; URL вебхука нотификаций; `APPLE_IAP_APP_APPLE_ID`.
- [ ] Apple Root CA сертификаты → `web/backend/apple-certs/` (закоммитить).
- [ ] iOS: `cd mobile/ios && pod install` (StoreKit pod).
- [ ] Деплой: `npm run db:migrate` (миграция 0034); проставить `is_digital=true` + `ios_iap_product_id` существующим цифровым товарам на проде.
- [ ] Тест на физическом устройстве в Sandbox (покупка курса/Telegram → доступ; рефанд → отзыв доступа).
