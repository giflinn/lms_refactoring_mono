# BCC (Bank CenterCredit) Card Payment — Integration Spec (ТЗ)

**Status:** Specification / not yet implemented.
**Audience:** the agent(s) who will implement card payments. Read this top-to-bottom before touching code.
**Goal:** add a working **"Банковская карта"** payment method alongside the existing manual Kaspi flow, wired into the Orders module.

> This spec was assembled from three sources, all cross-checked:
> 1. The BCC "e-Commerce WEBVIEW" Postman documentation (see §16 for the doc map + how to re-fetch it).
> 2. A read of our current payment code (file:line refs in §1).
> 3. A **prior, partially-completed integration attempt** (Avirise team, Jan 2025, on a now-defunct Django backend). That attempt reached "test payment works, webhook fires" before the project moved to the current Node backend. Its lessons are in §14 and are the reason several decisions below are already settled.

---

## 0. TL;DR for the implementing agent

- BCC is **not** a JSON REST API. It is a **hosted payment page**: our backend builds a set of order params, **HMAC-signs** them (`P_SIGN`), and a **browser/WebView POSTs them as a form** to the bank's host. The bank renders the card-entry + 3DS page. We **never touch card data** → PCI **SAQ-A**.
- Result comes back **two ways**: (a) a **server-to-server notification** to our `NOTIFY_URL` (authoritative), and (b) a browser **redirect to `BACKREF`** (UX only — never trust it for payment state).
- The single reuse seam in our code: **`changeOrderPaymentStatus(orderId, "paid", null)`** already does everything downstream (stamp `firstPaidAt`, auto-move fulfillment `new → active`, push the client, grant Telegram/LMS access). The BCC notification handler just calls this.
- **Locked decisions** (see §6): one-off purchase only (`TRTYPE=1`, no saved-card token), **immediate capture**, in-app **WebView** on mobile, **auto-refund** wired into admin + the cancellations module.
- **Build order:** signing (§3, has test vectors → write a unit test first) → data model (§7) → backend endpoints + callback (§8) → mobile WebView (§9) → admin (§10) → pass BCC test cases (§13) → request prod creds (§15).
- **External blocker:** the bank-side `NOTIFY_URL` registration (Basic-Auth creds) and the real prod credentials. The **test sandbox is fully usable right now** with public creds (§15), so build & test end-to-end before prod creds arrive.

---

## 1. Current state of our payment code (what you're building on)

There is **no `payment_method` concept** today. Payment is modeled by two independent enums on `orders`, and "Kaspi" is purely manual (a static link the app opens; a human marks the order paid).

Backend (`web/backend/src/`):
- `db/schema.ts:529` — `payment_status` enum: `pending | paid | unpaid | refunded`.
- `db/schema.ts:544` — `fulfillment_status` enum: `new | active | completed | cancelled`.
- `db/schema.ts:570` — `orders` table: has `paymentStatus`, `fulfillmentStatus`, `totalTenge` (numeric 12,2), `firstPaidAt`, `statusChangedAt`, `statusChangedByUserId`. **No** `paymentMethod`, `provider`, `rrn`, `intRef`, or any transaction columns.
- `db/schema.ts:555` — `orders_number_seq` (human order number, starts at 1,000,000).
- `db/schema.ts:668` — `order_status_log` (append-only; logs **payment** status transitions only).
- `db/schema.ts:1334` — `kaspi_links` (static Kaspi URLs, not transactions). `users.kaspiLinkId` at `:89`.
- `routes/orders.ts:574` — `POST /orders` (client-only) → `createOrderForClient`.
- `services/orderCreate.ts:47` — creates the order with `paymentStatus`/`fulfillmentStatus` defaults (`pending`/`new`); insert at `:230`. **One item per order** (`:54`), rejects "по запросу"/null-price products (`:81`). For bookable products it atomically reserves a `coach_slot` sub-range.
- `routes/orders.ts:637` — `PATCH /orders/:id` (staff-only; managers can patch only orders they own). Applies payment status **then** fulfillment (`:690`).
- `services/orderStatus.ts:60` — **`changeOrderPaymentStatus(orderId, status, changedByUserId)`** ← THE seam. On first `paid`: stamps `firstPaidAt`, computes item `expires_at`, writes `order_status_log`, auto-transitions fulfillment (`paid → active`, `unpaid|refunded → cancelled`, `:139`), pushes the client (`:148`). Pass `changedByUserId = null` from the webhook (mirrors how the cron passes null).
- `services/orderStatus.ts:191` — `changeOrderFulfillmentStatus(...)`: drives Telegram/LMS grant/revoke (`:362`).
- `services/orderLifecycleCron.ts` — hourly: `pending` > 24h → `unpaid` (`:36`); `active`+`paid`+all items expired → `completed` (`:56`). **Extend this for BCC reconciliation (§8).**
- `routes/kaspi.ts` — `GET/PUT /settings/kaspi`, `GET /me/kaspi-link` (`:331`). Pattern to mirror for a BCC settings/status surface if needed.
- `routes/telegramWebhook.ts:19` — the **only existing inbound webhook** (behind `BACKEND_PUBLIC_URL`). Precedent for adding the BCC callback route.
- `config.ts` — env surface today: `PORT`, `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_PATH`, `SMTP_*`, `BACKEND_PUBLIC_URL`. **All new BCC env vars go here AND in `.env.example`** (project rule).

