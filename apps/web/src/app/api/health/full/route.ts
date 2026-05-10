import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { statfs } from "node:fs/promises";
import { connect } from "node:tls";
import { createDb } from "@danilurist/db";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckResult {
  ok: boolean;
  detail?: unknown;
  error?: string;
}

interface FullHealthResponse {
  ok: boolean;
  ts: string;
  uptimeSec: number;
  checks: {
    db: CheckResult;
    disk: CheckResult;
    term_server: CheckResult;
    tls: CheckResult;
  };
}

async function checkDb(): Promise<CheckResult> {
  try {
    const env = getEnv();
    const db = createDb({ connectionString: env.DATABASE_URL });
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    return { ok: true, detail: { latencyMs: Date.now() - start } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkDisk(): Promise<CheckResult> {
  try {
    const stats = await statfs(process.env.UPLOADS_ROOT ?? ".");
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const usedPct = ((total - free) / total) * 100;
    return {
      ok: usedPct < 95,
      detail: {
        usedPct: Math.round(usedPct * 10) / 10,
        freeMb: Math.round(free / 1024 / 1024),
        totalMb: Math.round(total / 1024 / 1024),
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkTermServer(): Promise<CheckResult> {
  try {
    const start = Date.now();
    const res = await fetch("http://127.0.0.1:3011/health", {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    const data = (await res.json()) as { sessions?: number };
    return { ok: true, detail: { latencyMs: Date.now() - start, sessions: data.sessions ?? 0 } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkTls(host = "example.com"): Promise<CheckResult> {
  return new Promise((resolve) => {
    const sock = connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 3000 },
      () => {
        const cert = sock.getPeerCertificate();
        sock.end();
        if (!cert || !cert.valid_to) {
          resolve({ ok: false, error: "no_cert" });
          return;
        }
        const expiresAt = new Date(cert.valid_to).getTime();
        const daysLeft = Math.floor((expiresAt - Date.now()) / 86400000);
        resolve({
          ok: daysLeft > 7,
          detail: {
            daysLeft,
            issuer: cert.issuer?.O ?? "unknown",
            validTo: cert.valid_to,
          },
        });
      },
    );
    sock.on("error", (err) => {
      resolve({ ok: false, error: err.message });
    });
    sock.on("timeout", () => {
      sock.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

/** Полная проверка готовности сервиса. Используется UptimeRobot/Healthchecks.io. */
export async function GET() {
  const [db, disk, term_server, tls] = await Promise.all([
    checkDb(),
    checkDisk(),
    checkTermServer(),
    checkTls(),
  ]);

  const allOk = db.ok && disk.ok && term_server.ok && tls.ok;
  const body: FullHealthResponse = {
    ok: allOk,
    ts: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    checks: { db, disk, term_server, tls },
  };
  return NextResponse.json(body, { status: allOk ? 200 : 503 });
}
