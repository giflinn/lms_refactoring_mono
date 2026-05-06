import { useState } from "react";
import { Download } from "lucide-react";
import { auth } from "../../../firebase";
import { downloadCsv } from "../api";

type Props = {
  url: string;
  filename: string;
};

// Purple "Скачать отчет" button. Owns the loading state itself so taps
// don't double-fire while the blob is being assembled on the server.
export function DownloadButton({ url, filename }: Props) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const u = auth.currentUser;
        if (!u) return;
        try {
          setBusy(true);
          const idToken = await u.getIdToken();
          await downloadCsv(idToken, url, filename);
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[8px] bg-purple-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-purple-dark disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Download size={16} strokeWidth={1.75} />
      {busy ? "Скачивание..." : "Скачать отчет"}
    </button>
  );
}
