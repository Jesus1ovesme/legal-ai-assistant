/** @type {import("next").NextConfig} */
const nextConfig = {
  // Strict Mode в dev делает ×2 mount/render → ×2 fetch/polling → медленнее.
  // На single-user MVP это не нужно.
  reactStrictMode: false,
  poweredByHeader: false,
  compress: true,

  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },

  // Next 15 dev блокирует _next/* запросы с другого origin.
  allowedDevOrigins: ["example.com", "*.example.com", "127.0.0.1", "localhost"],

  transpilePackages: [
    "@danilurist/types",
    "@danilurist/db",
    "@danilurist/sandbox",
    "@danilurist/claude-client",
    "@danilurist/claude-tools",
    "@danilurist/embeddings",
    "@danilurist/ocr",
    "@danilurist/stt",
    "@danilurist/docx-export",
    "@danilurist/ui",
  ],

  serverExternalPackages: ["pg", "pg-boss", "bcryptjs", "@huggingface/transformers"],

  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },

  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex" },
          // Permissions-Policy: глушим неиспользуемые API. mic=self нужен для
          // voice-input (Whisper STT через MediaRecorder), остальное off.
          {
            key: "Permissions-Policy",
            value:
              "geolocation=(), camera=(), microphone=(self), payment=(), usb=(), serial=(), bluetooth=()",
          },
          // HSTS: единожды попав на сайт по https — браузер запоминает домен
          // и не пускает plaintext. 6 месяцев. preload не включаем (private domain).
          ...(isProd
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=15552000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
