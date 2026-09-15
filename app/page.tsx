"use client";

import { ChangeEvent, useMemo, useState } from "react";
import {
  formatarUnidades,
  obterFaixaBolus,
} from "@/lib/insulin-calculator";

type EstimateItem = {
  name: string;
  portion: string;
  min_g: number;
  max_g: number;
};

type Estimate = {
  items: EstimateItem[];
  total_min_g: number;
  total_max_g: number;
  observation?: string;
};

function horaAtual() {
  const agora = new Date();
  return `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes(),
  ).padStart(2, "0")}`;
}

function paraNumero(valor: string) {
  return Number(valor.replace(",", "."));
}

async function arquivoParaDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [horario, setHorario] = useState(horaAtual);
  const [tipoRefeicao, setTipoRefeicao] = useState("almoco");
  const [glicemiaAtual, setGlicemiaAtual] = useState("");
  const [descricao, setDescricao] = useState("");
  const [porcao, setPorcao] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [carboidratos, setCarboidratos] = useState("");
  const [insulinaAtiva, setInsulinaAtiva] = useState("0");
  const [relacaoManual, setRelacaoManual] = useState("");
  const [sensibilidadeManual, setSensibilidadeManual] = useState("");
  const [alvoManual, setAlvoManual] = useState("100");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const faixaAtual = useMemo(() => {
    try {
      return obterFaixaBolus(horario);
    } catch {
      return null;
    }
  }, [horario]);

  const relacaoEfetiva = useMemo(() => {
    if (relacaoManual.trim()) return paraNumero(relacaoManual);
    return faixaAtual?.carboPorUnidade ?? NaN;
  }, [relacaoManual, faixaAtual]);

  const sensibilidadeEfetiva = useMemo(() => {
    if (sensibilidadeManual.trim()) return paraNumero(sensibilidadeManual);
    return faixaAtual?.sensibilidade ?? NaN;
  }, [sensibilidadeManual, faixaAtual]);

  const alvoEfetivo = useMemo(() => {
    return paraNumero(alvoManual || "100");
  }, [alvoManual]);

  const resultado = useMemo(() => {
    if (!glicemiaAtual || !carboidratos) return null;

    const carb = paraNumero(carboidratos);
    const glicemia = paraNumero(glicemiaAtual);
    const ativa = paraNumero(insulinaAtiva || "0");

    if (
      !Number.isFinite(carb) ||
      !Number.isFinite(glicemia) ||
      !Number.isFinite(relacaoEfetiva) ||
      !Number.isFinite(sensibilidadeEfetiva) ||
      !Number.isFinite(alvoEfetivo) ||
      relacaoEfetiva <= 0 ||
      sensibilidadeEfetiva <= 0 ||
      alvoEfetivo <= 0
    ) {
      return null;
    }

    const doseAlimentar = carb / relacaoEfetiva;
    const doseCorrecao =
      glicemia > alvoEfetivo
        ? (glicemia - alvoEfetivo) / sensibilidadeEfetiva
        : 0;

    const doseMatematica = Math.max(
      0,
      doseAlimentar + doseCorrecao - ativa,
    );

    return {
      doseAlimentar,
      doseCorrecao,
      doseMatematica,
      insulinaAtiva: ativa,
    };
  }, [
    glicemiaAtual,
    carboidratos,
    insulinaAtiva,
    relacaoEfetiva,
    sensibilidadeEfetiva,
    alvoEfetivo,
  ]);

  async function analisarRefeicao() {
    setErro("");
    setEstimate(null);

    if (!glicemiaAtual) {
      setErro("Informe a glicemia atual.");
      return;
    }

    if (!descricao.trim() && !foto) {
      setErro("Descreva a refeição ou envie uma foto.");
      return;
    }

    setCarregando(true);

    try {
      const imageDataUrl = foto ? await arquivoParaDataUrl(foto) : null;

      const response = await fetch("/api/estimate-carbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mealType: tipoRefeicao,
          description: descricao,
          portion: porcao,
          imageDataUrl,
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const texto = await response.text();

        throw new Error(
          `A API de carboidratos não respondeu em JSON. HTTP ${response.status}. ` +
            `Resposta recebida: ${texto.slice(0, 120)}`
        );
      }

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error || `Não foi possível analisar a refeição. HTTP ${response.status}.`
        );
      }

      if (!body?.estimate) {
        throw new Error("A API respondeu, mas não retornou uma estimativa de carboidratos.");
      }

      const estimativa = body.estimate as Estimate;
      setEstimate(estimativa);

      const medio =
        (Number(estimativa.total_min_g) + Number(estimativa.total_max_g)) / 2;

      setCarboidratos(medio.toFixed(1).replace(".", ","));
    } catch (error) {
      setErro(
        error instanceof Error ? error.message : "Falha ao analisar a refeição.",
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-400">
            Diabetes do Aloncinho
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Glicemia + refeição + IA
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            A IA estima os carboidratos da refeição. O horário sugere parâmetros,
            mas você pode ajustar os valores antes do cálculo.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">1. Glicemia e horário</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Tipo de refeição
              </label>
              <select
                value={tipoRefeicao}
                onChange={(e) => setTipoRefeicao(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              >
                <option value="cafe">Café da manhã</option>
                <option value="almoco">Almoço</option>
                <option value="lanche">Lanche</option>
                <option value="jantar">Jantar</option>
                <option value="ceia">Ceia</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Horário</label>
              <input
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Glicemia atual (mg/dL)
              </label>
              <input
                inputMode="decimal"
                value={glicemiaAtual}
                onChange={(e) => setGlicemiaAtual(e.target.value)}
                placeholder="Ex.: 145"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>
          </div>

          {faixaAtual && (
            <div className="mt-4 rounded-xl bg-slate-800 p-4">
              <div className="text-sm text-slate-300">
                <strong>Sugestão automática pelo horário:</strong>{" "}
                {faixaAtual.inicio}–{faixaAtual.fim} ·{" "}
                {faixaAtual.carboPorUnidade} g/U · sensibilidade{" "}
                {faixaAtual.sensibilidade} mg/dL/U
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Relação carbo/insulina (g/U)
                  </label>
                  <input
                    inputMode="decimal"
                    value={relacaoManual}
                    onChange={(e) => setRelacaoManual(e.target.value)}
                    placeholder={String(faixaAtual.carboPorUnidade)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Vazio = usa {faixaAtual.carboPorUnidade} g/U.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Sensibilidade (mg/dL/U)
                  </label>
                  <input
                    inputMode="decimal"
                    value={sensibilidadeManual}
                    onChange={(e) => setSensibilidadeManual(e.target.value)}
                    placeholder={String(faixaAtual.sensibilidade)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Vazio = usa {faixaAtual.sensibilidade} mg/dL/U.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">
                    Glicemia alvo (mg/dL)
                  </label>
                  <input
                    inputMode="decimal"
                    value={alvoManual}
                    onChange={(e) => setAlvoManual(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300">
                <strong>Valores usados no cálculo:</strong>{" "}
                {Number.isFinite(relacaoEfetiva) ? relacaoEfetiva : "-"} g/U ·{" "}
                sensibilidade{" "}
                {Number.isFinite(sensibilidadeEfetiva)
                  ? sensibilidadeEfetiva
                  : "-"}{" "}
                mg/dL/U · alvo{" "}
                {Number.isFinite(alvoEfetivo) ? alvoEfetivo : "-"} mg/dL
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">2. Refeição</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Descrição da refeição
              </label>
              <textarea
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: arroz, feijão, frango e salada"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Porção aproximada
              </label>
              <input
                value={porcao}
                onChange={(e) => setPorcao(e.target.value)}
                placeholder="Ex.: 3 colheres de arroz, 1 concha de feijão"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Foto da refeição
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setFoto(e.target.files?.[0] || null)
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <button
              type="button"
              onClick={analisarRefeicao}
              disabled={carregando}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {carregando ? "Analisando refeição..." : "Analisar refeição com IA"}
            </button>
          </div>

          {erro && (
            <div className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">
              {erro}
            </div>
          )}
        </section>

        {estimate && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">3. Carboidratos estimados</h2>

            <div className="mt-4 space-y-3">
              {estimate.items.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="rounded-xl bg-slate-800 p-4"
                >
                  <div className="font-semibold">{item.name}</div>
                  <div className="mt-1 text-sm text-slate-400">{item.portion}</div>
                  <div className="mt-2 text-sm">
                    {item.min_g}–{item.max_g} g de carboidratos
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4">
              <div className="text-sm text-emerald-300">Total estimado pela IA</div>
              <div className="mt-1 text-2xl font-bold">
                {estimate.total_min_g}–{estimate.total_max_g} g
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium">
                Carboidratos usados no cálculo
              </label>
              <input
                inputMode="decimal"
                value={carboidratos}
                onChange={(e) => setCarboidratos(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium">
                Insulina rápida ainda ativa (U)
              </label>
              <input
                inputMode="decimal"
                value={insulinaAtiva}
                onChange={(e) => setInsulinaAtiva(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>
          </section>
        )}

        {resultado && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">4. Resultado matemático</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-800 p-4">
                <div className="text-xs text-slate-400">Alimentação</div>
                <div className="mt-1 text-xl font-bold">
                  {formatarUnidades(resultado.doseAlimentar)} U
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 p-4">
                <div className="text-xs text-slate-400">Correção</div>
                <div className="mt-1 text-xl font-bold">
                  {formatarUnidades(resultado.doseCorrecao)} U
                </div>
              </div>

              <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4">
                <div className="text-xs text-emerald-300">Total matemático</div>
                <div className="mt-1 text-2xl font-bold">
                  {formatarUnidades(resultado.doseMatematica)} U
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-amber-950/40 p-4 text-sm text-amber-200">
              Este resultado apenas reproduz matematicamente os parâmetros
              cadastrados. Confirme com o plano prescrito antes de qualquer aplicação.
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
