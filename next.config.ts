import type { NextConfig } from "next";

// A interface do diário é o arquivo estático em public/index.html, mas o App
// Router responde "/" pelo app/page.tsx. O rewrite em beforeFiles roda antes das
// rotas de página e entrega o diário na raiz.
//
// O build Next continua de pé de propósito: é ele que serve
// app/api/estimate-carbs/route.ts, o endpoint que o diário chama para a
// estimativa de carboidratos por IA. Publicar public/ como saída estática
// derrubaria essa função junto.
const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
