// Histórico do diário e contas do painel. Guarda no navegador, porque o app não
// tem banco: db/schema.ts está vazio e o hosting.json não tem D1 ligado.
//
// Nada aqui calcula dose. O cálculo continua inteiro em app/page.tsx, em
// lib/insulin-calculator.ts, e este módulo só registra o que já foi calculado.

export type TipoRefeicao = "cafe" | "almoco" | "lanche" | "jantar" | "ceia";

export const TIPOS_REFEICAO: TipoRefeicao[] = [
  "cafe",
  "almoco",
  "lanche",
  "jantar",
  "ceia",
];

export type Registro = {
  id: string;
  quando: string; // ISO
  tipoRefeicao: TipoRefeicao;
  glicemia: number;
  carboidratos: number;
  insulinaAtiva: number;
  dose: number;
  descricao: string;
};

export type Padrao = {
  id: string;
  nome: string;
  tipoRefeicao: TipoRefeicao;
  descricao: string;
  porcao: string;
  carboidratos: number;
  usos: number;
  criadoEm: string;
  ultimoUso: string;
};

export type Diario = {
  registros: Registro[];
  padroes: Padrao[];
};

export type Periodo = {
  dias: number; // 0 = tudo
  de: string; // "AAAA-MM-DD"
  ate: string;
};

export const CHAVE_DIARIO = "diario-aloncinho-next-v1";
export const CHAVE_PERIODO = "diario-aloncinho-next-periodo";

const DIA = 86400000;
const MAX_REGISTROS = 20000;
const MAX_PADROES = 24;

export function diarioVazio(): Diario {
  return { registros: [], padroes: [] };
}

export function novoId(prefixo: string) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefixo}-${crypto.randomUUID()}`;
  }
  return `${prefixo}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function texto(valor: unknown, limite: number) {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

function numero(valor: unknown) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : null;
}

function tipoValido(valor: unknown): TipoRefeicao {
  return TIPOS_REFEICAO.includes(valor as TipoRefeicao)
    ? (valor as TipoRefeicao)
    : "almoco";
}

function isoOuVazio(valor: unknown) {
  if (typeof valor !== "string" || !valor) return "";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString();
}

// Armazenamento é fronteira de confiança: o que volta do navegador pode ter sido
// editado à mão ou vir de uma versão antiga.
export function normalizarRegistros(valor: unknown): Registro[] {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((item): Registro | null => {
      if (!item || typeof item !== "object") return null;
      const bruto = item as Record<string, unknown>;
      const quando = isoOuVazio(bruto.quando);
      const glicemia = numero(bruto.glicemia);
      const carboidratos = numero(bruto.carboidratos);

      if (!quando || glicemia === null || glicemia <= 0 || glicemia > 999) return null;
      if (carboidratos === null || carboidratos < 0 || carboidratos > 999) return null;

      const dose = numero(bruto.dose);
      const ativa = numero(bruto.insulinaAtiva);

      return {
        id: texto(bruto.id, 80) || novoId("registro"),
        quando,
        tipoRefeicao: tipoValido(bruto.tipoRefeicao),
        glicemia,
        carboidratos,
        insulinaAtiva: ativa !== null && ativa >= 0 ? ativa : 0,
        dose: dose !== null && dose >= 0 ? dose : 0,
        descricao: texto(bruto.descricao, 200),
      };
    })
    .filter((item): item is Registro => item !== null)
    .slice(0, MAX_REGISTROS);
}

export function normalizarPadroes(valor: unknown): Padrao[] {
  if (!Array.isArray(valor)) return [];

  return valor
    .map((item): Padrao | null => {
      if (!item || typeof item !== "object") return null;
      const bruto = item as Record<string, unknown>;
      const nome = texto(bruto.nome, 80);
      const carboidratos = numero(bruto.carboidratos);

      if (!nome || carboidratos === null || carboidratos < 0 || carboidratos > 999) return null;

      const usos = numero(bruto.usos);

      return {
        id: texto(bruto.id, 80) || novoId("padrao"),
        nome,
        tipoRefeicao: tipoValido(bruto.tipoRefeicao),
        descricao: texto(bruto.descricao, 200),
        porcao: texto(bruto.porcao, 200),
        carboidratos,
        usos: usos !== null && usos > 0 ? Math.floor(usos) : 0,
        criadoEm: isoOuVazio(bruto.criadoEm),
        ultimoUso: isoOuVazio(bruto.ultimoUso),
      };
    })
    .filter((item): item is Padrao => item !== null)
    .slice(0, MAX_PADROES);
}

