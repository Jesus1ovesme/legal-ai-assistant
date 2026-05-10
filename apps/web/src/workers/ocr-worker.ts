/**
 * OCR worker — отдельный PM2-процесс, потребляющий jobs из pg-boss queue 'ocr.run'.
 *
 * Стратегия:
 *   PDF: pdftotext -layout (быстрый embedded text). Если >300 значимых символов — done.
 *        Иначе: pdftoppm -r 200 → png-страницы → tesseract -l rus+eng --psm 1 → склейка.
 *   Image: tesseract напрямую (rus+eng).
 *   DOCX:  mammoth.extractRawText.
 *   TXT:   as-is.
 *   Audio: skipped.
 *
 * Все бинарники (tesseract, pdftotext, pdftoppm, mammoth-via-npm) уже стоят на сервере.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import PgBoss from "pg-boss";
import { eq } from "drizzle-orm";
import mammoth from "mammoth";
import { createDb, schema } from "@danilurist/db";

const __envPath = process.env.DOTENV_CONFIG_PATH ?? ".env";
loadDotenv({ path: __envPath });

const QUEUE_NAME = "ocr.run";

interface OcrJobData {
  fileId: string;
}

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exec(cmd: string, args: string[], opts?: { input?: string; timeoutMs?: number }): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${cmd} timeout`));
    }, opts?.timeoutMs ?? 5 * 60 * 1000);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    if (opts?.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

function looksLikeMostlyWhitespace(s: string): boolean {
  const significant = s.replace(/\s+/g, "").length;
  return significant < 300;
}

async function ocrPdf(absPath: string): Promise<{ text: string; engine: "pdftotext" | "tesseract"; pages?: number }> {
  const direct = await exec("pdftotext", ["-layout", absPath, "-"], { timeoutMs: 60_000 });
  if (direct.code === 0 && !looksLikeMostlyWhitespace(direct.stdout)) {
    return { text: direct.stdout, engine: "pdftotext" };
  }
  // Fallback: render pages → tesseract.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "ocr-"));
  try {
    const prefix = path.join(tmpDir, "page");
    const ppm = await exec("pdftoppm", ["-r", "200", "-png", absPath, prefix], { timeoutMs: 180_000 });
    if (ppm.code !== 0) throw new Error(`pdftoppm exit ${ppm.code}: ${ppm.stderr.slice(0, 300)}`);
    const pages = readdirSync(tmpDir).filter((f) => f.endsWith(".png")).sort();
    let text = "";
    for (const page of pages) {
      const tess = await exec(
        "tesseract",
        [path.join(tmpDir, page), "-", "-l", "rus+eng", "--psm", "1"],
        { timeoutMs: 120_000 },
      );
      if (tess.code !== 0) throw new Error(`tesseract exit ${tess.code}: ${tess.stderr.slice(0, 300)}`);
      text += tess.stdout + "\n\n";
    }
    return { text, engine: "tesseract", pages: pages.length };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function ocrImage(absPath: string): Promise<string> {
  const tess = await exec("tesseract", [absPath, "-", "-l", "rus+eng", "--psm", "1"], {
    timeoutMs: 120_000,
  });
  if (tess.code !== 0) throw new Error(`tesseract exit ${tess.code}: ${tess.stderr.slice(0, 300)}`);
  return tess.stdout;
}

async function processFile(fileId: string): Promise<void> {
  const db = createDb({ connectionString: process.env.DATABASE_URL! });
  const [file] = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.id, fileId))
    .limit(1);
  if (!file) {
    console.log(`[ocr] file ${fileId} not found, skipping`);
    return;
  }
  if (file.ocrStatus === "done" || file.ocrStatus === "skipped") {
    console.log(`[ocr] file ${fileId} already processed (${file.ocrStatus})`);
    return;
  }

  await db.update(schema.files).set({ ocrStatus: "processing" }).where(eq(schema.files.id, fileId));

  try {
    let text = "";
    let engine = "plain";

    if (file.mime === "application/pdf") {
      const result = await ocrPdf(file.storagePath);
      text = result.text;
      engine = result.engine;
    } else if (file.mime.startsWith("image/")) {
      text = await ocrImage(file.storagePath);
      engine = "tesseract";
    } else if (
      file.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mime === "application/msword"
    ) {
      const result = await mammoth.extractRawText({ path: file.storagePath });
      text = result.value;
      engine = "mammoth";
    } else if (file.mime === "text/plain") {
      text = readFileSync(file.storagePath, "utf8");
      engine = "plain";
    } else if (file.mime.startsWith("audio/")) {
      await db
        .update(schema.files)
        .set({ ocrStatus: "skipped", ocrText: null })
        .where(eq(schema.files.id, fileId));
      console.log(`[ocr] file ${fileId} (${file.mime}) — skipped (audio)`);
      return;
    } else {
      throw new Error(`unsupported mime: ${file.mime}`);
    }

    await db
      .update(schema.files)
      .set({ ocrStatus: "done", ocrText: text, ocrError: null })
      .where(eq(schema.files.id, fileId));

    // Также сохраняем .txt файл рядом — Claude сможет его прочитать через Read.
    const txtSidecar = file.storagePath.replace(/\.[^.]+$/, ".ocr.txt");
    try {
      writeFileSync(txtSidecar, text, { mode: 0o640 });
    } catch (err) {
      console.warn(`[ocr] sidecar write failed: ${(err as Error).message}`);
    }

    console.log(`[ocr] ${fileId} done via ${engine}: ${text.length} chars`);
  } catch (err) {
    const msg = (err as Error).message.slice(0, 1000);
    await db
      .update(schema.files)
      .set({ ocrStatus: "failed", ocrError: msg })
      .where(eq(schema.files.id, fileId));
    console.error(`[ocr] ${fileId} failed: ${msg}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not set");
  }

  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "pgboss",
  });

  boss.on("error", (err) => console.error("[ocr] pg-boss error:", err));
  await boss.start();
  await boss.createQueue(QUEUE_NAME);

  console.log(`[ocr] worker started, listening on queue "${QUEUE_NAME}"`);

  // Sweep stuck rows: если предыдущий worker умер во время processFile (SIGKILL,
  // OOM, exception), row остался в "processing". Без этого rows зависали навсегда.
  // Сбрасываем в "pending" — backfill ниже подхватит и переотправит в очередь.
  try {
    const db = createDb({ connectionString: databaseUrl });
    const stuck = await db
      .update(schema.files)
      .set({ ocrStatus: "pending" })
      .where(eq(schema.files.ocrStatus, "processing"))
      .returning({ id: schema.files.id });
    if (stuck.length > 0) {
      console.log(`[ocr] swept ${stuck.length} stuck "processing" rows → pending`);
    }
  } catch (err) {
    console.error("[ocr] sweep error:", (err as Error).message);
  }

  await boss.work<OcrJobData>(QUEUE_NAME, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      console.log(`[ocr] job ${job.id} → file ${job.data.fileId}`);
      await processFile(job.data.fileId);
    }
  });

  // Periodic backfill: каждые 30 сек ищем pending файлы (если worker был перезапущен).
  const backfillInterval = setInterval(async () => {
    try {
      const db = createDb({ connectionString: databaseUrl });
      const pending = await db
        .select({ id: schema.files.id })
        .from(schema.files)
        .where(eq(schema.files.ocrStatus, "pending"))
        .limit(10);
      for (const f of pending) {
        await boss.send(QUEUE_NAME, { fileId: f.id });
      }
      if (pending.length > 0) console.log(`[ocr] backfilled ${pending.length} pending jobs`);
    } catch (err) {
      console.error("[ocr] backfill error:", (err as Error).message);
    }
  }, 30_000);

  // Graceful shutdown: pm2 SIGTERM → останавливаем pull новых job'ов и
  // ждём текущий до 10с. Без этого worker зависал до kill-timeout, оставляя
  // rows в processing навсегда (никто их не сбрасывал в pending).
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[ocr] ${signal} — graceful shutdown`);
    clearInterval(backfillInterval);
    try {
      await boss.stop({ graceful: true, timeout: 10_000 });
    } catch (err) {
      console.error("[ocr] stop error:", (err as Error).message);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[ocr] fatal:", err);
  process.exit(1);
});
