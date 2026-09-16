import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { bancoConfigurado, getDb } from "@/db";
import { diarios } from "@/db/schema";
import { diarioVazio, mesclarDiarios, normalizarDiario } from "@/lib/diario";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

// Toda rota daqui responde só sobre o diário de quem está logado: o id vem da
// sessão, nunca do corpo do pedido, senão bastaria mandar outro id para ler o
// diário alheio.
async function donoDoDiario() {
  const sessao = await auth();
  return sessao?.user?.id ?? null;
}

export async function GET() {
  if (!bancoConfigurado()) return json(503, { erro: "Sincronização não configurada." });

  const usuarioId = await donoDoDiario();

  if (!usuarioId) return json(401, { erro: "Entre na conta para sincronizar." });

  const [linha] = await getDb()
    .select()
    .from(diarios)
    .where(eq(diarios.usuarioId, usuarioId))
    .limit(1);

  return json(200, {
    diario: linha ? normalizarDiario(linha.dados) : diarioVazio(),
    atualizadoEm: linha?.atualizadoEm ?? null,
  });
}

// Junta o que veio do aparelho com o que já está guardado, em vez de
// sobrescrever: dois aparelhos editando não podem apagar o trabalho um do outro.
export async function PUT(request: NextRequest) {
  if (!bancoConfigurado()) return json(503, { erro: "Sincronização não configurada." });

  const usuarioId = await donoDoDiario();

  if (!usuarioId) return json(401, { erro: "Entre na conta para sincronizar." });

  let corpo: unknown;

  try {
    corpo = await request.json();
  } catch {
    return json(400, { erro: "Dados inválidos." });
  }

  const doAparelho = normalizarDiario((corpo as { diario?: unknown })?.diario);
  const db = getDb();

  const [existente] = await db
    .select()
    .from(diarios)
    .where(eq(diarios.usuarioId, usuarioId))
    .limit(1);

  const juntos = existente
    ? mesclarDiarios(doAparelho, normalizarDiario(existente.dados))
    : doAparelho;

  const agora = new Date();

  await db
    .insert(diarios)
    .values({ usuarioId, dados: juntos, atualizadoEm: agora })
    .onConflictDoUpdate({
      target: diarios.usuarioId,
      set: { dados: juntos, atualizadoEm: agora },
    });

  return json(200, { diario: juntos, atualizadoEm: agora.toISOString() });
}
