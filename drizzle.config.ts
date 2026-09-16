import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  // Postgres (Neon). Era sqlite, de um andaime do Cloudflare D1 que nunca rodou
  // na Vercel — o db/index.ts importava "cloudflare:workers".
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