Mobile (`mobile/lib/features/`):
- `cart/presentation/widgets/payment_method_sheet.dart:86` — the **disabled "Банковская карта" row** ("Скоро" badge, no `onTap`). This is the slot to enable.
- same file `:419` — `_openKaspi()`: the existing pattern (create order → resolve URL → `launchUrl`). The card flow slots in parallel here. **Note `:443` discards the returned `CreatedOrder.id`** — the card flow must capture it.
- `cart/data/kaspi_api.dart` — `GET /me/kaspi-link`. Mirror for a `BccPaymentApi`.
- `orders/data/orders_api.dart:95` — `POST /orders` (returns `{order:{id, orderNumber}}`); `:258` — `PATCH /orders/:id` (staff mark-paid).
- `orders/domain/staff_order.dart:8` — **`PaymentStatus` enum already exists** (`pending/paid/unpaid/refunded` + `fromString/toString/label`). Reuse it; don't add a parallel one.
- `orders/presentation/widgets/staff_order_card.dart:216` — `_PaymentMethodRow` is **hardcoded to "Kaspi"** (with a comment saying "make data-driven when a 2nd method lands"). Make it data-driven.
- Client **never sees `paymentStatus`** today (`client_order_detail_page.dart` shows only fulfillment). Decide whether to surface it for card orders (§9).

Admin (`web/frontend/src/features/`):
- `orders/components/OrderDrawer.tsx:79` — `applyPayment()` → `PATCH /orders/:id {paymentStatus}`. "Оплата" section at `:157`. This is how a human marks paid today; keep as manual fallback.
- `orders/components/StatusMenu.tsx:5` — `PAYMENT_ITEMS` (the 4 payment statuses with labels/colors).
- `orders/api.ts:131` — `patchOrder()`.
- `settings/components/KaspiSection.tsx` — the Kaspi admin settings (static links). Pattern for a BCC settings panel if needed.

---

## 2. What BCC is (mental model)

BPC/WAY4 "e-Commerce" gateway (the `way4acs` host in the doc confirms the engine). Every operation is the same shape:

> backend assembles signed order params (**no card data**) → a browser/WebView `POST`s them as an `application/x-www-form-urlencoded` form to the BCC host → the bank renders its **own** card-entry + 3DS2 page → result returns via (a) server-to-server notification to `NOTIFY_URL` and (b) redirect to `BACKREF`.

- **Hosts:** test `https://test3ds.bcc.kz:5445/cgi-bin/cgi_link`; prod `https://3dsecure.bcc.kz/webview`.
- **PCI:** SAQ-A (we never see the PAN). Do **not** build a card form.
- **Doc rule "ВАЖНО 2":** auth-type operations (purchase) must be initiated **client/browser-side, not server-side**. → the `POST` to BCC happens from the WebView, not from our backend. (Our backend produces the signed form; the WebView submits it. See §8 for the auto-submit page trick.)
- Operation is selected by **`TRTYPE`**: `1`=purchase, `90`=status check (≤24h), `14`=refund (≤30 days, needs `RRN`+`INT_REF`), `22`=cancel/void (same-day, full amount), `12`/`21`=two-stage preauth/capture (7-day hold), `81`/`82`=create/delete card token, `8`=P2P, `0`=auth, `27/28/29`=AFT, `171`=recurring. **We only need `1`, `90`, `14`, `22` for this spec.**

---

## 3. Signing (`P_SIGN`) — implement and unit-test this FIRST

This is the single most error-prone part (it cost the prior team ~3 days, see §14). Get it green against the test vectors before anything else.

**Algorithm:**
1. Assemble the MAC key = `hexDecode(componentA) XOR hexDecode(componentB)`. Test key components (public, from the doc) are `690B5589573ACB3608DB7395A319B175` and `02BBF98BB3411445D15498E2DC22E3E1` → assembled key **`6BB0AC02E47BDF73D98FEB777F3B5294`** (KCV `A4771B`). In prod the bank gives you two prod components → XOR → prod key.
2. Build the **source string**: for the operation's field list (strict order), concatenate, for each field, `<decimal length of the value in ASCII><value>`. Example: `AMOUNT="350.00"` (6 chars) → `6350.00`; `CURRENCY="398"` (3) → `3398`; `TRTYPE="1"` (1) → `11`; `NONCE` (32) → `32<nonce>`.
3. `P_SIGN = HMAC_SHA1(key = assembled-key-bytes, msg = source-string-bytes).hex().upper()`.

