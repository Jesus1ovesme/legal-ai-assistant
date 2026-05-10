import type { Metadata, Viewport } from "next";

// Anthropic Claude Design Language palette + typography.
// Inline CSS обходит edge-case Next 15 webpack flight-css-loader в monorepo.
const inlineGlobalCss = `
:root {
  /* Warm beige/cream base — характерный фон claude.ai */
  --color-background: #faf9f5;
  --color-surface: #ffffff;
  --color-foreground: #1a1a1a;
  --color-muted: #f0eee6;
  --color-muted-2: #e8e4d8;
  --color-muted-foreground: #6b6857;
  --color-border: #e0dccd;
  --color-border-strong: #c8c2ad;

  /* Peach/coral accent — Anthropic brand color */
  --color-accent: #c96442;
  --color-accent-hover: #b25638;
  --color-accent-foreground: #ffffff;
  --color-accent-soft: #f5e6dd;

  --color-destructive: #b8453a;
  --color-destructive-foreground: #ffffff;
  --color-destructive-soft: #f4d9d4;

  --color-success: #6a8d4e;
  --color-success-soft: #e2ead0;

  /* Shadows — soft / very soft / overlay */
  --shadow-xs: 0 1px 2px rgba(60, 50, 30, 0.04);
  --shadow-sm: 0 2px 6px rgba(60, 50, 30, 0.06);
  --shadow-md: 0 6px 16px rgba(60, 50, 30, 0.08);
  --shadow-lg: 0 16px 40px rgba(60, 50, 30, 0.14);
  --shadow-overlay: 0 24px 60px rgba(0, 0, 0, 0.20);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
  --font-serif: "Source Serif Pro", "Source Serif", "Charter", "Georgia", "Times New Roman", serif;
  --font-mono: "JetBrains Mono", "SF Mono", "Menlo", ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #1f1d18;
    --color-surface: #2a2722;
    --color-foreground: #ecebe5;
    --color-muted: #2f2c25;
    --color-muted-2: #3a362d;
    --color-muted-foreground: #a8a293;
    --color-border: #3d3a31;
    --color-border-strong: #5a554a;
    --color-accent: #d97757;
    --color-accent-hover: #e3845f;
    --color-accent-foreground: #1f1d18;
    --color-accent-soft: #3d2920;
    --color-destructive: #d97070;
    --color-destructive-soft: #3a201d;
    --color-success: #95b07a;
    --color-success-soft: #2a3622;
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.18);
    --shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.22);
    --shadow-md: 0 6px 16px rgba(0, 0, 0, 0.30);
    --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.45);
    --shadow-overlay: 0 24px 60px rgba(0, 0, 0, 0.55);
  }
}

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  font-feature-settings: "ss01", "cv11";
  background: var(--color-background);
  color: var(--color-foreground);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-size: 15px;
  line-height: 1.5;
}

* { box-sizing: border-box; }

button, input, textarea, select {
  font-family: inherit;
  color: inherit;
  font-size: inherit;
}

button { transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, opacity 120ms ease, transform 60ms ease; }
button:active:not(:disabled) { transform: translateY(0.5px); }

a { color: var(--color-accent); text-decoration: none; }
a:hover { text-decoration: underline; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 5px; border: 2px solid var(--color-background); }
::-webkit-scrollbar-thumb:hover { background: var(--color-border-strong); }

/* Typography helpers */
.serif { font-family: var(--font-serif); letter-spacing: -0.01em; }

/* Subtle entry animation for modals */
@keyframes claude-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes claude-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
`;

export const metadata: Metadata = {
  title: "Юрист — AI-помощник",
  description: "AI-помощник юриста: дела, документы, НПА, судебная практика.",
  applicationName: "Юрист",
  formatDetection: { telephone: false, email: false, address: false },
  // icons автоматически берутся из app/icon.svg и app/apple-icon.svg
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <style dangerouslySetInnerHTML={{ __html: inlineGlobalCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
