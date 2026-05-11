import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import type { Root, Content, PhrasingContent } from "mdast";
import { createDb, schema } from "@legal-ai-assistant/db";
import { ULID_REGEX } from "@legal-ai-assistant/types";
import { getEnv } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuerySchema = z.object({
  messageId: z.string().regex(ULID_REGEX),
});

interface InlineStyle {
  bold?: boolean;
  italics?: boolean;
  color?: string;
}

/**
 * Обход mdast inline-дерева с накопленным стилем. Делаем один проход вместо
 * inline-конвертации в TextRun + reverse-engineering обратно. SOLID: каждый
 * формат управляет только своим вкладом в стиль.
 */
function inlineToTextRuns(nodes: PhrasingContent[], style: InlineStyle = {}): TextRun[] {
  const out: TextRun[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out.push(new TextRun({ text: node.value, ...style }));
        break;
      case "strong":
        out.push(...inlineToTextRuns(node.children, { ...style, bold: true }));
        break;
      case "emphasis":
        out.push(...inlineToTextRuns(node.children, { ...style, italics: true }));
        break;
      case "inlineCode":
        out.push(new TextRun({ text: node.value, font: "Consolas", ...style }));
        break;
      case "link": {
        const text = node.children
          .map((c) => (c.type === "text" ? c.value : ""))
          .join("");
        out.push(
          new TextRun({
            text: `${text} (${node.url})`,
            color: "0066cc",
            underline: {},
            ...style,
          }),
        );
        break;
      }
      case "break":
        out.push(new TextRun({ text: "\n", ...style }));
        break;
      default:
        if ("value" in node && typeof node.value === "string") {
          out.push(new TextRun({ text: node.value, ...style }));
        }
    }
  }
  return out;
}

function blockToParagraphs(node: Content): Paragraph[] {
  switch (node.type) {
    case "heading": {
      const headingMap: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      };
      return [
        new Paragraph({
          heading: headingMap[node.depth] ?? HeadingLevel.HEADING_3,
          children: inlineToTextRuns(node.children),
          spacing: { before: 240, after: 120 },
        }),
      ];
    }
    case "paragraph":
      return [
        new Paragraph({
          children: inlineToTextRuns(node.children),
          spacing: { after: 120 },
        }),
      ];
    case "list": {
      const ps: Paragraph[] = [];
      for (const item of node.children) {
        for (const child of item.children) {
          if (child.type === "paragraph") {
            ps.push(
              new Paragraph({
                children: inlineToTextRuns(child.children),
                bullet: { level: 0 },
              }),
            );
          }
        }
      }
      return ps;
    }
    case "blockquote": {
      const ps: Paragraph[] = [];
      for (const child of node.children) {
        if (child.type === "paragraph") {
          ps.push(
            new Paragraph({
              children: inlineToTextRuns(child.children, {
                italics: true,
                color: "555555",
              }),
              indent: { left: 720 },
              spacing: { after: 120 },
            }),
          );
        }
      }
      return ps;
    }
    case "code":
      return node.value.split("\n").map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: "Consolas", size: 20 })],
            spacing: { after: 0 },
          }),
      );
    case "thematicBreak":
      return [
        new Paragraph({
          children: [new TextRun({ text: "—".repeat(60), color: "cccccc" })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        }),
      ];
    default:
      return [];
  }
}

function markdownToDocx(markdown: string, title: string): Promise<Buffer> {
  const tree: Root = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const paragraphs: Paragraph[] = [];
  for (const node of tree.children) {
    paragraphs.push(...blockToParagraphs(node));
  }

  // Поля по ГОСТ Р 7.0.97-2016 (документы организаций):
  //   left=30mm=1701twip, right=15mm=850, top=20mm=1134, bottom=20mm=1134
  // Times New Roman 14pt = size 28 (half-points). Межстрочный 1.5x.
  const doc = new Document({
    creator: "legal-ai-assistant",
    title,
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 28 },
          paragraph: { spacing: { line: 360, lineRule: "auto" } },
        },
        heading1: {
          run: { font: "Times New Roman", size: 32, bold: true },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } },
        },
        heading2: {
          run: { font: "Times New Roman", size: 28, bold: true },
          paragraph: { spacing: { before: 200, after: 120 } },
        },
        heading3: {
          run: { font: "Times New Roman", size: 28, bold: true, italics: true },
          paragraph: { spacing: { before: 160, after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, right: 850, bottom: 1134, left: 1701 },
            size: { width: 11906, height: 16838 }, // A4 portrait
          },
        },
        children: paragraphs,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ messageId: url.searchParams.get("messageId") });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_message_id" }, { status: 400 });
  }

  const env = getEnv();
  const db = createDb({ connectionString: env.DATABASE_URL });

  const [msg] = await db
    .select({
      id: schema.messages.id,
      content: schema.messages.content,
      folderId: schema.messages.folderId,
      role: schema.messages.role,
    })
    .from(schema.messages)
    .where(eq(schema.messages.id, parsed.data.messageId))
    .limit(1);

  if (!msg) {
    return NextResponse.json({ error: "message_not_found" }, { status: 404 });
  }

  const [folder] = await db
    .select({ name: schema.folders.name, userId: schema.folders.userId })
    .from(schema.folders)
    .where(eq(schema.folders.id, msg.folderId))
    .limit(1);
  if (!folder || folder.userId !== auth.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const buffer = await markdownToDocx(msg.content, folder.name);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `${folder.name.replace(/[^\wЀ-ӿа-яА-Я ]+/g, "")}-${ts}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "content-length": String(buffer.length),
    },
  });
}