**Field orders (request signing), by `TRTYPE`:**
| TRTYPE | Field order (in this exact sequence) |
|---|---|
| `1` purchase | `AMOUNT, CURRENCY, ORDER, MERCHANT, TERMINAL, MERCH_GMT, TIMESTAMP, TRTYPE, NONCE` |
| `90` status | `ORDER, TERMINAL, TIMESTAMP, TRTYPE, NONCE` |
| `14` refund | `ORDER, ORG_AMOUNT, AMOUNT, CURRENCY, RRN, INT_REF, TERMINAL, TIMESTAMP, TRTYPE, NONCE` |
| `22` cancel/void | (see doc "МАКИРОВАНИЕ (MAC) / MAC TRTYPE=22" — includes `ORDER, ORG_AMOUNT, AMOUNT, CURRENCY, RRN, INT_REF, TERMINAL, TIMESTAMP, TRTYPE, NONCE`; confirm against the doc table) |
| `21` capture (two-stage) | `ORDER, AMOUNT, CURRENCY, RRN, INT_REF, TRTYPE, TERMINAL, TIMESTAMP, NONCE` |

The doc has a per-`TRTYPE` table under **МАКИРОВАНИЕ (MAC)** giving field / field-code / length / value for each. Use it as the source of truth if you add operations beyond the above.

**Test vectors — write a unit test that reproduces all three** (verified during research):
```
key (hex) = 6BB0AC02E47BDF73D98FEB777F3B5294   # HMAC-SHA1, key is the HEX-DECODED bytes

# TRTYPE=1 (purchase)
src  = 6350.00339813355871446156812merchantname8888888811014202002240739211132F2B2DD7E603A7AAF5E1BC35DEE1F6C9A
P_SIGN = 9B1C58714CFF6E4BCC6E97B4D503275838F4ED68

# TRTYPE=90 (status)
src  = 133558714461568888888881142020022407392129032F2B2DD7E603A7AAF5E1BC35DEE1F6C9A
P_SIGN = 7C0D8BF3F6C7DCB0AA35E88F045292E176184B5E

# TRTYPE=14 (refund)
src  = 1335587144615686350.006350.00339812821185120045169C2176F638FDC05C888888881142020022407392121432F2B2DD7E603A7AAF5E1BC35DEE1F6C9A
P_SIGN = 0D8ABFC1215135BD51AB27C10E2CD621C5AF1432
```
Reference (Python):
```python
import hmac, hashlib
key = bytes.fromhex("6BB0AC02E47BDF73D98FEB777F3B5294")
hmac.new(key, src.encode(), hashlib.sha1).hexdigest().upper()  # == P_SIGN
```
TypeScript equivalent: `crypto.createHmac("sha1", Buffer.from(keyHex, "hex")).update(src, "utf8").digest("hex").toUpperCase()`.

**Critical formatting rules (each one bit the prior team — §14):**
- `MERCH_GMT="0"` and `TIMESTAMP` in **UTC+0**, format `YYYYMMDDHHMMSS`. (The old attempt sent `MERCH_GMT="+5"` + Almaty local time and burned a day on it. Use `0`+UTC.) The value you sign **must** equal the value you send; `GUARD_TIME` rejects a stale/mismatched timestamp (RC `-20`).
- `NONCE`: freshly generated, ≥8 bytes, **hex, no dashes** (e.g. 32 hex chars). A UUID-with-dashes is rejected (RC `-17`).
- `ORDER`: **numeric only, length > 6**, and the **lower 6 digits must be unique per day** (duplicates → `ACTION=1`). → use a **dedicated per-attempt** numeric ref, not the bare order id (§7).
- `AMOUNT`: string with 2 decimals, e.g. `"350.00"`, currency `398` (KZT). Min on prod: **30₸** KZ cards, **355₸** foreign (RC `57` below min).
- Field **names** are case-sensitive and exact: `MERCH_NAME` (not `MERCHANT_NAME`), etc. Wrong name → `RC -17`.
- **Compute `TIMESTAMP` and `NONCE` once** and reuse the *same* values for both the signature and the request body. (The old Django code called `timezone.now()` twice — once to sign, once for the body — so crossing a second boundary could desync them → `-17`/`-20`. See §14.)
- **Sign exactly the `AMOUNT` string you send:** format to 2 decimals (`"8000.00"`) and use one variable for both signature and body. (The old code signed `total_amount` but sent `order.total_amount` with no enforced format → mismatch risk. See §14.)

---

## 4. Field reference

