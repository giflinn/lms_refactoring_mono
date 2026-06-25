import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth } from "../../../firebase";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  BccSettingsError,
  getBccSettings,
  saveBccSettings,
  type BccSettings,
  type BccSettingsPayload,
} from "../api/bcc";

const BCC_KEY = ["settings", "bcc-credentials"] as const;

const TEST_URL = "https://test3ds.bcc.kz:5445/cgi-bin/cgi_link";
const PROD_URL = "https://3dsecure.bcc.kz/webview";

async function getIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("not_authenticated");
  return u.getIdToken();
}

type MacMode = "components" | "assembled";

type Draft = {
  webviewUrl: string;
  merchantId: string;
  terminalId: string;
  merchName: string;
  merchRnId: string;
  notifyUser: string;
  macComponentA: string;
  macComponentB: string;
  macAssembled: string;
  notifyPass: string;
};

function draftFromSettings(s: BccSettings): Draft {
  return {
    webviewUrl: s.webviewUrl,
    merchantId: s.merchantId,
    terminalId: s.terminalId,
    merchName: s.merchName,
    merchRnId: s.merchRnId,
    notifyUser: s.notifyUser,
    macComponentA: "",
    macComponentB: "",
    macAssembled: "",
    notifyPass: "",
  };
}

const ERR_MESSAGES: Record<string, string> = {
  bcc_webview_url_invalid: "URL шлюза невалиден (нужен http/https)",
  bcc_required_field_missing: "Заполните Merchant ID, Terminal ID и название",
  bcc_merch_rn_id_invalid:
    "MERCH_RN_ID: ровно 16 букв/цифр, минимум одна цифра",
  bcc_mac_component_invalid: "Компоненты ключа должны быть hex",
  bcc_key_component_length_mismatch: "Компоненты ключа разной длины",
  bcc_mac_key_invalid: "MAC-ключ невалиден (hex, 16–64 символа)",
  encryption_not_configured:
    "На сервере не задан APP_ENCRYPTION_KEY — обратитесь к разработчику",
};

