export type FaixaBolus = {
  inicio: string;
  fim: string;
  sensibilidade: number;
  carboPorUnidade: number;
};

export const FAIXAS_BOLUS: FaixaBolus[] = [
  { inicio: "00:00", fim: "03:59", sensibilidade: 70, carboPorUnidade: 15 },
  { inicio: "04:00", fim: "10:59", sensibilidade: 50, carboPorUnidade: 6 },
  { inicio: "11:00", fim: "17:59", sensibilidade: 50, carboPorUnidade: 8 },
  { inicio: "18:00", fim: "20:59", sensibilidade: 60, carboPorUnidade: 12 },
  { inicio: "21:00", fim: "23:59", sensibilidade: 70, carboPorUnidade: 12 },
];

function minutos(horario: string) {
  const [h, m] = horario.split(":").map(Number);
  return h * 60 + m;
}

export function obterFaixaBolus(horario: string) {
  const atual = minutos(horario);

  const faixa = FAIXAS_BOLUS.find(
    (item) => atual >= minutos(item.inicio) && atual <= minutos(item.fim),
  );

  if (!faixa) throw new Error("Horário inválido.");
  return faixa;
}

export function calcularBolus({
  carboidratos,
  glicemiaAtual,
  glicemiaAlvo,
  horario,
  insulinaAtiva = 0,
}: {
  carboidratos: number;
  glicemiaAtual: number;
  glicemiaAlvo: number;
  horario: string;
  insulinaAtiva?: number;
}) {
  const faixa = obterFaixaBolus(horario);

  const doseAlimentar = carboidratos / faixa.carboPorUnidade;
  const doseCorrecao =
    glicemiaAtual > glicemiaAlvo
      ? (glicemiaAtual - glicemiaAlvo) / faixa.sensibilidade
      : 0;

  const doseMatematica = Math.max(
    0,
    doseAlimentar + doseCorrecao - insulinaAtiva,
  );

  return {
    faixa,
    doseAlimentar,
    doseCorrecao,
    insulinaAtiva,
    doseMatematica,
  };
}

export function formatarUnidades(valor: number) {
  return valor.toFixed(2).replace(".", ",");
}
