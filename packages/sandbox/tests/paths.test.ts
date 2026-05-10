import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  resolveSandboxPath,
  assertNoSymlinks,
  SandboxError,
  type SandboxErrorCode,
} from "../src/index";

const VALID_ULID = "01HG7K8H4M3X2Y9Z5R7Q1V8W3T";

function expectRejects(fn: () => unknown, code: SandboxErrorCode): void {
  try {
    fn();
    throw new Error(`Expected SandboxError(${code}) but no error was thrown`);
  } catch (err) {
    expect(err).toBeInstanceOf(SandboxError);
    expect((err as SandboxError).code).toBe(code);
  }
}

describe("resolveSandboxPath", () => {
  const root = "/tmp/sandbox-test-fixed-root";

  it("happy path: builds absolute path inside folder", () => {
    const result = resolveSandboxPath({
      rootDir: root,
      folderId: VALID_ULID,
      filename: "abc.pdf",
    });
    expect(result).toBe(`${root}/${VALID_ULID}/abc.pdf`);
  });

  it("rejects invalid folderId (not a ULID)", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: "../etc/passwd",
          filename: "file.txt",
        }),
      "INVALID_FOLDER_ID",
    );
  });

  it("rejects empty folderId", () => {
    expectRejects(
      () => resolveSandboxPath({ rootDir: root, folderId: "", filename: "a.txt" }),
      "INVALID_FOLDER_ID",
    );
  });

  it("rejects ULID with lowercase or banned chars (I, L, O, U)", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: "01hg7k8h4m3x2y9z5r7q1v8w3t",
          filename: "a.txt",
        }),
      "INVALID_FOLDER_ID",
    );
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: "01HG7K8H4M3X2Y9Z5R7Q1V8W3I", // I forbidden
          filename: "a.txt",
        }),
      "INVALID_FOLDER_ID",
    );
  });

  it("rejects NUL-byte in filename", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: VALID_ULID,
          filename: "a\0b.txt",
        }),
      "NUL_BYTE",
    );
  });

  it("rejects forward slash in filename", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: VALID_ULID,
          filename: "../etc/passwd",
        }),
      "PATH_SEPARATOR",
    );
  });

  it("rejects backslash in filename", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: VALID_ULID,
          filename: "..\\windows\\system32",
        }),
      "PATH_SEPARATOR",
    );
  });

  it("rejects . and ..", () => {
    expectRejects(
      () => resolveSandboxPath({ rootDir: root, folderId: VALID_ULID, filename: "." }),
      "DOT_NAME",
    );
    expectRejects(
      () => resolveSandboxPath({ rootDir: root, folderId: VALID_ULID, filename: ".." }),
      "DOT_NAME",
    );
  });

  it("rejects empty filename", () => {
    expectRejects(
      () => resolveSandboxPath({ rootDir: root, folderId: VALID_ULID, filename: "" }),
      "TOO_LONG",
    );
  });

  it("rejects filename longer than MAX_FILENAME_LENGTH", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: VALID_ULID,
          filename: "x".repeat(300),
        }),
      "TOO_LONG",
    );
  });

  it("rejects absolute path in filename (still treated as path-separator)", () => {
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: VALID_ULID,
          filename: "/etc/passwd",
        }),
      "PATH_SEPARATOR",
    );
  });

  it("rejects sibling escape via ../sibling-folder/", () => {
    // path-separator уже не пропустит, но проверим что для UTF-encoded не пройдёт.
    expectRejects(
      () =>
        resolveSandboxPath({
          rootDir: root,
          folderId: VALID_ULID,
          filename: "%2e%2e/sibling/file.txt",
        }),
      "PATH_SEPARATOR",
    );
  });

  it("accepts unicode filenames (russian)", () => {
    const result = resolveSandboxPath({
      rootDir: root,
      folderId: VALID_ULID,
      filename: "Полис_ОСАГО.pdf",
    });
    expect(result).toBe(`${root}/${VALID_ULID}/Полис_ОСАГО.pdf`);
  });
});

describe("assertNoSymlinks", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sandbox-symlink-"));
    fs.mkdirSync(path.join(tmpRoot, "ok-folder"), { recursive: true, mode: 0o750 });
    fs.symlinkSync("/tmp", path.join(tmpRoot, "evil-link"));
    fs.mkdirSync(path.join(tmpRoot, "evil-parent"), { recursive: true, mode: 0o750 });
    fs.symlinkSync("/etc", path.join(tmpRoot, "evil-parent", "child"));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("passes when no component is a symlink (target may not exist yet)", () => {
    expect(() =>
      assertNoSymlinks(tmpRoot, path.join(tmpRoot, "ok-folder", "new-file.pdf")),
    ).not.toThrow();
  });

  it("rejects when an intermediate component is a symlink", () => {
    expect(() => assertNoSymlinks(tmpRoot, path.join(tmpRoot, "evil-link", "x.txt"))).toThrow(
      SandboxError,
    );
  });

  it("rejects when nested symlink exists in parent chain", () => {
    expect(() =>
      assertNoSymlinks(tmpRoot, path.join(tmpRoot, "evil-parent", "child", "x.txt")),
    ).toThrow(SandboxError);
  });

  it("rejects when target is outside rootDir", () => {
    expect(() => assertNoSymlinks(tmpRoot, "/etc/passwd")).toThrow(SandboxError);
  });
});