### 4.1 Purchase request (`TRTYPE=1`) — what the WebView POSTs
Confirmed canonical field set (no card data — the bank's page collects the card):
```
AMOUNT       "350.00"                  # 2 decimals
CURRENCY     398                       # KZT
ORDER        <numeric, >6 digits, unique low-6/day>   # per-attempt ref (§7)
MERCH_RN_ID  <merchant ref id>         # EXACTLY 16 alphanumeric AND must contain ≥1 DIGIT — an all-letter value passes purchase but fails reversal with RC=95 "Reconcile error" (BCC, 2026-06-19). Same value on purchase + reversal. We generate it (BCC doesn't assign one).
DESC         "Покупка ..."             # human description, shown to payer
MERCHANT     <merchant id>             # see §15 (test: 00000001)
MERCH_NAME   "IP Zhanna Slyamova"
TERMINAL     <TID>                     # test 88888881 (with MAC)
TIMESTAMP    YYYYMMDDHHMMSS            # UTC+0
MERCH_GMT    0
TRTYPE       1
BACKREF      https://.../return        # browser return URL (UX only)
LANG         ru
NONCE        <hex, no dashes>
P_SIGN       <HMAC, §3>
MK_TOKEN     MERCH
NOTIFY_URL   https://app.zhannaslyamova.net:443/api/payments/bcc/callback   # MUST include port
CLIENT_IP    <payer ip>
M_INFO       <base64 JSON, see 4.2>
```

### 4.2 `M_INFO` (3DS2 device / cardholder info, base64-encoded JSON)
```json
{
  "browserScreenHeight": "1920",
  "browserScreenWidth": "1080",
  "mobilePhone": { "cc": "7", "subscriber": "7475558888" },
  "billAddrLine1": "Адрес, 88"
}
```
`billAddrLine1` was added per the doc changelog (26/05/2026). Populate what you can from the client; the bank's 3DS page handles the rest.

### 4.3 Notification / callback fields (what the bank POSTs to `NOTIFY_URL`)
`application/x-www-form-urlencoded`, secured by **Basic Auth** (creds you hand the bank) + **`P_SIGN`** you must verify. Real field set observed in the prior attempt:
```
ACTION, RC, RC_TEXT, APPROVAL, TRAN_CUR_NAME, TRAN_AMOUNT, CARD_MASK,
TERMINAL, TRTYPE, AMOUNT, CURRENCY, ORDER, RRN, MERCHANT, LANG, NAME,
BACKREF, P_SIGN, TIMESTAMP, CVC2_RC, INT_REF, MERCH_GMT, DESC, NONCE,
MERCH_RN_ID, MERCH_TRAN_STATE, RECUR_FREQ, RECUR_EXP, MERCH_TOKEN_ID
```
- On **success** `RRN` and `INT_REF` are populated — **persist both** (required to refund/void later). In the failure sample they were empty.
- The notification mirrors request fields + adds response fields. The **exact field order for verifying the response `P_SIGN` must be confirmed with BCC** (the doc's MAC tables are written for requests). ⚠️ The prior Django implementation **did not verify the callback signature at all** (see §14) — so there is **no working reference** for this; it must be obtained from BCC. Until confirmed, the trust anchor is **Basic-Auth + an independent `TRTYPE=90` status re-check** before marking paid; add `P_SIGN` verification as soon as BCC confirms the response field order. Track in §17.

### 4.4 Result codes (how to decide success)
- **`ACTION`**: `0`=success, `1`=duplicate, `2`=declined, `3`=processing/auth error, `4`=info, `5`=3DS from issuer, … (full list: doc "КОДЫ ОТВЕТОВ / ACTION").
- **`RC`**: `00`=approved; declines e.g. `05`, `51` (funds), `57` (below min / remainder), `59` (fraud), `62`/`65` (limits); negatives = request/format errors: `-2` bad `ORDER`/`TIMESTAMP`, `-17` bad MAC field-order / missing param / disabled TID / wrong field name, `-19` 3DS authentication error, `-20` `TIMESTAMP` outside `GUARD_TIME`, `-21` already done. (full lists: doc "КОДЫ ОТВЕТОВ / RC" and "FAQ / Анализ ошибок").
- **Success rule:** treat as paid only when `ACTION=0` **and** `RC=00` (and `P_SIGN` verified). Everything else = not paid; surface `RC_TEXT` to logs and a friendly message to the user.

---

## 5. Target flow (end-to-end)

```
CLIENT (mobile)            OUR BACKEND                         BCC
  │ picks "Карта"             │                                  │
  │ POST /orders ────────────►│ create order (pending)           │   ← existing
  │ POST /payments ──────────►│ payment_tx (pending),            │
  │                           │ numeric ORDER + P_SIGN (§3)      │
  │◄─ {paymentId, checkoutUrl}│                                  │
  │ open WebView:             │                                  │
  │ GET /payments/:id/checkout►│ returns auto-submit HTML form ──┼──► POST to webview host
  │                           │                                  │ bank renders card + 3DS2
  │ ⟵⟶ pays on bank's page ⟵⟶                                    │
  │                           │◄── POST /payments/bcc/callback ──┤ (Basic Auth + P_SIGN)
  │                           │ verify → changeOrderPaymentStatus(paid, null)
  │◄─ redirect to BACKREF ─────────────────────────────────────┤
  │ WebView detects BACKREF,  │                                  │
  │ closes itself            │                                  │
  │ GET /payments/:id ───────►│ (if callback not in yet: TRTYPE=90 status check)
  │◄─ {status} ───────────────│                                  │
  │ show "Оплачено / Ошибка / Повторить"                         │
```

**Two non-negotiable rules:**
1. **Never** mark an order paid from the client or from the `BACKREF` redirect. Authoritative = the verified `NOTIFY_URL` callback, backed by a `TRTYPE=90` status check.
2. The callback is **idempotent** (bank may retry / duplicate) and the system **reconciles**: a cron polls `TRTYPE=90` for pending card payments < 24h old; the existing `pending → unpaid` 24h cron releases the booking if payment never completes.

---

## 6. Locked design decisions

Settled with the product owner (the last four were re-confirmed; the business model matches what was already agreed with BCC in Jan 2025 — §14):
1. **In-app WebView** (`webview_flutter`) for the bank page — best UX, lets us intercept the `BACKREF` redirect and close the screen ourselves. (Not external browser.)
2. **One-off purchase only** — `TRTYPE=1`, **no saved-card token** / no recurring in v1. (PCI SAQ-A, smallest surface.)
3. **Immediate capture** — `TRTYPE=1` charges now. Manager order activation stays a *fulfillment* concern, decoupled from money (no two-stage hold).
4. **Auto-refund in v1** — admin "Возврат" on a card order calls BCC (`TRTYPE=22` same-day full / `TRTYPE=14` ≤30 days), and **approving a cancellation of a card order triggers the refund** (hook into the existing cancellation → fulfillment-cancelled cascade). Manual mark-paid/refund stays as a fallback.

---

## 7. Data model changes

`schema.ts` first, then `npm run db:generate` (never hand-write SQL).

1. **`payment_method` enum** `('kaspi','card')` and **`orders.payment_method`** (nullable; set when the client picks a method / initiates payment). Existing Kaspi orders can stay null or be backfilled `'kaspi'`. This also makes the mobile staff `_PaymentMethodRow` data-driven.
2. **New table `payment_transactions`** (one order can have several attempts):
   - `id` uuid pk
   - `order_id` uuid fk → orders
   - `provider` text (`'bcc'`)
   - `bcc_order` text/numeric **unique** — the per-attempt `ORDER` sent to BCC (numeric, >6 digits, unique low-6/day per §3)
   - `amount` numeric(12,2)
   - `status` enum (`pending | paid | failed | refunded`) — provider-side payment state, distinct from `orders.payment_status`
   - `action` text, `rc` text, `rc_text` text — last result codes
   - `rrn` text, `int_ref` text — **from the success callback; required for refund/void**
   - `card_mask` text (e.g. `4463XXXXXXXX4568`) — for admin display
   - `raw_request` jsonb, `raw_callback` jsonb — full audit
   - `created_at`, `updated_at`
   - index on `bcc_order`, `order_id`.

Why a table (not columns on `orders`): refunds need `rrn`+`int_ref`; retries need multiple attempts per order; you want an audit trail and idempotency keyed on `bcc_order`.

---

## 8. Backend work (`web/backend/src/`)

- **`services/bcc/sign.ts`** — key assembly (XOR + hex), source-string builder (length-prefix, per-`TRTYPE` field order), `P_SIGN` HMAC-SHA1, and a `verify(fields)` for callbacks. Unit-tested against §3 vectors.
- **`services/bcc/client.ts`** — server-side ops that we DO call from the backend: `TRTYPE=90` status, `TRTYPE=14` refund, `TRTYPE=22` void. (Purchase is **not** server-initiated — it's the WebView form.)
- **`routes/payments.ts`:**
  - `POST /payments` (client auth) — body `{orderId}`. Validates the order belongs to the client and is `pending`; creates a `payment_transactions` row with a fresh numeric `bcc_order`; returns `{paymentId, checkoutUrl}`.
  - `GET /payments/:id/checkout` — returns a tiny **auto-submitting HTML form** (all signed fields, `action` = BCC webview host, `method=POST`, `onload submit()`). Keeps the secret key server-side; the WebView just loads this URL. (This satisfies doc rule "ВАЖНО 2" — the POST originates browser-side.)
  - `GET /payments/:id/return` — the `BACKREF` landing (renders a trivial "closing…" page; the WebView intercepts this URL and closes — see §9).
  - `GET /payments/:id` (client auth) — returns current `{status}`; if still pending, optionally trigger a `TRTYPE=90` check inline.
- **`routes/bccCallback.ts`** — `POST /payments/bcc/callback` (**public**, no Firebase auth). Enforce **Basic Auth** (creds shared with the bank) → **verify `P_SIGN`** → look up tx by `ORDER` → **idempotent** (ignore if already terminal) → on `ACTION=0 & RC=00` store `rrn/int_ref/card_mask` and call `changeOrderPaymentStatus(orderId, "paid", null)`; otherwise mark tx `failed` and store `rc/rc_text`. Mirror the route-registration of `routes/telegramWebhook.ts`. **`NOTIFY_URL` must include the port** (`:443`).
- **Reconciliation** — extend `services/orderLifecycleCron.ts`: for `payment_transactions` in `pending` < 24h, poll `TRTYPE=90` and settle. (After 24h the existing `pending → unpaid` order cron releases the slot.)
- **Refund/void** (decision §6.4) — admin endpoint (or extend `PATCH /orders/:id` for card orders) → `services/bcc/client.ts` `TRTYPE=22`/`14` using stored `rrn/int_ref` → on success `changeOrderPaymentStatus(orderId, "refunded", actorId)`. Hook the **cancellation-approval** path (existing module) so approving a card-order cancellation refunds automatically.
- **Config** (`config.ts` + `.env.example`, real values out-of-band per the git rule):
  ```
  BCC_WEBVIEW_URL     # test: https://test3ds.bcc.kz:5445/cgi-bin/cgi_link  prod: https://3dsecure.bcc.kz/webview
  BCC_MERCHANT_ID     # test: 00000001  (prod: assigned by bank)
  BCC_TERMINAL_ID     # test: 88888881  (prod: assigned by bank)
  BCC_MAC_KEY         # assembled hex key; test: 6BB0AC02E47BDF73D98FEB777F3B5294
  BCC_MERCH_NAME      # "IP Zhanna Slyamova"
  BCC_MERCH_RN_ID     # MVMAZDUNTFWJURIY
  BCC_NOTIFY_USER / BCC_NOTIFY_PASS   # Basic-Auth creds we give the bank for NOTIFY_URL
  # NOTIFY_URL/BACKREF are derived from BACKEND_PUBLIC_URL (with :443)
  ```

---

## 9. Mobile work (`mobile/lib/features/`)

- Add **`webview_flutter`** (configure iOS/Android per its README; iOS min is already 15.0).
- `cart/presentation/widgets/payment_method_sheet.dart` — enable the bank-card row (`:86`, remove `disabled:true`, add `onTap`). On tap: create the order (capture the **`CreatedOrder.id`** that's currently discarded at `:443`), `POST /payments`, open a WebView page at `checkoutUrl`.
- New checkout page: load `checkoutUrl`; intercept navigation to the `BACKREF`/return URL → pop the WebView → show a "проверяем оплату" state → poll `GET /payments/:id` (or `GET /me/orders/:id`) → success / failure / retry screen. **Do not** infer success from the redirect alone.
- Make `orders/presentation/widgets/staff_order_card.dart:216` `_PaymentMethodRow` **data-driven** (kaspi vs card) using the new `payment_method`.
- Surface payment status for **card** orders in the client order detail (today the client sees only fulfillment) — reuse the existing `PaymentStatus` enum/labels (`orders/domain/staff_order.dart:8`).
- Keep `--dart-define=API_URL` discipline for release builds (known prior footgun).

---

## 10. Admin work (`web/frontend/src/features/`)

- `orders/components/OrderDrawer.tsx` — show the **payment method** (Kaspi/Карта); for card orders show transaction details (`card_mask`, `rc/rc_text`, `rrn`). Keep the manual payment-status override (`:79`) as a fallback.
- Add a **"Возврат"** action for paid card orders → backend refund (§8). Reflect `refunded`.
- Optionally a BCC settings/status panel mirroring `settings/components/KaspiSection.tsx` (not required for v1).

---

## 11. User stories

**Client:** choose "Карта" and pay inside the app, see the result immediately; on failure get a clear message + "Повторить"; see the payment status of a card order.
**Manager/admin:** see the payment method and card transaction details; refund a card order in one action; manually mark paid as a fallback if automation misfires.
**System:** confirm payment only via the verified notification + `TRTYPE=90`, idempotently; release the booking if a card payment isn't completed within 24h; auto-refund on approved cancellation of a card order.

---

## 12. Phasing & acceptance

- **Phase 1 (core, test env):** signing (+unit test green on §3 vectors) → data model → `POST /payments` + checkout HTML → callback (idempotent, verified) + `TRTYPE=90` → mobile WebView + enable card row. **Acceptance:** from the app, pay a test order on test TID `88888881` end-to-end; order flips to `paid` and Telegram/LMS access is granted via the existing seam; a duplicate callback is a no-op.
- **Phase 2:** refund/void + cancellation-module hook; admin transaction details; reconciliation-cron hardening. **Acceptance:** refund a paid test tx → `refunded`; approving a card-order cancellation refunds automatically.
- **Go-live:** pass BCC test cases (§13) → submit results to BCC → receive prod TID + key components → set prod env (§15) → smoke a small real payment.

---

## 13. Test plan (the BCC "ТЕСТ КЕЙСЫ" you must pass for go-live)

Run on the **MAC terminal `88888881`** (the doc: "Все тест кейсы обязательно должны быть пройдены на терминале с макированием"). For our scope, cover at minimum:
- Покупка `TRTYPE=1` (CARD): Challenge+Fingerprint, Challenge, Frictionless+Fingerprint, Frictionless (+ NON3DSECURE only if you request that capability).
- Проверка статуса `TRTYPE=90`.
- Отмена `TRTYPE=22` and Возврат `TRTYPE=14`.
- Проверка соединения `TRTYPE=800` (optional health check).

**Test cards** (3DSv2, from the doc "ВВЕДЕНИЕ / Тестовые карты"):
| Flow | Card | MM/YY | CVC |
|---|---|---|---|
| Challenge + Fingerprint | `4463755551594568` / `4463755556467828` | 04/25 / 10/33 | 965 / 414 |
| Challenge | `4899939999784361` | 04/27 | 767 |
| Frictionless + Fingerprint | `4463755558624053` / `4463755558609948` | 06/25 / 10/33 | 144 / 000 |
| Frictionless | `4899939998491778` | 04/27 | 917 |

(The prior team hit `ACTION=3 / RC=-19` "Ошибка аутентификации" on some cards; BCC resolved it by toggling 3DS on the terminal during testing — coordinate with BCC support if a test card won't authenticate.)

Send the completed test-case results to BCC support to unlock prod.

---

## 14. Prior attempt (Jan 2025) — lessons & assets

A previous team (Avirise) built this once on a **Django** backend at `zhannaslyamova.space`. It reached "test payment works, webhook fires; only test cases remained" before the project was rewritten as the current Node monorepo (`lms_refactoring_mono`) and the payment work was dropped.

**Reference implementation (obtained & reviewed — old Django repo `lms_zhanna_back`):**
- Signing: `app/orders/serializers.py` (the `payment_type == 'bcc'` branch inside order creation). **Confirms §3 verbatim:** `nonce = os.urandom(16).hex().upper()`; source-string field order `AMOUNT, CURRENCY, ORDER, MERCHANT, TERMINAL, MERCH_GMT, TIMESTAMP, TRTYPE, NONCE` with `len`-prefix; `hmac.new(bytes.fromhex(HMAC_SECRET), src.encode(), hashlib.sha1).hexdigest().upper()`.
- Architecture: the backend builds & signs `bcc_data` during order creation and returns `{order_id, bcc_data}` to the mobile app; **the mobile WebView POSTs `bcc_data` to BCC** (matches §5). Settings: `app/config/settings.py` (the `# BCC Payments` block). Callback route: `app/bcc_payments/{views,urls,models}.py` mounted at `/api/v1/bcc-payments/callback/`. Success check: `ACTION == '0' and RC == '00'` (matches §4.4).
- The BCC support Telegram chat ("BCC E-com/Avirise.app.") — BCC's own engineers answer there. Support emails: **`itsup-ecom@bcc.kz`**, `support-ecom@bcc.kz`.

**Flaws in that reference — DO NOT replicate (this spec already fixes them):**
- 🔴 **Callback (`BccCallbackView`) verified nothing** — `permission_classes=[AllowAny]`, no `P_SIGN` check, no Basic-Auth, no idempotency; it trusted the POSTed `ACTION`/`RC`. A spoofed POST could mark any order paid. → §8 mandates Basic-Auth + `P_SIGN` verify + `TRTYPE=90` re-check + idempotency.
- 🔴 **`BccTransaction` stored no `RRN`/`INT_REF`** (only `order_number`, `nonce`, `string_source`, `status`) → **refunds were impossible**. → §7 persists them.
- 🟠 `TIMESTAMP` computed twice (sign vs body) → desync risk (§3).
- 🟠 `AMOUNT` signed (`total_amount`) ≠ sent (`order.total_amount`), no 2-decimal format enforced (§3).
- 🟠 `MERCH_GMT='+5'` while Django `timezone.now()` returns **UTC** → the exact timestamp bug from the chat. → use `MERCH_GMT='0'` + UTC (§3).
- 🟠 `ORDER` = `order.order_number` directly → retries reuse it → duplicate `ACTION=1`. → §7 uses a per-attempt numeric `bcc_order`.
- 🟠 No `M_INFO` / `CLIENT_IP` / `MK_TOKEN` in the final `bcc_data` (it worked on the test terminal without them; **confirm whether 3DS2 needs `M_INFO` on the prod terminal** — §17). `NOTIFY_URL`/`BACKREF` defaults lacked scheme/port; the env override added `:443`.

**Bugs they hit (don't repeat):**
- `RC -17` from a malformed MAC source string — wrong field order, `NONCE` as a dashed UUID, or wrong field name. Fix per §3.
- `TIMESTAMP`/`MERCH_GMT` mismatch — they sent `MERCH_GMT="+5"` + Almaty local time. **Use `MERCH_GMT="0"` + UTC** and sign exactly what you send.
- `ORDER` with letters / wrong length — must be numeric, >6 digits.
- `NOTIFY_URL` without a port — the bank explicitly requires the port (`:443`).
- `ACTION=3 / RC=-19` 3DS auth failures on test cards — a terminal-side 3DS toggle, resolved with BCC support (not a code bug).

**Confirmed in that attempt (matches §6):** "оплата без холдирования… возвраты вручную [later: automate]… только единоразовая, без сохранения токена".

---

## 15. Credentials & go-live checklist

**Test sandbox — all public/known, usable right now** (from the doc; also recovered from the old Avirise Django `.env`, which contained *only* these sandbox values — no real secrets):
- host `https://test3ds.bcc.kz:5445/cgi-bin/cgi_link`
- `TERMINAL` `88888881` (with MAC) / `88888888` (no MAC)
- `BCC_MAC_KEY` `6BB0AC02E47BDF73D98FEB777F3B5294`
- `MERCHANT` `00000001` (doc placeholder; the test terminal accepts it)
- `MERCH_RN_ID` `MVMAZDUNTFWJURIY`, `MERCH_NAME` `IP Zhanna Slyamova`

**Production — NOT yet issued.** The bank assigns: a real **MERCHANT id**, a prod **TERMINAL (TID)**, and **two prod key components** (XOR → prod `BCC_MAC_KEY`), plus the prod host `https://3dsecure.bcc.kz/webview`. To get them:
1. Complete the application (Анкета-Заявление / Заявление о присоединении) — in progress as of Apr 2026; payout account is at Kaspi Bank (details live in the BCC application form, **not** in this repo).
2. Publish the payment/refund policy page on the site (BCC requirement). Already exists: `legal-static/payment-refund-policy/index.html`, served at `zhannaslyamova.net/payment-refund-policy/`.
3. Register our `NOTIFY_URL` + Basic-Auth creds with BCC (email support). Confirm test MERCHANT id and that the per-request `NOTIFY_URL` works in test.
4. Pass the test cases (§13), send results, receive prod creds (1–3 days).

**Secret handling:** all real keys/creds go in `config.ts` + `.env` (+ placeholders in `.env.example`), deployed **out-of-band** (never committed — per the repo's "deploy code only via git; secrets exempt" rule). Update `CLAUDE.md` with the BCC integration + new env vars **when it ships** (not before).

---

## 16. BCC documentation map (where to look deeper)

The doc is a Postman collection rendered as a single-page app — **`WebFetch` only gets the JS shell**. To read it for real, fetch the **raw collection JSON** (≈1.7 MB):
```
https://documenter.gw.postman.com/api/collections/23274245/2s7YYo95nr?environment=23274245-f47be22a-13d0-4686-ab88-60ee441f5d7f&segregateAuth=true&versionTag=latest
```
(Human view: `https://documenter.getpostman.com/view/23274245/2s7YYo95nr`.) It's a Postman v2 collection: `item[]` tree where folders have nested `item[]`, requests have `request.{method,url,header,body.urlencoded}`, and **the prose docs live in HTML `description` fields**. ~95% of the 328 requests are repetitive 3DS step simulations (Challenge/Frictionless × Fingerprint/none × шаг #1..#8) — the signal is concentrated in **descriptions + the `шаг #1` body of each `TRTYPE`**. Don't fan out hundreds of agents over the duplicates; extract descriptions + dedup bodies (a ~30-line script walking the tree, stripping HTML, hashing bodies, collapses it to ~90 unique bodies + ~90 prose blocks).

Sections that matter, and when to open them:
| Doc section | What's there | Need it for |
|---|---|---|
| `ВВЕДЕНИЕ` (Давайте начнем / Подключение / Терминал ID / Тестовые карты) | sandbox host, TID, test cards, min amounts, rule "ВАЖНО 2" | setup, §13 |
| `МАКИРОВАНИЕ (MAC)` (+ per-`TRTYPE` subpages + "Реализация на языках") | the signing spec, field-order tables, sample key, lang snippets | §3 (most important) |
| `НАСТРОЙКИ УВЕДОМЛЕНИЙ` | notification model: Basic Auth, `NOTIFY_URL` (port!), header format | §8 callback |
| `ТИПЫ ТРАНЗАКЦИЙ / Покупка` | purchase `TRTYPE=1` requests (the `шаг #1` body = what you POST) | §4.1 |
| `ТИПЫ ТРАНЗАКЦИЙ / Проверки статуса` (`TRTYPE=90`) | status check, ≤24h window | §8 reconciliation |
| `ТИПЫ ТРАНЗАКЦИЙ / Покупка / Возврат` (`TRTYPE=14`) + `Отмена авторизации` (`TRTYPE=22`) | refund (≤30d, needs RRN/INT_REF) vs same-day void | §8 refund |
| `Безопасная сделка` (`TRTYPE=12/21/22`) | two-stage preauth/capture (7-day hold) — **out of scope**, here if ever needed | future |
| `КОДЫ ОТВЕТОВ` (ACTION / RC / MADV_CODE) | result-code tables | §4.4 |
| `FAQ / Анализ ошибок` | ACTION+RC → cause → fix (the richest practical section) | debugging |
| `ПРОМЫШЛЕННАЯ СРЕДА` | go-live steps + prod host | §15 |
| `ПЛАГИНЫ` (WordPress/OpenCart) | reference configs — ignore for us | — |
| `Периодические платежи` / `P2P` / `AFT` / `Создание токена` (`81/82`) | recurring, P2P, AFT, card tokens — **out of scope** | future (saved card) |

Anchors in the SPA URL (e.g. `#409b9671-...` = CHANGELOG) are folder ids, not stable deep links — navigate the rendered page or grep the JSON by section name.

---

## 17. Open questions / risks (resolve during implementation)

1. **Response-MAC field order** for verifying the callback `P_SIGN` — confirm with BCC (the doc's MAC tables are for requests). ⚠️ The old Django code **never verified the callback** (§14), so there is no reference composition — get it from BCC. Until then, gate "paid" on Basic-Auth + an independent `TRTYPE=90` re-check, and add `P_SIGN` verification once confirmed.
8. **3DS2 `M_INFO` requirement** — the old code omitted `M_INFO`/`CLIENT_IP` and still passed on the test terminal; confirm whether the **prod** terminal (esp. frictionless 3DS2) requires `M_INFO`.
2. **Test MERCHANT id** — `00000001` worked on the test terminal historically; confirm BCC still accepts it, and get the real prod MERCHANT id.
3. **`NOTIFY_URL` in test** — confirm the bank delivers test notifications to a per-request `NOTIFY_URL` without prior bank-side registration, or whether registration is needed even for test.
4. **Booking abandonment** — card abandonment is more common than instant Kaspi; the 24h `pending → unpaid` window holds a `coach_slot` that whole time. Consider a shorter hold for unconfirmed card intents.
5. **Amounts** — verify all sellable products are ≥ the BCC minimum (30₸ KZ / 355₸ foreign).
6. **`orders.manager_id` is a snapshot** (known issue, see memory `project_orders_rbac_migration`) — if any BCC reporting keys off manager, be aware historical orders won't follow reassignment.
```