export function normalizarDiario(valor: unknown): Diario {
  if (!valor || typeof valor !== "object") return diarioVazio();
  const bruto = valor as Record<string, unknown>;
  return {
    registros: normalizarRegistros(bruto.registros),
    padroes: normalizarPadroes(bruto.padroes),
  };
}

export function lerDiario(): Diario {
  if (typeof localStorage === "undefined") return diarioVazio();
  try {
    return normalizarDiario(JSON.parse(localStorage.getItem(CHAVE_DIARIO) || "null"));
  } catch {
    return diarioVazio();
  }
}

export function gravarDiario(diario: Diario) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CHAVE_DIARIO, JSON.stringify(diario));
}

// ---------- recorte por período ----------

export function inicioDoDia(dataIso: string): number | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataIso || ""));
  if (!partes) return null;
  const data = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  return Number.isNaN(data.getTime()) ? null : data.getTime();
}

export function diaLocal(valor: string | number | Date) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return new Date(data.getTime() - data.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export type Recorte = { inicio: number; fim: number };

// As datas escolhidas mandam. Sem elas vale a janela móvel, onde dias === 0 é
// "tudo".
export function recorteDe(periodo: Periodo, agora = Date.now()): Recorte {
  const de = inicioDoDia(periodo.de);
  const ate = inicioDoDia(periodo.ate);

  if (de !== null || ate !== null) {
    return {
      inicio: de === null ? -Infinity : de,
      fim: ate === null ? Infinity : ate + DIA - 1,
    };
  }

  if (!Number.isFinite(periodo.dias) || periodo.dias <= 0) {
    return { inicio: -Infinity, fim: Infinity };
  }
  return { inicio: agora - periodo.dias * DIA, fim: Infinity };
}

// Só existe período anterior quando o recorte tem começo e fim conhecidos.
export function recorteAnterior(recorte: Recorte, agora = Date.now()): Recorte | null {
  if (!Number.isFinite(recorte.inicio)) return null;
  const fim = Number.isFinite(recorte.fim) ? Math.min(recorte.fim, agora) : agora;
  const duracao = fim - recorte.inicio;
  if (duracao <= 0) return null;
  return { inicio: recorte.inicio - duracao, fim: recorte.inicio - 1 };
}

export function dentroDoRecorte(registros: Registro[], recorte: Recorte) {
  return registros.filter((registro) => {
    const instante = new Date(registro.quando).getTime();
    return !Number.isNaN(instante) && instante >= recorte.inicio && instante <= recorte.fim;
  });
}

export function media(valores: number[]) {
  if (!valores.length) return null;
  return valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
}

export type Resumo = {
  quantidade: number;
  glicemiaMedia: number | null;
  glicemiaMinima: number | null;
  glicemiaMaxima: number | null;
  carboidratosMedios: number | null;
  registrosPorDia: number | null;
};

// Quantos dias o recorte cobre. Recorte aberto usa o intervalo entre o primeiro
// e o último registro que existe nele.
export function diasCobertos(
  recorte: Recorte,
  registros: Registro[],
  agora = Date.now(),
) {
  let inicio = Number.isFinite(recorte.inicio) ? recorte.inicio : null;
  let fim = Number.isFinite(recorte.fim) ? Math.min(recorte.fim, agora) : agora;

  if (inicio === null) {
    const instantes = registros
      .map((registro) => new Date(registro.quando).getTime())
      .filter((instante) => !Number.isNaN(instante));
    if (!instantes.length) return 0;
    inicio = Math.min(...instantes);
    fim = Math.max(...instantes);
  }

  return Math.max(1, Math.round((fim - inicio) / DIA) || 1);
}

export function resumir(registros: Registro[], recorte: Recorte, agora = Date.now()): Resumo {
  const glicemias = registros.map((registro) => registro.glicemia);
  const carboidratos = registros.map((registro) => registro.carboidratos);
  const dias = diasCobertos(recorte, registros, agora);

  return {
    quantidade: registros.length,
    glicemiaMedia: glicemias.length ? Math.round(media(glicemias)!) : null,
    glicemiaMinima: glicemias.length ? Math.min(...glicemias) : null,
    glicemiaMaxima: glicemias.length ? Math.max(...glicemias) : null,
    carboidratosMedios: carboidratos.length ? Math.round(media(carboidratos)!) : null,
    registrosPorDia: dias && registros.length ? registros.length / dias : null,
  };
}
