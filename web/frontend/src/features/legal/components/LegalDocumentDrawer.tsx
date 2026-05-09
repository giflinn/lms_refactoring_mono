import { useEffect, useState } from "react";
import { Drawer } from "../../../components/ui/Drawer";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { RichTextEditor } from "../../lms/components/RichTextEditor";
import { LegalApiError, type LegalSlug } from "../api";
import { useLegalDocument, useUpdateLegal } from "../queries";

type Props = {
  slug: LegalSlug | null;
  open: boolean;
  onClose: () => void;
};

// Edit drawer for a single legal document. Reuses the LMS RichTextEditor
// (TipTap → HTML) and the same Drawer chrome as cancellations / lessons.
export function LegalDocumentDrawer({ slug, open, onClose }: Props) {
  const docQ = useLegalDocument(open ? slug : null);
  const update = useUpdateLegal();

  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();

  // Hydrate when the doc lands or the slug changes.
  useEffect(() => {
    if (!open) return;
    setTitleError(undefined);
    setGeneralError(undefined);
    if (docQ.data) {
      setTitle(docQ.data.title);
      setHtml(docQ.data.contentHtml);
    }
  }, [open, docQ.data]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug) return;
    setTitleError(undefined);
    setGeneralError(undefined);
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Введите название");
      return;
    }
    try {
      await update.mutateAsync({
        slug,
        title: trimmed,
        contentHtml: html,
      });
      onClose();
    } catch (err) {
      if (err instanceof LegalApiError) {
        if (err.code === "content_too_long") {
          setGeneralError("Документ слишком большой.");
        } else {
          setGeneralError("Не удалось сохранить документ.");
        }
      } else {
        setGeneralError("Нет соединения с сервером.");
      }
    }
  }

  const submitting = update.isPending;
  const loading = open && docQ.isLoading;

  return (
    <Drawer
      open={open}
      title={docQ.data?.title ?? "Документ"}
      onClose={onClose}
      footer={
        <Button
          type="submit"
          form="legal-doc-form"
          disabled={submitting || loading}
        >
          {submitting ? "Сохраняем…" : "Сохранить"}
        </Button>
      }
    >
      {loading ? (
        <p className="text-[13px] text-grey-medium">Загружаем документ…</p>
      ) : (
        <form
          id="legal-doc-form"
          onSubmit={onSubmit}
          className="flex flex-col gap-4 pb-2"
        >
          <Input
            fullWidth
            label="Название*"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={titleError}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-grey-medium">
              Содержимое
            </span>
            <RichTextEditor value={html} onChange={setHtml} />
          </div>
          {generalError && (
            <p className="text-[13px] text-red-error">{generalError}</p>
          )}
        </form>
      )}
    </Drawer>
  );
}
