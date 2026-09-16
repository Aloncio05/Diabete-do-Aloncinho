import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// O banco é opcional: sem DATABASE_URL o app continua guardando no navegador,
// e a sincronização é que fica indisponível. É o que permite publicar antes de
// o banco existir sem derrubar nada.
export function bancoConfigurado() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDb() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  return drizzle(neon(url), { schema });
}
