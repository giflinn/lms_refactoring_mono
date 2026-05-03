import { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { formatFileSize } from "../format";

type Props = {
  onSend: (body: string, files: File[]) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
};

const ACCEPTED = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

export function MessageInput({ onSend, disabled, placeholder }: Props) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function pickFiles(picked: FileList | null) {
    if (!picked) return;
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= 5) break;
      next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return;
    setSending(true);
    try {
      await onSend(trimmed, files);
      setBody("");
      setFiles([]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-grey-medium/20 p-3">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-[8px] border border-grey-medium/20 bg-grey-lighter px-2 py-1 text-[12px]"
            >
              <span className="max-w-[160px] truncate">{f.name}</span>
              <span className="text-[10px] text-grey-medium">
                {formatFileSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                className="text-grey-medium hover:text-red-error"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-grey-medium hover:bg-grey-lighter"
          disabled={disabled || sending}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED}
          multiple
          className="hidden"
          onChange={(e) => pickFiles(e.target.files)}
        />
        <input
          type="text"
          value={body}
          disabled={disabled || sending}
          placeholder={placeholder ?? "Напишите что то..."}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          className="h-9 flex-1 rounded-[20px] border border-grey-medium/30 bg-white px-4 text-[13px] outline-none focus:border-purple-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={disabled || sending || (!body.trim() && files.length === 0)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-primary text-white transition-opacity disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
