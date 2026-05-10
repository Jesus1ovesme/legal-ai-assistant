import { describe, expect, it } from "vitest";
import { detectMime, validateUpload, SandboxError } from "../src/index";

describe("detectMime", () => {
  it("detects PDF by magic bytes", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
    const result = await detectMime(pdf);
    expect(result?.mime).toBe("application/pdf");
    expect(result?.ext).toBe("pdf");
  });

  it("detects PNG", async () => {
    // Минимальный валидный PNG: signature + IHDR chunk (file-type@19 читает IHDR).
    const png = new Uint8Array([
      // PNG signature
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      // IHDR chunk: length=13, type="IHDR", data (width=1, height=1, depth=8, RGBA), CRC
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
      0x1f, 0x15, 0xc4, 0x89,
    ]);
    const result = await detectMime(png);
    expect(result?.mime).toBe("image/png");
  });

  it("detects JPEG", async () => {
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const result = await detectMime(jpg);
    expect(result?.mime).toBe("image/jpeg");
    expect(result?.ext).toBe("jpg");
  });

  it("falls back to text/plain for ASCII content", async () => {
    const txt = new TextEncoder().encode("Это пример текстового документа.\nВторая строка.");
    const result = await detectMime(txt);
    expect(result?.mime).toBe("text/plain");
    expect(result?.ext).toBe("txt");
  });

  it("returns null for unknown binary content", async () => {
    const random = new Uint8Array([0x00, 0x01, 0x02, 0x00, 0xff, 0xfe, 0x00, 0xab]);
    const result = await detectMime(random);
    expect(result).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts valid PDF under size limit", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const result = await validateUpload(pdf, { maxSizeBytes: 1024 });
    expect(result.mime).toBe("application/pdf");
  });

  it("rejects empty buffer", async () => {
    await expect(validateUpload(new Uint8Array(0), { maxSizeBytes: 1024 })).rejects.toThrow(
      SandboxError,
    );
  });

  it("rejects oversized buffer", async () => {
    const big = new Uint8Array(2048);
    big.set([0x25, 0x50, 0x44, 0x46]);
    await expect(validateUpload(big, { maxSizeBytes: 1024 })).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
  });

  it("rejects unknown binary as MIME_NOT_ALLOWED", async () => {
    const random = new Uint8Array([0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xab]);
    await expect(validateUpload(random, { maxSizeBytes: 1024 })).rejects.toMatchObject({
      code: "MIME_NOT_ALLOWED",
    });
  });
});
