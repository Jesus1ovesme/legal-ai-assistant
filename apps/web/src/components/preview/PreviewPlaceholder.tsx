interface PreviewPlaceholderProps {
  folderName?: string;
  caseTypeLabel?: string;
  documentCount?: number;
}

/**
 * Правая панель — preview документа. Phase 1.8d покажет список файлов с inline preview.
 * Phase 2+ — выделенный документ + кнопка экспорта.
 */
export function PreviewPlaceholder({
  folderName,
  caseTypeLabel,
  documentCount = 0,
}: PreviewPlaceholderProps) {
  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <header>
        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--color-muted-foreground)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Документы
        </span>
      </header>

      {folderName ? (
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "8px",
            background: "var(--color-background)",
            border: "1px solid var(--color-border)",
            fontSize: "0.875rem",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600 }}>{folderName}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
            {caseTypeLabel}
          </div>
          <div
            style={{
              marginTop: "0.5rem",
              fontSize: "0.75rem",
              color: "var(--color-muted-foreground)",
            }}
          >
            Файлов: {documentCount}
          </div>
        </div>
      ) : null}

      <p style={{ fontSize: "0.825rem", color: "var(--color-muted-foreground)", lineHeight: 1.5 }}>
        Перетащите PDF, DOCX, JPG/PNG или TXT в чат — файл загрузится в эту папку и пройдёт OCR
        (Phase 1.8d / Phase 3).
      </p>
    </div>
  );
}
