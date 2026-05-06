import { useCallback, useEffect, useRef } from "react";
import clsx from "clsx";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  ImagePlus,
  Video,
  Undo,
  Redo,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useUploadLmsMedia } from "../queries";

// Inline self-contained <video> node so HTML round-trips through the editor.
// We don't need a fancy controls bar — the mobile renderer adds it via
// flutter_html's video extension. Schema is permissive (src attribute only).
const VideoNode = Node.create({
  name: "video",
  group: "block",
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, { controls: "true" }),
    ];
  },
});

const apiBase = import.meta.env.VITE_API_URL as string;

function resolveMediaSrc(url: string): string {
  return url.startsWith("/") ? `${apiBase}${url}` : url;
}

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Начните печатать…",
      }),
      VideoNode,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    // The bundled extensions emit an SSR-safety warning unless we explicitly
    // opt out — Vite renders on the client only.
    immediatelyRender: false,
  });

  // Keep editor.content in sync when the parent swaps in a different lesson.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const upload = useUploadLmsMedia();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const onImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor) return;
      try {
        const result = await upload.mutateAsync(file);
        editor.chain().focus().setImage({ src: resolveMediaSrc(result.url) }).run();
      } catch (err) {
        console.error("[lms] image upload failed", err);
      }
    },
    [editor, upload],
  );

  const onVideoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor) return;
      try {
        const result = await upload.mutateAsync(file);
        editor
          .chain()
          .focus()
          .insertContent({
            type: "video",
            attrs: { src: resolveMediaSrc(result.url) },
          })
          .run();
      } catch (err) {
        console.error("[lms] video upload failed", err);
      }
    },
    [editor, upload],
  );

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Ссылка (URL)", prev ?? "");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return (
      <div className="rounded-[8px] border border-[#EAECF0] p-4 text-[13px] text-grey-medium">
        Загрузка редактора…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Toolbar
        editor={editor}
        onPickImage={() => imageInputRef.current?.click()}
        onPickVideo={() => videoInputRef.current?.click()}
        onSetLink={setLink}
        uploading={upload.isPending}
      />
      <EditorContent
        editor={editor}
        className="lms-editor min-h-[280px] rounded-[8px] border border-[#EAECF0] bg-white px-4 py-3 text-[14px] leading-[1.55] text-[#0E131F] focus-within:border-purple-primary focus-within:outline-none"
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onImageFile}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        className="hidden"
        onChange={onVideoFile}
      />
    </div>
  );
}

function Toolbar({
  editor,
  onPickImage,
  onPickVideo,
  onSetLink,
  uploading,
}: {
  editor: Editor;
  onPickImage: () => void;
  onPickVideo: () => void;
  onSetLink: () => void;
  uploading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[#EAECF0] bg-grey-lighter px-2 py-1.5">
      <ToolBtn
        icon={<Bold size={15} strokeWidth={1.7} />}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Жирный"
      />
      <ToolBtn
        icon={<Italic size={15} strokeWidth={1.7} />}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Курсив"
      />
      <Sep />
      <ToolBtn
        icon={<Heading1 size={15} strokeWidth={1.7} />}
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        title="Заголовок 1"
      />
      <ToolBtn
        icon={<Heading2 size={15} strokeWidth={1.7} />}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        title="Заголовок 2"
      />
      <Sep />
      <ToolBtn
        icon={<List size={15} strokeWidth={1.7} />}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Список"
      />
      <ToolBtn
        icon={<ListOrdered size={15} strokeWidth={1.7} />}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Нумерованный список"
      />
      <ToolBtn
        icon={<Quote size={15} strokeWidth={1.7} />}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Цитата"
      />
      <Sep />
      <ToolBtn
        icon={<LinkIcon size={15} strokeWidth={1.7} />}
        active={editor.isActive("link")}
        onClick={onSetLink}
        title="Ссылка"
      />
      <ToolBtn
        icon={<ImagePlus size={15} strokeWidth={1.7} />}
        onClick={onPickImage}
        title="Изображение"
        disabled={uploading}
      />
      <ToolBtn
        icon={<Video size={15} strokeWidth={1.7} />}
        onClick={onPickVideo}
        title="Видео"
        disabled={uploading}
      />
      <span className="ml-auto flex items-center gap-1">
        {uploading && (
          <span className="text-[12px] text-grey-medium">Загрузка…</span>
        )}
        <ToolBtn
          icon={<Undo size={15} strokeWidth={1.7} />}
          onClick={() => editor.chain().focus().undo().run()}
          title="Отменить"
        />
        <ToolBtn
          icon={<Redo size={15} strokeWidth={1.7} />}
          onClick={() => editor.chain().focus().redo().run()}
          title="Вернуть"
        />
      </span>
    </div>
  );
}

function ToolBtn({
  icon,
  active,
  onClick,
  title,
  disabled,
}: {
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={clsx(
        "flex h-7 w-7 items-center justify-center rounded-[6px] cursor-pointer transition-colors",
        active
          ? "bg-purple-primary text-white"
          : "text-grey-dark hover:bg-white",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {icon}
    </button>
  );
}

function Sep() {
  return (
    <span className="mx-0.5 h-5 w-px bg-[rgba(102,112,133,0.25)]" />
  );
}
