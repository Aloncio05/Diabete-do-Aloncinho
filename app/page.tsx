"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  BASAL,
  calcularBolus,
  formatarUnidades,
  obterFaixaBolus,
  type ResultadoBolus,
} from "@/lib/insulin-calculator";

function horaAtual() {
  const agora = new Date();
  return `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes(),
  ).padStart(2, "0")}`;
}

export default function Home() {
  const [horario, setHorario] = useState(horaAtual);
  const [carboidratos, setCarboidratos] = useState("");
  const [glicemiaAtual, setGlicemiaAtual] = useState("");
  const [glicemiaAlvo, setGlicemiaAlvo] = useState("");
  const [insulinaAtiva, setInsulinaAtiva] = useState("0");
  const [resultado, setResultado] = useState<ResultadoBolus | null>(null);
  const [erro, setErro] = useState("");

  const faixaAtual = useMemo(() => {
    try {
      return obterFaixaBolus(horario);
    } catch {
      return null;
    }
  }, [horario]);

  function calcular(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setResultado(null);

    try {
      const resultadoCalculado = calcularBolus({
        carboidratos: Number(carboidratos.replace(",", ".")),
        glicemiaAtual: Number(glicemiaAtual.replace(",", ".")),
        glicemiaAlvo: Number(glicemiaAlvo.replace(",", ".")),
        horario,
        insulinaAtiva: Number(insulinaAtiva.replace(",", ".")),
      });

      setResultado(resultadoCalculado);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Erro ao calcular.");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
            Diabetes do Aloncinho
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Calculadora de carboidratos e bolus
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Calcula uma estimativa matemática usando os parâmetros cadastrados.
            Não altera sua prescrição e não substitui orientação médica.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <form onSubmit={calcular} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium" htmlFor="horario">
                  Horário
                </label>
                <input
                  id="horario"
                  type="time"
                  value={horario}
                  onChange={(e) => setHorario(e.target.value)}
                  required
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {faixaAtual && (
                <div className="rounded-xl bg-zinc-100 p-4 text-sm">
                  <p className="font-semibold">Parâmetros deste horário</p>
                  <div className="mt-2 grid gap-1 text-zinc-700">
                    <span>
                      Faixa: {faixaAtual.inicio}–{faixaAtual.fim}
                    </span>
                    <span>
                      Relação carbo/insulina:{" "}
                      {faixaAtual.carboPorUnidade == null
                        ? "pendente"
                        : `${faixaAtual.carboPorUnidade} g/U`}
                    </span>
                    <span>
                      Sensibilidade: {faixaAtual.sensibilidade} mg/dL por U
                    </span>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="carboidratos"
                  >
                    Carboidratos (g)
                  </label>
                  <input
                    id="carboidratos"
                    inputMode="decimal"
                    value={carboidratos}
                    onChange={(e) => setCarboidratos(e.target.value)}
                    placeholder="Ex.: 60"
                    required
                    className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="glicemia"
                  >
                    Glicemia atual (mg/dL)
                  </label>
                  <input
                    id="glicemia"
                    inputMode="decimal"
                    value={glicemiaAtual}
                    onChange={(e) => setGlicemiaAtual(e.target.value)}
                    placeholder="Ex.: 180"
                    required
                    className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="alvo"
                  >
                    Glicemia alvo (mg/dL)
                  </label>
                  <input
                    id="alvo"
                    inputMode="decimal"
                    value={glicemiaAlvo}
                    onChange={(e) => setGlicemiaAlvo(e.target.value)}
                    placeholder="Informe sua meta prescrita"
                    required
                    className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    htmlFor="ativa"
                  >
                    Insulina ativa (U)
                  </label>
                  <input
                    id="ativa"
                    inputMode="decimal"
                    value={insulinaAtiva}
                    onChange={(e) => setInsulinaAtiva(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full rounded-xl border border-zinc-300 px-3 py-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              {erro && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                >
                  {erro}
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
              >
                Calcular estimativa
              </button>
            </form>

            {resultado && (
              <div className="mt-6 border-t border-zinc-200 pt-6">
                <h2 className="text-lg font-semibold">Resultado matemático</h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-zinc-100 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Alimentação
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      {formatarUnidades(resultado.doseAlimentar)} U
                    </p>
                  </div>

                  <div className="rounded-xl bg-zinc-100 p-4">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      Correção
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      {formatarUnidades(resultado.doseCorrecao)} U
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-emerald-700">
                      Total calculado
                    </p>
                    <p className="mt-1 text-2xl font-bold text-emerald-900">
                      {formatarUnidades(resultado.doseMatematica)} U
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Este valor é uma estimativa matemática, não uma ordem para
                  aplicação. Confirme com seu plano prescrito antes de usar.
                </div>

                {resultado.avisos.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {resultado.avisos.map((aviso) => (
                      <p
                        key={aviso}
                        className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                      >
                        {aviso}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Basal atual</h2>
              <div className="mt-3 space-y-2 text-sm">
                {BASAL.map((item) => (
                  <div
                    key={item.horario}
                    className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2"
                  >
                    <span>{item.horario}</span>
                    <strong>{item.unidades} U Basaglar</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Fórmula</h2>
              <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-700">
                <p>Alimentação = carboidratos ÷ relação</p>
                <p>Correção = (glicemia − alvo) ÷ sensibilidade</p>
                <p>Total = alimentação + correção − insulina ativa</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
