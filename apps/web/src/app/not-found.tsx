// Минимальный not-found.tsx для App Router. Plain HTML без hooks/components,
// чтобы не триггерить hydration или Suspense в build-time prerender.
export default function NotFound() {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#171717",
        }}
      >
        <div style={{ maxWidth: "420px" }}>
          <h1 style={{ margin: 0, fontSize: "2rem" }}>404</h1>
          <p style={{ margin: "0.5rem 0 1.5rem" }}>
            Страница не найдена. Возможно, дело удалено.
          </p>
          <a
            href="/folders"
            style={{
              display: "inline-block",
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px solid #e4e4e7",
              color: "inherit",
              textDecoration: "none",
            }}
          >
            К списку дел
          </a>
        </div>
      </body>
    </html>
  );
}