export function BccCredentialsTab() {
  const qc = useQueryClient();
  const settingsQ = useQuery<BccSettings>({
    queryKey: BCC_KEY,
    queryFn: async () => getBccSettings(await getIdToken()),
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [macMode, setMacMode] = useState<MacMode>("components");

  useEffect(() => {
    if (settingsQ.data) setDraft(draftFromSettings(settingsQ.data));
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const token = await getIdToken();
      const payload: BccSettingsPayload = {
        webviewUrl: d.webviewUrl.trim(),
        merchantId: d.merchantId.trim(),
        terminalId: d.terminalId.trim(),
        merchName: d.merchName.trim(),
        merchRnId: d.merchRnId.trim(),
        notifyUser: d.notifyUser.trim(),
      };
      if (macMode === "components") {
        if (d.macComponentA.trim() || d.macComponentB.trim()) {
          payload.macKeyComponentA = d.macComponentA.trim();
          payload.macKeyComponentB = d.macComponentB.trim();
        }
      } else if (d.macAssembled.trim()) {
        payload.macKey = d.macAssembled.trim();
      }
      if (d.notifyPass.trim()) payload.notifyPass = d.notifyPass.trim();
      return saveBccSettings(token, payload);
    },
    onSuccess: (next) => {
      qc.setQueryData(BCC_KEY, next);
      setDraft(draftFromSettings(next));
      setMacMode("components");
      toast.success("Реквизиты BCC сохранены");
    },
    onError: (err) => {
      const code = err instanceof BccSettingsError ? err.code : "";
      toast.error(ERR_MESSAGES[code] ?? "Не удалось сохранить реквизиты");
    },
  });

  const isDirty = useMemo(() => {
    if (!draft || !settingsQ.data) return false;
    const s = settingsQ.data;
    const plaintextChanged =
      draft.webviewUrl !== s.webviewUrl ||
      draft.merchantId !== s.merchantId ||
      draft.terminalId !== s.terminalId ||
      draft.merchName !== s.merchName ||
      draft.merchRnId !== s.merchRnId ||
      draft.notifyUser !== s.notifyUser;
    const secretEntered = !!(
      draft.macComponentA.trim() ||
      draft.macComponentB.trim() ||
      draft.macAssembled.trim() ||
      draft.notifyPass.trim()
    );
    return plaintextChanged || secretEntered;
  }, [draft, settingsQ.data]);

  if (settingsQ.isLoading || !draft) {
    return <p className="text-[13px] text-grey-medium">Загрузка…</p>;
  }
  if (settingsQ.isError) {
    return (
      <p className="text-[13px] text-red-error">
        Не удалось загрузить реквизиты.
      </p>
    );
  }

  const s = settingsQ.data!;
  const set = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const canSave = isDirty && !save.isPending;

  const sourceLabel =
    s.source === "db"
      ? "из админки (БД)"
      : s.source === "env"
        ? "из .env (fallback)"
        : "не настроено";
  const modeLabel =
    s.mode === "test" ? "ТЕСТ" : s.mode === "prod" ? "БОЕВОЙ" : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="rounded-[6px] bg-grey-lighter px-2 py-1 text-grey-dark">
          Источник: <b>{sourceLabel}</b>
        </span>
        <span
          className={
            "rounded-[6px] px-2 py-1 " +
            (s.mode === "prod"
              ? "bg-[#C6EFCE] text-[#006100]"
              : "bg-grey-lighter text-grey-dark")
          }
        >
          Режим: <b>{modeLabel}</b>
        </span>
        <span className="rounded-[6px] bg-grey-lighter px-2 py-1 text-grey-dark">
          MAC-ключ:{" "}
          <b>
            {s.macKeyConfigured
              ? `задан · отпечаток ${s.macKeyFingerprint}`
              : "не задан"}
          </b>
        </span>
        <span
          className={
            "rounded-[6px] px-2 py-1 " +
            (s.callbackAuthEnabled
              ? "bg-[#C6EFCE] text-[#006100]"
              : "bg-grey-lighter text-grey-dark")
          }
        >
          Basic-Auth callback: <b>{s.callbackAuthEnabled ? "вкл" : "выкл"}</b>
        </span>
      </div>

      {!s.encryptionConfigured && (
        <p className="rounded-[8px] border border-[#FFC7CE] bg-[#FFF0F1] px-3 py-2 text-[13px] text-[#9C0006]">
          На сервере не задан <code>APP_ENCRYPTION_KEY</code> — сохранить
          секретные поля (MAC-ключ, пароль callback) не получится. Обратитесь к
          разработчику, чтобы он задал ключ шифрования.
        </p>
      )}

      {s.mode === "prod" && !s.callbackAuthEnabled && (
        <p className="rounded-[8px] border border-[#FFE08A] bg-[#FFF8E1] px-3 py-2 text-[13px] text-[#7A5B00]">
          Боевой режим, но Basic-Auth на callback выключен (не задан логин/пароль
          callback). Укажите Callback логин и пароль — те, что регистрируются в
          BCC, — иначе входящие уведомления об оплате принимаются без пароля.
        </p>
      )}

      <p className="max-w-[640px] text-[13px] leading-[1.5] text-grey-medium">
        Боевые реквизиты, выданные BCC. Сохранённые здесь значения переопределяют{" "}
        <code>.env</code>. Секреты (MAC-ключ, пароль callback) хранятся в БД
        зашифрованными и не показываются — оставьте поле пустым, чтобы не менять.
      </p>

      {/* Identifiers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            fullWidth
            label="URL шлюза (WEBVIEW_URL)"
            value={draft.webviewUrl}
            onChange={(e) => set({ webviewUrl: e.target.value })}
            placeholder={PROD_URL}
          />
          <div className="mt-1 flex gap-2 text-[12px] text-grey-medium">
            <button
              type="button"
              className="underline hover:text-purple-primary"
              onClick={() => set({ webviewUrl: PROD_URL })}
            >
              боевой
            </button>
            <button
              type="button"
              className="underline hover:text-purple-primary"
              onClick={() => set({ webviewUrl: TEST_URL })}
            >
              тестовый
            </button>
          </div>
        </div>
        <Input
          fullWidth
          label="Merchant ID"
          value={draft.merchantId}
          onChange={(e) => set({ merchantId: e.target.value })}
        />
        <Input
          fullWidth
          label="Terminal ID"
          value={draft.terminalId}
          onChange={(e) => set({ terminalId: e.target.value })}
        />
        <Input
          fullWidth
          label="Название мерчанта (MERCH_NAME)"
          value={draft.merchName}
          onChange={(e) => set({ merchName: e.target.value })}
        />
        <Input
          fullWidth
          label="MERCH_RN_ID (16 букв/цифр, ≥1 цифра)"
          value={draft.merchRnId}
          onChange={(e) => set({ merchRnId: e.target.value })}
        />
      </div>

      {/* MAC key */}
      <div className="rounded-[12px] border border-[rgba(102,112,133,0.3)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[#0E131F]">
            MAC-ключ (P_SIGN)
          </h3>
          <div className="flex gap-2 text-[12px]">
            <button
              type="button"
              onClick={() => setMacMode("components")}
              className={
                "rounded-[6px] px-2 py-1 " +
                (macMode === "components"
                  ? "bg-purple-lighter text-purple-primary"
                  : "text-grey-medium hover:bg-grey-lighter")
              }
            >
              2 компонента
            </button>
            <button
              type="button"
              onClick={() => setMacMode("assembled")}
              className={
                "rounded-[6px] px-2 py-1 " +
                (macMode === "assembled"
                  ? "bg-purple-lighter text-purple-primary"
                  : "text-grey-medium hover:bg-grey-lighter")
              }
            >
              готовый ключ
            </button>
          </div>
        </div>
        {macMode === "components" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              fullWidth
              label="Компонент A (hex)"
              type="password"
              value={draft.macComponentA}
              onChange={(e) => set({ macComponentA: e.target.value })}
              placeholder="оставьте пусто, чтобы не менять"
            />
            <Input
              fullWidth
              label="Компонент B (hex)"
              type="password"
              value={draft.macComponentB}
              onChange={(e) => set({ macComponentB: e.target.value })}
              placeholder="оставьте пусто, чтобы не менять"
            />
          </div>
        ) : (
          <Input
            fullWidth
            label="Собранный ключ (hex)"
            type="password"
            value={draft.macAssembled}
            onChange={(e) => set({ macAssembled: e.target.value })}
            placeholder="оставьте пусто, чтобы не менять"
          />
        )}
        <p className="mt-2 text-[12px] text-grey-medium">
          BCC выдаёт два компонента — они XOR-собираются в ключ на сервере.
          После сохранения сверьте отпечаток выше.
        </p>
      </div>

      {/* Callback Basic-Auth */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          fullWidth
          label="Callback логин (NOTIFY_USER)"
          value={draft.notifyUser}
          onChange={(e) => set({ notifyUser: e.target.value })}
        />
        <Input
          fullWidth
          label="Callback пароль (NOTIFY_PASS)"
          type="password"
          value={draft.notifyPass}
          onChange={(e) => set({ notifyPass: e.target.value })}
          placeholder={
            s.notifyPassMasked
              ? `текущий: ${s.notifyPassMasked} — пусто = не менять`
              : "оставьте пусто, чтобы не менять"
          }
        />
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => draft && save.mutate(draft)}
          disabled={!canSave}
          className="!w-auto"
        >
          {save.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
        {isDirty && (
          <button
            type="button"
            onClick={() => {
              setDraft(draftFromSettings(s));
              setMacMode("components");
            }}
            className="text-[13px] text-grey-medium hover:text-grey-dark"
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}
