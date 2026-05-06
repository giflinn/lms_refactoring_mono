import { useState } from "react";
import clsx from "clsx";
import { Paperclip, FileText } from "lucide-react";
import { Avatar } from "../../../components/Avatar";
import { ImageLightbox } from "../../../components/ui/ImageLightbox";
import type { ChatMessage, ChatUserSummary } from "../types";
import { formatTime, formatFileSize } from "../format";

type Props = {
  message: ChatMessage;
  position: "left" | "right" | "center";
  sender?: ChatUserSummary | null;
  showAvatar: boolean;
};

const apiBase = import.meta.env.VITE_API_URL as string;

function fileUrl(rel: string): string {
  return rel.startsWith("/") ? `${apiBase}${rel}` : rel;
}

export function MessageBubble({
  message,
  position,
  sender,
  showAvatar,
}: Props) {
  const [openImage, setOpenImage] = useState<string | null>(null);

  if (message.kind === "system" || position === "center") {
    return (
      <div className="my-1 flex items-center justify-center">
        <span className="text-[11px] text-grey-medium italic">
          {message.body ?? ""}
        </span>
      </div>
    );
  }

  const isImage = (mime: string) => mime.startsWith("image/");

  return (
    <div
      className={clsx(
        "flex items-end gap-2",
        position === "right" ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div className="w-8">
        {showAvatar && sender && (
          <Avatar
            src={sender.avatarUrl}
            firstName={sender.firstName}
            lastName={sender.lastName}
            size={28}
          />
        )}
      </div>
      <div
        className={clsx(
          "flex max-w-[68%] flex-col gap-1 rounded-[12px] border border-[#f1f1f5] px-3 py-2 text-[#0e131f]",
          position === "right" ? "bg-[#faf1fd]" : "bg-white",
        )}
      >
        {message.attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {message.attachments.map((a) => (
              <div key={a.url}>
                {isImage(a.mime) ? (
                  <button
                    type="button"
                    onClick={() => setOpenImage(fileUrl(a.url))}
                    className="block cursor-zoom-in"
                  >
                    <img
                      src={fileUrl(a.url)}
                      alt={a.name}
                      className="max-h-[240px] max-w-full rounded-[8px] object-cover"
                    />
                  </button>
                ) : (
                  <a
                    href={fileUrl(a.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-[8px] border border-grey-medium/20 bg-white px-2 py-1.5 text-[12px] hover:bg-grey-lighter"
                  >
                    {a.mime === "application/pdf" ? (
                      <FileText className="h-4 w-4 shrink-0" />
                    ) : (
                      <Paperclip className="h-4 w-4 shrink-0" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{a.name}</span>
                      <span className="text-[10px] opacity-70">
                        {formatFileSize(a.size)}
                      </span>
                    </div>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        {message.body && (
          <span className="whitespace-pre-wrap break-words text-[13px] leading-snug">
            {message.body}
          </span>
        )}
        <span className="self-end text-[10px] text-grey-medium">
          {formatTime(message.createdAt)}
        </span>
      </div>
      {openImage && (
        <ImageLightbox src={openImage} onClose={() => setOpenImage(null)} />
      )}
    </div>
  );
}

