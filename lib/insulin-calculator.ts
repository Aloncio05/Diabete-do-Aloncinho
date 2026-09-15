/**
 * Motor matemático para estimativa de bolus.
 *
 * ATENÇÃO:
 * - Usa apenas parâmetros informados/configurados.
 * - Não substitui prescrição médica.
 * - Basal não entra no cálculo de bolus.
 */

export type FaixaBolus = {
  inicio: string;
  fim: string;
  sensibilidade: number;
  carboPorUnidade: number | null;
};

export const BASAL = [
  { horario: "05:00", unidades: 6 },
  { horario: "20:00", unidades: 14 },
] as const;

export const FAIXAS_BOLUS: FaixaBolus[] = [
  { inicio: "00:00", fim: "03:59", sensibilidade: 70, carboPorUnidade: 15 },
  { inicio: "04:00", fim: "10:59", sensibilidade: 50, carboPorUnidade: 6 },
  { inicio: "11:00", fim: "17:59", sensibilidade: 50, carboPorUnidade: 8 },
  { inicio: "18:00", fim: "20:59", sensibilidade: 60, carboPorUnidade: null },
  { inicio: "21:00", fim: "23:59", sensibilidade: 70, carboPorUnidade: 12 },
];

export type EntradaBolus = {
  carboidratos: number;
  glicemiaAtual: number;
  glicemiaAlvo: number;
  horario: string;
  insulinaAtiva?: number;
};

export type ResultadoBolus = {
  faixa: FaixaBolus;
  doseAlimentar: number;
  doseCorrecao: number;
  insulinaAtiva: number;
  doseMatematica: number;
  avisos: string[];
};

function horarioParaMinutos(horario: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(horario);
  if (!match) throw new Error("Horário inválido. Use HH:MM.");
  return Number(match[1]) * 60 + Number(match[2]);
}

function validarPositivo(nome: string, valor: number, permiteZero = false) {
  if (!Number.isFinite(valor)) throw new Error(`${nome} inválido.`);
  if (permiteZero ? valor < 0 : valor <= 0) {
    throw new Error(`${nome} inválido.`);
  }
}

export function obterFaixaBolus(horario: string): FaixaBolus {
  const atual = horarioParaMinutos(horario);

  const faixa = FAIXAS_BOLUS.find((item) => {
    const inicio = horarioParaMinutos(item.inicio);
    const fim = horarioParaMinutos(item.fim);
    return atual >= inicio && atual <= fim;
  });

  if (!faixa) throw new Error("Faixa horária não encontrada.");
  return faixa;
}

export function calcularBolus({
  carboidratos,
  glicemiaAtual,
  glicemiaAlvo,
  horario,
  insulinaAtiva = 0,
}: EntradaBolus): ResultadoBolus {
  validarPositivo("Carboidratos", carboidratos, true);
  validarPositivo("Glicemia atual", glicemiaAtual);
  validarPositivo("Glicemia alvo", glicemiaAlvo);
  validarPositivo("Insulina ativa", insulinaAtiva, true);

  const faixa = obterFaixaBolus(horario);

  if (faixa.carboPorUnidade == null) {
    throw new Error(
      `A relação carbo/insulina de ${faixa.inicio}–${faixa.fim} ainda não foi configurada.`,
    );
  }

  const doseAlimentar = carboidratos / faixa.carboPorUnidade;

  const doseCorrecao =
    glicemiaAtual > glicemiaAlvo
      ? (glicemiaAtual - glicemiaAlvo) / faixa.sensibilidade
      : 0;

  const doseMatematica = Math.max(
    0,
    doseAlimentar + doseCorrecao - insulinaAtiva,
  );

  const avisos: string[] = [];

  if (glicemiaAtual < 70) {
    avisos.push(
      "Glicemia abaixo de 70 mg/dL: não use este resultado como orientação de dose. Siga seu plano de hipoglicemia.",
    );
  } else if (glicemiaAtual < glicemiaAlvo) {
    avisos.push(
      "Glicemia abaixo da meta: a correção foi zerada automaticamente.",
    );
  }

  if (glicemiaAtual >= 250) {
    avisos.push(
      "Glicemia elevada: considere seu plano médico para hiperglicemia/cetonas antes de usar qualquer estimativa.",
    );
  }

  if (insulinaAtiva > 0) {
    avisos.push("A insulina ativa informada foi descontada do cálculo.");
  }

  return {
    faixa,
    doseAlimentar,
    doseCorrecao,
    insulinaAtiva,
    doseMatematica,
    avisos,
  };
}

export function formatarUnidades(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}
