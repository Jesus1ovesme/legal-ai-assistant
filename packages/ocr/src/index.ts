/**
 * @danilurist/ocr — OCR pipeline (Tesseract `rus+eng` + pdftotext fallback + mammoth).
 *
 * **Реализация Phase 3** (см. ROADMAP.md). Стратегия:
 *   - PDF: сначала `pdftotext -layout` (быстрый embedded text). Если >300 значимых
 *     символов — done. Иначе → `pdftoppm -r 200` → png-страницы → tesseract.
 *   - Image: tesseract напрямую с `-l rus+eng --psm 1`.
 *   - DOCX: mammoth.extractRawText.
 *   - TXT: as-is.
 *   - Audio: ocr_status='skipped'.
 *
 * Все бинарники (tesseract+rus, pdftotext, pdftoppm, ffmpeg) уже стоят на сервере.
 */

export interface OcrResult {
  text: string;
  /** Сколько страниц обработано (для PDF). */
  pages?: number;
  /** Какой движок отработал в итоге. */
  engine: "pdftotext" | "tesseract" | "mammoth" | "plain";
  durationMs: number;
}

export const TESSERACT_LANGS = "rus+eng";
export const PDFTOPPM_DPI = 200;
