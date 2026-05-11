/**
 * @legal-ai-assistant/docx-export — markdown → .docx через mdast → docx маппинг.
 *
 * **Реализация Phase 3** (см. ROADMAP.md). Стили: A4, поля 25/20/20/15мм,
 * Times New Roman 12, заголовки 14/13. Поддержка GFM таблиц, списков, blockquote,
 * footnote-references для citations.
 */

export interface DocxStyles {
  font: string;
  baseFontSize: number; // half-points (24 = 12pt)
  marginsMm: { top: number; right: number; bottom: number; left: number };
}

export const DEFAULT_STYLES: DocxStyles = {
  font: "Times New Roman",
  baseFontSize: 24,
  marginsMm: { top: 25, right: 20, bottom: 20, left: 15 },
};
