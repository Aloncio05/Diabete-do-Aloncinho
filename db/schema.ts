import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Uma linha por conta Google. O diário inteiro cabe num documento — são alguns
// kilobytes por ano — e guardar assim evita um esquema relacional inteiro para
// ler e gravar sempre o mesmo objeto.
//
// Nada de auth é persistido: a sessão é JWT, e `usuarioId` é o `sub` do Google.
export const diarios = pgTable("diarios", {
  usuarioId: text("usuario_id").primaryKey(),
  dados: jsonb("dados").notNull(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});
