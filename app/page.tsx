"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatarUnidades } from "@/lib/insulin-calculator";
import {
  CHAVE_PERIODO,
  Diario,
  Padrao,
  Periodo,
  Registro,
  TipoRefeicao,
  dentroDoRecorte,
  diaLocal,
  diarioVazio,
  gravarDiario,
  lerBackup,
  lerDiario,
  media,
  mesclarDiarios,
  montarBackup,
  normalizarDiario,
  novoId,
  recorteAnterior,
  recorteDe,
  resumir,
} from "@/lib/diario";

type EstimateItem = {
  name: string;
  portion: string;
  min_g: number;
  max_g: number;
  kcal?: number;
};

type Estimate = {
  items: EstimateItem[];
  total_min_g: number;
  total_max_g: number;
  // Opcional de propósito: se a IA não trouxer as calorias, a estimativa de
  // carboidratos continua valendo em vez de falhar inteira.
  total_kcal?: number;
  observation?: string;
};

type ParametrosRefeicao = {
  nome: string;
  carboPorUnidade: number;
  sensibilidade: number;
  glicemiaAlvo: number;
};

const PARAMETROS_REFEICAO: Record<TipoRefeicao, ParametrosRefeicao> = {
  cafe: {
    nome: "Café da manhã",
    carboPorUnidade: 6,
    sensibilidade: 50,
    glicemiaAlvo: 100,
  },
  almoco: {
    nome: "Almoço",
    carboPorUnidade: 8,
    sensibilidade: 50,
    glicemiaAlvo: 100,
  },
  lanche: {
    nome: "Lanche",
    carboPorUnidade: 8,
    sensibilidade: 50,
    glicemiaAlvo: 100,
  },
  jantar: {
    nome: "Jantar",
    carboPorUnidade: 8,
    sensibilidade: 60,
    glicemiaAlvo: 100,
  },
  ceia: {
    nome: "Ceia",
    carboPorUnidade: 12,
    sensibilidade: 70,
    glicemiaAlvo: 120,
  },
};

// Faixa pessoal já documentada pelo painel. Ela existe apenas para resumir as
// medições visualmente e não depende do alvo usado no formulário de refeição.
const LIMITE_INFERIOR_FAIXA_PESSOAL = 80;
const LIMITE_SUPERIOR_FAIXA_PESSOAL = 190;
const TIPOS_DE_IMAGEM_ACEITOS =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/avif";
const TIPOS_DE_IMAGEM_ENVIAVEIS_DIRETAMENTE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/avif",
]);
const TAMANHO_MAXIMO_ARQUIVO_ORIGINAL = 15 * 1024 * 1024;
const TAMANHO_MAXIMO_IMAGEM_PREPARADA = 1_500_000;
const TAMANHO_MAXIMO_IMAGEM_DIRETA = 1_700_000;
const LADOS_MAXIMOS_IMAGEM = [1600, 1280, 1024];
const QUALIDADES_JPEG = [0.84, 0.72, 0.6];

type CategoriaDaFaixaPessoal = "abaixo" | "na-faixa" | "acima";

function horaAtual() {
  const agora = new Date();

  return `${String(agora.getHours()).padStart(2, "0")}:${String(
    agora.getMinutes(),
  ).padStart(2, "0")}`;
}

function paraNumero(valor: string) {
  return Number(valor.replace(",", "."));
}

function formatarData(valor: string) {
  const data = new Date(valor);

  if (Number.isNaN(data.getTime())) return "sem data";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}

function formatarDia(valor: string) {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(`${valor}T12:00`)
    : new Date(valor);

  if (Number.isNaN(data.getTime())) return "sem data";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(data);
}

function categoriaDaFaixaPessoal(glicemia: number): CategoriaDaFaixaPessoal {
  if (glicemia < LIMITE_INFERIOR_FAIXA_PESSOAL) return "abaixo";
  if (glicemia > LIMITE_SUPERIOR_FAIXA_PESSOAL) return "acima";
  return "na-faixa";
}

function percentual(valor: number, total: number) {
  return total ? Math.round((valor / total) * 100) : 0;
}

function lerPeriodo(): Periodo {
  const padrao: Periodo = { dias: 30, de: "", ate: "" };

  if (typeof localStorage === "undefined") return padrao;

  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE_PERIODO) || "null");

    if (!guardado || typeof guardado !== "object") return padrao;

    return {
      dias: Number.isFinite(Number(guardado.dias)) ? Number(guardado.dias) : 30,
      de: typeof guardado.de === "string" ? guardado.de : "",
      ate: typeof guardado.ate === "string" ? guardado.ate : "",
    };
  } catch {
    return padrao;
  }
}

function formatarTamanhoArquivo(tamanho: number) {
  const megabytes = tamanho / 1024 / 1024;

  if (megabytes >= 1) {
    return `${megabytes.toFixed(1).replace(".", ",")} MB`;
  }

  return `${Math.max(1, Math.round(tamanho / 1024))} KB`;
}

async function arquivoParaDataUrl(file: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("Não foi possível ler a imagem selecionada."));

    reader.readAsDataURL(file);
  });
}

async function carregarImagem(file: File) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir a imagem selecionada."));
    };

    image.src = url;
  });
}

async function canvasParaJpeg(canvas: HTMLCanvasElement, quality: number) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Não foi possível otimizar a imagem."));
      },
      "image/jpeg",
      quality,
    );
  });
}

async function prepararImagemParaEnvio(file: File) {
  if (!file.size) {
    throw new Error("A foto escolhida está vazia. Tente outra imagem.");
  }

  if (file.size > TAMANHO_MAXIMO_ARQUIVO_ORIGINAL) {
    throw new Error(
      "A foto é grande demais. Escolha uma imagem de até 15 MB ou aproxime a câmera da refeição.",
    );
  }

  try {
    const image = await carregarImagem(file);
    const larguraOriginal = image.naturalWidth;
    const alturaOriginal = image.naturalHeight;

    if (!larguraOriginal || !alturaOriginal) {
      throw new Error("A imagem não tem dimensões válidas.");
    }

    for (const ladoMaximo of LADOS_MAXIMOS_IMAGEM) {
      const escala = Math.min(
        1,
        ladoMaximo / Math.max(larguraOriginal, alturaOriginal),
      );
      const largura = Math.max(1, Math.round(larguraOriginal * escala));
      const altura = Math.max(1, Math.round(alturaOriginal * escala));
      const canvas = document.createElement("canvas");
      const contexto = canvas.getContext("2d");

      if (!contexto) {
        throw new Error("Não foi possível preparar a imagem neste navegador.");
      }

      canvas.width = largura;
      canvas.height = altura;
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, largura, altura);
      contexto.drawImage(image, 0, 0, largura, altura);

      for (const quality of QUALIDADES_JPEG) {
        const jpeg = await canvasParaJpeg(canvas, quality);

        if (jpeg.size <= TAMANHO_MAXIMO_IMAGEM_PREPARADA) {
          return arquivoParaDataUrl(jpeg);
        }
      }
    }
  } catch {
    // A tentativa direta abaixo cobre navegadores que não decodificam
    // HEIC/HEIF no canvas, desde que a foto já caiba no limite seguro.
  }

  if (
    TIPOS_DE_IMAGEM_ENVIAVEIS_DIRETAMENTE.has(file.type) &&
    file.size <= TAMANHO_MAXIMO_IMAGEM_DIRETA
  ) {
    return arquivoParaDataUrl(file);
  }

  throw new Error(
    "Não foi possível preparar essa foto. Tente uma imagem JPEG, PNG ou WebP menor e bem iluminada.",
  );
}

export default function Home() {
  const [tipoRefeicao, setTipoRefeicao] =
    useState<TipoRefeicao>("almoco");

  const [horario, setHorario] = useState(horaAtual);
  const [glicemiaAtual, setGlicemiaAtual] = useState("");
  const [descricao, setDescricao] = useState("");
  const [porcao, setPorcao] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [consentimentoIa, setConsentimentoIa] = useState(false);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [carboidratos, setCarboidratos] = useState("");
  const [calorias, setCalorias] = useState("");
  const [insulinaAtiva, setInsulinaAtiva] = useState("0");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  // Histórico e painel. O localStorage só é lido depois da montagem, senão o
  // HTML do servidor e o do navegador saem diferentes na hidratação.
  const [diario, setDiario] = useState<Diario>(diarioVazio);
  const [periodo, setPeriodo] = useState<Periodo>({ dias: 30, de: "", ate: "" });
  const [salvo, setSalvo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  function selecionarFoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    // Permite escolher o mesmo arquivo novamente depois de removê-lo ou de uma
    // tentativa que falhou.
    event.currentTarget.value = "";

    if (!file) return;

    if (file.type && !file.type.startsWith("image/")) {
      setErro("Escolha uma imagem em vez de outro tipo de arquivo.");
      return;
    }

    if (file.size > TAMANHO_MAXIMO_ARQUIVO_ORIGINAL) {
      setErro(
        "A foto é grande demais. Escolha uma imagem de até 15 MB ou aproxime a câmera da refeição.",
      );
      return;
    }

    setErro("");
    setFoto(file);
  }

  useEffect(() => {
    const local = lerDiario();

    setDiario(local);
    setPeriodo(lerPeriodo());

    // Se houver conta e banco, junta o deste aparelho com o da conta e devolve
    // o resultado. 401 (sem login) ou 503 (sem banco) não são erro: o app
    // simplesmente segue guardando só aqui.
    (async () => {
      try {
        const resposta = await fetch("/api/diario");

        if (!resposta.ok) return;

        const { diario: doServidor } = await resposta.json();
        const juntos = mesclarDiarios(local, normalizarDiario(doServidor));

        setDiario(juntos);
        gravarDiario(juntos);
        setSincronizando(true);

        await fetch("/api/diario", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diario: juntos }),
        });
      } catch {
        // Sem rede: o diário local continua valendo.
      }
    })();
  }, []);

  // Mudou algo que entra no cálculo: o registro salvo não vale mais para o que
  // está na tela, então o botão volta a ficar disponível.
  useEffect(() => {
    setSalvo(false);
  }, [glicemiaAtual, carboidratos, calorias, insulinaAtiva, tipoRefeicao]);

  const parametros = useMemo(
    () => PARAMETROS_REFEICAO[tipoRefeicao],
    [tipoRefeicao],
  );

  const resultado = useMemo(() => {
    if (!glicemiaAtual || !carboidratos) {
      return null;
    }

    const carb = paraNumero(carboidratos);
    const glicemia = paraNumero(glicemiaAtual);
    const ativa = paraNumero(insulinaAtiva || "0");

    if (
      !Number.isFinite(carb) ||
      !Number.isFinite(glicemia) ||
      !Number.isFinite(ativa) ||
      carb < 0 ||
      glicemia <= 0 ||
      ativa < 0
    ) {
      return null;
    }

    const doseAlimentar = carb / parametros.carboPorUnidade;

    const doseCorrecao =
      glicemia > parametros.glicemiaAlvo
        ? (glicemia - parametros.glicemiaAlvo) /
          parametros.sensibilidade
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
  }, [glicemiaAtual, carboidratos, insulinaAtiva, parametros]);

  const painel = useMemo(() => {
    const agora = Date.now();
    const recorte = recorteDe(periodo, agora);
    const ordenados = [...diario.registros].sort(
      (a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime(),
    );
    const noPeriodo = dentroDoRecorte(ordenados, recorte);
    const anterior = recorteAnterior(recorte, agora);
    const mediaAnterior = anterior
      ? media(dentroDoRecorte(ordenados, anterior).map((r) => r.glicemia))
      : null;
    const resumo = resumir(noPeriodo, recorte, agora);

    return {
      recorte,
      todos: ordenados,
      registros: noPeriodo,
      resumo,
      variacao:
        resumo.glicemiaMedia !== null && mediaAnterior !== null
          ? resumo.glicemiaMedia - Math.round(mediaAnterior)
          : null,
      // Do mais antigo para o mais novo, que é como o gráfico lê.
      serie: [...noPeriodo].reverse(),
    };
  }, [diario.registros, periodo]);

  const rotuloDoPeriodo = useMemo(() => {
    if (periodo.de && periodo.ate) {
      return `De ${formatarDia(periodo.de)} a ${formatarDia(periodo.ate)}`;
    }
    if (periodo.de) return `A partir de ${formatarDia(periodo.de)}`;
    if (periodo.ate) return `Até ${formatarDia(periodo.ate)}`;
    if (!periodo.dias) return "Todo o histórico";
    return `Últimos ${periodo.dias} dias`;
  }, [periodo]);

  async function analisarRefeicao() {
    setErro("");
    setEstimate(null);

    if (!glicemiaAtual.trim()) {
      setErro("Informe a glicemia atual.");
      return;
    }

    if (!descricao.trim() && !foto) {
      setErro("Descreva a refeição ou envie uma foto.");
      return;
    }

    if (!consentimentoIa) {
      setErro(
        "Confirme a autorização para enviar os dados da refeição à análise por IA.",
      );
      return;
    }

    setCarregando(true);

    try {
      const imageDataUrl = foto
        ? await prepararImagemParaEnvio(foto)
        : null;

      const response = await fetch("/api/estimate-carbs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mealType: parametros.nome,
          description: descricao,
          portion: porcao,
          imageDataUrl,
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          "A análise por IA não está disponível no momento. Tente novamente em alguns instantes.",
        );
      }

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body?.error ||
            `Não foi possível analisar a refeição. HTTP ${response.status}.`,
        );
      }

      if (
        !body?.estimate ||
        !Array.isArray(body.estimate.items) ||
        !Number.isFinite(Number(body.estimate.total_min_g)) ||
        !Number.isFinite(Number(body.estimate.total_max_g))
      ) {
        throw new Error(
          "A API respondeu, mas não retornou uma estimativa válida.",
        );
      }

      const estimativa = body.estimate as Estimate;

      setEstimate(estimativa);

      const medio =
        (Number(estimativa.total_min_g) +
          Number(estimativa.total_max_g)) /
        2;

      setCarboidratos(medio.toFixed(1).replace(".", ","));

      const kcal = Number(estimativa.total_kcal);

      setCalorias(Number.isFinite(kcal) && kcal >= 0 ? String(Math.round(kcal)) : "");
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Falha ao analisar a refeição.",
      );
    } finally {
      setCarregando(false);
    }
  }

  function trocarTipoRefeicao(valor: string) {
    setTipoRefeicao(valor as TipoRefeicao);
    setEstimate(null);
    setCarboidratos("");
    setCalorias("");
    setErro("");
  }

  // "" significa que não há caloria para este registro, e não zero.
  function caloriasInformadas() {
    if (!calorias.trim()) return null;
    const valor = paraNumero(calorias);
    return Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : null;
  }

  // Grava sempre no aparelho primeiro: se a rede falhar, nada se perde. O envio
  // para a conta é o extra, e uma falha nele não desfaz o que já foi salvo aqui.
  function atualizarDiario(proximo: Diario) {
    setDiario(proximo);
    gravarDiario(proximo);

    if (!sincronizando) return;

    fetch("/api/diario", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diario: proximo }),
    }).catch(() => {
      // Sem rede agora: o próximo salvamento, ou a próxima abertura, reenvia.
    });
  }

  function atualizarPeriodo(proximo: Periodo) {
    setPeriodo(proximo);
    localStorage.setItem(CHAVE_PERIODO, JSON.stringify(proximo));
  }

  // O registro guarda o que já foi calculado na tela. Nada é recalculado aqui.
  function salvarNoHistorico() {
    if (!resultado) return;

    const registro: Registro = {
      id: novoId("registro"),
      quando: new Date().toISOString(),
      tipoRefeicao,
      glicemia: paraNumero(glicemiaAtual),
      carboidratos: paraNumero(carboidratos),
      calorias: caloriasInformadas(),
      insulinaAtiva: resultado.insulinaAtiva,
      dose: resultado.doseMatematica,
      descricao: descricao.trim().slice(0, 200),
    };

    atualizarDiario({ ...diario, registros: [...diario.registros, registro] });
    setSalvo(true);
  }

  function salvarPadrao() {
    const carbo = paraNumero(carboidratos);

    if (!Number.isFinite(carbo) || carbo < 0) {
      setErro("Informe os carboidratos antes de salvar uma refeição padrão.");
      return;
    }

    const sugestao = descricao.trim() || `${parametros.nome} de sempre`;
    const nome = window.prompt("Nome da refeição padrão", sugestao);

    if (nome === null) return;

    if (!nome.trim()) {
      setErro("Dê um nome para encontrar essa refeição depois.");
      return;
    }

    const padrao: Padrao = {
      id: novoId("padrao"),
      nome: nome.trim().slice(0, 80),
      tipoRefeicao,
      descricao: descricao.trim().slice(0, 200),
      porcao: porcao.trim().slice(0, 200),
      carboidratos: carbo,
      calorias: caloriasInformadas(),
      usos: 0,
      criadoEm: new Date().toISOString(),
      ultimoUso: "",
    };

    setErro("");
    atualizarDiario({ ...diario, padroes: [...diario.padroes, padrao] });
  }

  // Usar a padrão só preenche os campos. O cálculo continua dependendo da
  // glicemia que você digitar.
  function usarPadrao(padrao: Padrao) {
    setTipoRefeicao(padrao.tipoRefeicao);
    setDescricao(padrao.descricao);
    setPorcao(padrao.porcao);
    setCarboidratos(String(padrao.carboidratos).replace(".", ","));
    setCalorias(padrao.calorias === null ? "" : String(padrao.calorias));
    setEstimate(null);
    setErro("");
    setSalvo(false);

    atualizarDiario({
      ...diario,
      padroes: diario.padroes.map((item) =>
        item.id === padrao.id
          ? { ...item, usos: item.usos + 1, ultimoUso: new Date().toISOString() }
          : item,
      ),
    });
  }

  function removerPadrao(id: string) {
    if (!window.confirm("Remover esta refeição padrão?")) return;

    atualizarDiario({
      ...diario,
      padroes: diario.padroes.filter((item) => item.id !== id),
    });
  }

  function baixarBackup() {
    const conteudo = JSON.stringify(montarBackup(diario), null, 2);
    const url = URL.createObjectURL(
      new Blob([conteudo], { type: "application/json" }),
    );
    const link = document.createElement("a");

    link.href = url;
    link.download = `backup-diario-${diaLocal(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Restaurar substitui o diário deste aparelho. O aviso diz o que entra e o
  // que sai antes de trocar.
  async function restaurarBackup(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];

    event.target.value = "";

    if (!arquivo) return;

    if (arquivo.size > 20 * 1024 * 1024) {
      setErro("Arquivo muito grande. Envie um backup de até 20 MB.");
      return;
    }

    const leitura = lerBackup(await arquivo.text());

    if (!leitura.ok) {
      setErro(leitura.erro);
      return;
    }

    const descartados = leitura.descartados.registros + leitura.descartados.padroes;
    const confirmado = window.confirm(
      [
        `O arquivo tem ${leitura.contagens.registros} registros e ${leitura.contagens.padroes} refeições padrão.`,
        `Este aparelho tem ${diario.registros.length} registros e ${diario.padroes.length} refeições padrão.`,
        descartados ? `${descartados} itens do arquivo não passaram na conferência e ficam de fora.` : "",
        "",
        "Restaurar substitui o que está neste aparelho. Continuar?",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    if (!confirmado) return;

    setErro("");
    atualizarDiario(leitura.diario);
  }

  function removerRegistro(id: string) {
    if (!window.confirm("Remover este registro do histórico?")) return;

    atualizarDiario({
      ...diario,
      registros: diario.registros.filter((item) => item.id !== id),
    });
  }

  return (
    <main className="min-h-screen px-4 py-6 text-slate-100 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
        <header>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-400">
            Diabetes do Aloncinho
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Glicemia + refeição + IA
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Selecione a refeição. Os parâmetros cadastrados mudam
            automaticamente, e a IA estima os carboidratos.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">
            1. Glicemia e refeição
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="tipo-refeicao"
                className="mb-2 block text-sm font-medium"
              >
                Tipo de refeição
              </label>

              <select
                id="tipo-refeicao"
                value={tipoRefeicao}
                onChange={(e) => trocarTipoRefeicao(e.target.value)}
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
              <label
                htmlFor="horario"
                className="mb-2 block text-sm font-medium"
              >
                Horário
              </label>

              <input
                id="horario"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div>
              <label
                htmlFor="glicemia"
                className="mb-2 block text-sm font-medium"
              >
                Glicemia atual (mg/dL)
              </label>

              <input
                id="glicemia"
                inputMode="decimal"
                value={glicemiaAtual}
                onChange={(e) => setGlicemiaAtual(e.target.value)}
                placeholder="Ex.: 145"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-800 p-4">
            <div className="text-sm text-slate-300">
              <strong>
                Parâmetros automáticos para {parametros.nome}
              </strong>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Relação carbo/insulina
                </div>

                <div className="mt-1 text-xl font-bold">
                  {parametros.carboPorUnidade} g/U
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Sensibilidade
                </div>

                <div className="mt-1 text-xl font-bold">
                  {parametros.sensibilidade} mg/dL/U
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Glicemia alvo
                </div>

                <div className="mt-1 text-xl font-bold">
                  {parametros.glicemiaAlvo} mg/dL
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              O horário é apenas registrado no evento. A seleção da
              refeição define os parâmetros usados no cálculo.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">2. Refeição</h2>

          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="descricao"
                className="mb-2 block text-sm font-medium"
              >
                Descrição da refeição
              </label>

              <textarea
                id="descricao"
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: arroz, feijão, frango e salada"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div>
              <label
                htmlFor="porcao"
                className="mb-2 block text-sm font-medium"
              >
                Porção aproximada
              </label>

              <input
                id="porcao"
                value={porcao}
                onChange={(e) => setPorcao(e.target.value)}
                placeholder="Ex.: 200 g de arroz, 150 g de feijão"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />
            </div>

            <div>
              <label
                htmlFor="foto"
                className="mb-2 block text-sm font-medium"
              >
                Foto da refeição
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="foto"
                  type="file"
                  accept={TIPOS_DE_IMAGEM_ACEITOS}
                  onChange={selecionarFoto}
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                />

                {/* capture abre a câmera direto no celular; no computador o
                    navegador cai no seletor de arquivos sozinho. */}
                <input
                  ref={cameraRef}
                  type="file"
                  accept={TIPOS_DE_IMAGEM_ACEITOS}
                  capture="environment"
                  hidden
                  onChange={selecionarFoto}
                />

                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 font-semibold text-emerald-200 transition hover:bg-emerald-900/50"
                >
                  Tirar foto
                </button>
              </div>

              {foto && (
                <p className="mt-2 text-xs text-slate-400">
                  Foto escolhida: {foto.name} · {formatarTamanhoArquivo(foto.size)}.
                  Ela será reduzida neste aparelho antes do envio.
                </p>
              )}

              <p className="mt-2 text-xs text-slate-500">
                JPG, PNG, WebP, HEIC e HEIF são aceitos. Prefira uma foto de
                cima, bem iluminada, mostrando os alimentos e as porções.
                Para ler rótulos, enquadre a tabela nutricional inteira e a
                porção do produto.
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={consentimentoIa}
                onChange={(e) => setConsentimentoIa(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 accent-emerald-500"
              />
              <span>
                Autorizo o envio dos dados da refeição (descrição, porção e
                foto, se houver) ao Google Gemini para estimar carboidratos.
                Em caso de indisponibilidade, a mesma solicitação pode ser
                reenviada automaticamente até duas vezes.
              </span>
            </label>

            <button
              type="button"
              onClick={analisarRefeicao}
              disabled={carregando}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {carregando
                ? "Analisando refeição..."
                : "Analisar refeição com IA"}
            </button>
          </div>

          {erro && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200"
            >
              {erro}
            </div>
          )}
        </section>

        {estimate && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold">
              3. Carboidratos estimados
            </h2>

            <div className="mt-4 space-y-3">
              {estimate.items.map((item, index) => (
                <div
                  key={`${item.name}-${index}`}
                  className="rounded-xl bg-slate-800 p-4"
                >
                  <div className="font-semibold">{item.name}</div>

                  <div className="mt-1 text-sm text-slate-400">
                    {item.portion}
                  </div>

                  <div className="mt-2 text-sm">
                    {item.min_g}–{item.max_g} g de carboidratos
                    {Number.isFinite(Number(item.kcal)) && (
                      <span className="text-slate-400">
                        {" · "}
                        {Math.round(Number(item.kcal))} kcal
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-emerald-800 bg-emerald-950/40 p-4">
              <div className="text-sm text-emerald-300">
                Total estimado pela IA
              </div>

              <div className="mt-1 text-2xl font-bold">
                {estimate.total_min_g}–{estimate.total_max_g} g
              </div>

              {Number.isFinite(Number(estimate.total_kcal)) && (
                <div className="mt-1 text-sm text-emerald-200">
                  {Math.round(Number(estimate.total_kcal))} kcal no total
                </div>
              )}

              {estimate.observation && (
                <p className="mt-2 text-sm text-slate-300">
                  {estimate.observation}
                </p>
              )}
            </div>

            <div className="mt-4">
              <label
                htmlFor="carboidratos"
                className="mb-2 block text-sm font-medium"
              >
                Carboidratos usados no cálculo
              </label>

              <input
                id="carboidratos"
                inputMode="decimal"
                value={carboidratos}
                onChange={(e) => setCarboidratos(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />

              <p className="mt-2 text-xs text-slate-500">
                O valor médio da estimativa é preenchido
                automaticamente. Ajuste se você souber a quantidade
                real.
              </p>
            </div>

            <div className="mt-4">
              <label
                htmlFor="calorias"
                className="mb-2 block text-sm font-medium"
              >
                Calorias (kcal)
              </label>

              <input
                id="calorias"
                inputMode="numeric"
                value={calorias}
                onChange={(e) => setCalorias(e.target.value)}
                placeholder="Ex.: 520"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
              />

              <p className="mt-2 text-xs text-slate-500">
                Vem da estimativa e serve só para o histórico. As calorias não
                entram no cálculo da dose. Deixe em branco se não quiser
                registrar.
              </p>
            </div>

            <div className="mt-4">
              <label
                htmlFor="insulina-ativa"
                className="mb-2 block text-sm font-medium"
              >
                Insulina rápida ainda ativa (U)
              </label>

              <input
                id="insulina-ativa"
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
            <h2 className="text-lg font-semibold">
              4. Resultado matemático
            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-800 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Alimentação
                </div>

                <div className="mt-1 text-xl font-bold">
                  {formatarUnidades(resultado.doseAlimentar)} U
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Correção
                </div>

                <div className="mt-1 text-xl font-bold">
                  {formatarUnidades(resultado.doseCorrecao)} U
                </div>
              </div>

              <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 p-4">
                <div className="text-xs uppercase tracking-wide text-emerald-300">
                  Total matemático
                </div>

                <div className="mt-1 text-2xl font-bold">
                  {formatarUnidades(resultado.doseMatematica)} U
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
              <strong>Usado no cálculo:</strong>{" "}
              {parametros.nome} · {parametros.carboPorUnidade} g/U ·
              sensibilidade {parametros.sensibilidade} mg/dL/U · alvo{" "}
              {parametros.glicemiaAlvo} mg/dL · horário {horario}
            </div>

            <div className="mt-4 rounded-xl bg-amber-950/40 p-4 text-sm text-amber-200">
              Este resultado apenas reproduz matematicamente os parâmetros
              cadastrados. Confirme com o plano prescrito antes de qualquer
              aplicação.
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={salvarNoHistorico}
                disabled={salvo}
                className="flex-1 rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvo ? "Salvo no histórico" : "Salvar no histórico"}
              </button>

              <button
                type="button"
                onClick={salvarPadrao}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-3 font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Salvar como refeição padrão
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Refeições padrão</h2>

          <p className="mt-2 text-sm text-slate-400">
            O que você repete sempre. Usar uma preenche a refeição, os
            carboidratos e as calorias; a glicemia do momento continua sendo sua.
          </p>

          {diario.padroes.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
              Nenhuma ainda. Calcule uma refeição e toque em &ldquo;Salvar como
              refeição padrão&rdquo;.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[...diario.padroes]
                .sort((a, b) => b.usos - a.usos)
                .map((padrao) => (
                  <div
                    key={padrao.id}
                    className="rounded-xl border border-slate-700 bg-slate-950 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {padrao.nome}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {PARAMETROS_REFEICAO[padrao.tipoRefeicao].nome} ·{" "}
                          {padrao.carboidratos} g
                          {padrao.calorias !== null
                            ? ` · ${padrao.calorias} kcal`
                            : ""}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removerPadrao(padrao.id)}
                        aria-label={`Remover ${padrao.nome}`}
                        className="shrink-0 rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
                      >
                        ×
                      </button>
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      {padrao.usos > 0
                        ? `usada ${padrao.usos}${padrao.usos === 1 ? " vez" : " vezes"}${
                            padrao.ultimoUso
                              ? ` · última em ${formatarDia(padrao.ultimoUso)}`
                              : ""
                          }`
                        : padrao.criadoEm
                          ? `salva em ${formatarDia(padrao.criadoEm)}`
                          : "ainda não usada"}
                    </div>

                    <button
                      type="button"
                      onClick={() => usarPadrao(padrao)}
                      className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold transition hover:bg-slate-700"
                    >
                      Usar
                    </button>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Acompanhamento</h2>
            <span className="text-sm font-semibold text-emerald-400">
              {rotuloDoPeriodo}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-2">
              {[7, 30, 90, 0].map((dias) => {
                const ativo =
                  !periodo.de && !periodo.ate && periodo.dias === dias;

                return (
                  <button
                    key={dias}
                    type="button"
                    onClick={() => atualizarPeriodo({ dias, de: "", ate: "" })}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      ativo
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {dias === 0 ? "Tudo" : `${dias} dias`}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-400">
                <span className="mb-1 block">De</span>

                <input
                  type="date"
                  value={periodo.de}
                  max={diaLocal(new Date())}
                  onChange={(e) =>
                    atualizarPeriodo({ ...periodo, de: e.target.value })
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>

              <label className="text-xs text-slate-400">
                <span className="mb-1 block">Até</span>

                <input
                  type="date"
                  value={periodo.ate}
                  max={diaLocal(new Date())}
                  onChange={(e) =>
                    atualizarPeriodo({ ...periodo, ate: e.target.value })
                  }
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </label>

              {(periodo.de || periodo.ate) && (
                <button
                  type="button"
                  onClick={() =>
                    atualizarPeriodo({ dias: periodo.dias, de: "", ate: "" })
                  }
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-slate-800"
                >
                  Limpar datas
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Registros
              </div>

              <div className="mt-1 text-2xl font-bold">
                {painel.resumo.quantidade}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {painel.resumo.registrosPorDia === null
                  ? "nenhum no período"
                  : `${new Intl.NumberFormat("pt-BR", {
                      maximumFractionDigits: 1,
                    }).format(painel.resumo.registrosPorDia)}× por dia`}
              </div>
            </div>

            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Glicemia média
              </div>

              <div className="mt-1 text-2xl font-bold">
                {painel.resumo.glicemiaMedia ?? "—"}
                {painel.resumo.glicemiaMedia !== null && (
                  <span className="ml-1 text-sm font-normal text-slate-400">
                    mg/dL
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {painel.variacao === null
                  ? "sem período anterior para comparar"
                  : painel.variacao === 0
                    ? "igual ao período anterior"
                    : `${painel.variacao > 0 ? "▲ +" : "▼ "}${painel.variacao} mg/dL vs. anterior`}
              </div>
            </div>

            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Menor e maior
              </div>

              <div className="mt-1 text-2xl font-bold">
                {painel.resumo.glicemiaMinima === null
                  ? "—"
                  : `${painel.resumo.glicemiaMinima} / ${painel.resumo.glicemiaMaxima}`}
              </div>

              <div className="mt-1 text-xs text-slate-500">mg/dL no período</div>
            </div>

            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Carboidratos médios
              </div>

              <div className="mt-1 text-2xl font-bold">
                {painel.resumo.carboidratosMedios ?? "—"}
                {painel.resumo.carboidratosMedios !== null && (
                  <span className="ml-1 text-sm font-normal text-slate-400">
                    g
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">por refeição</div>
            </div>

            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Calorias médias
              </div>

              <div className="mt-1 text-2xl font-bold">
                {painel.resumo.caloriasMedias ?? "—"}
                {painel.resumo.caloriasMedias !== null && (
                  <span className="ml-1 text-sm font-normal text-slate-400">
                    kcal
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {painel.resumo.caloriasMedias === null
                  ? "nenhum registro com calorias"
                  : `por refeição, em ${painel.resumo.registrosComCalorias} de ${painel.resumo.quantidade}`}
              </div>
            </div>

            <div className="rounded-xl bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Calorias por dia
              </div>

              <div className="mt-1 text-2xl font-bold">
                {painel.resumo.caloriasPorDia ?? "—"}
                {painel.resumo.caloriasPorDia !== null && (
                  <span className="ml-1 text-sm font-normal text-slate-400">
                    kcal
                  </span>
                )}
              </div>

              <div className="mt-1 text-xs text-slate-500">
                {painel.resumo.caloriasPorDia === null
                  ? "nenhum dia registrado"
                  : painel.resumo.diasComCalorias === 1
                    ? "no único dia com registro, não no período todo"
                    : `nos ${painel.resumo.diasComCalorias} dias com registro, não no período todo`}
              </div>
            </div>
          </div>

          <GraficoDeGlicemia registros={painel.serie} alvo={parametros.glicemiaAlvo} />

          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">Histórico</h3>
              <span className="text-xs text-slate-500">
                {painel.todos.length} registros salvos
              </span>
            </div>

            {painel.registros.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
                {painel.todos.length === 0
                  ? "Calcule uma refeição e toque em “Salvar no histórico”."
                  : "Nenhum registro neste período."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {painel.registros.map((registro) => (
                  <li
                    key={registro.id}
                    className="flex items-center gap-3 rounded-xl bg-slate-950 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {registro.glicemia} mg/dL
                        <span className="ml-2 font-normal text-slate-400">
                          {registro.carboidratos} g
                          {registro.calorias !== null
                            ? ` · ${registro.calorias} kcal`
                            : ""}{" "}
                          · {formatarUnidades(registro.dose)} U
                        </span>
                      </div>

                      <div className="mt-1 truncate text-xs text-slate-500">
                        {PARAMETROS_REFEICAO[registro.tipoRefeicao].nome} ·{" "}
                        {formatarData(registro.quando)}
                        {registro.descricao ? ` · ${registro.descricao}` : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removerRegistro(registro.id)}
                      aria-label="Remover registro"
                      className="shrink-0 rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-500">
            O painel resume os registros salvos e não prevê resultados futuros.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Levar para outro aparelho</h2>

          <p className="mt-2 text-sm text-slate-400">
            {sincronizando ? (
              <>
                Seu diário está <strong>sincronizado na sua conta</strong>: o
                notebook e o celular veem o mesmo. O backup continua servindo
                para guardar uma cópia sua, fora do servidor.
              </>
            ) : (
              <>
                Seus dados ficam guardados <strong>neste navegador</strong>, então
                o notebook e o celular não se enxergam. Baixe o backup num,
                restaure no outro.
              </>
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={baixarBackup}
              className="flex-1 rounded-xl bg-slate-700 px-4 py-3 font-semibold text-white transition hover:bg-slate-600"
            >
              Baixar backup (.json)
            </button>

            <label className="flex-1 cursor-pointer rounded-xl border border-slate-700 px-4 py-3 text-center font-semibold text-slate-200 transition hover:bg-slate-800">
              Restaurar backup
              <input
                type="file"
                accept=".json,application/json"
                onChange={restaurarBackup}
                className="hidden"
              />
            </label>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Restaurar substitui o que está neste aparelho — o aviso mostra os dois
            lados antes. O arquivo sai com tudo, inclusive glicemias e doses:
            guarde como guardaria um exame.
          </p>
        </section>

        <GraficoDeDistribuicaoDaFaixa registros={painel.serie} />
      </div>
    </main>
  );
}

// Linha da glicemia no período, com a glicemia alvo como referência. Só desenha
// o que foi registrado.
function GraficoDeGlicemia({
  registros,
  alvo,
}: {
  registros: Registro[];
  alvo: number;
}) {
  if (registros.length < 2) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
        Salve ao menos dois registros no período para ver a evolução.
      </p>
    );
  }

  const largura = 760;
  const altura = 220;
  const esquerda = 44;
  const direita = 16;
  const topo = 16;
  const base = 30;
  const larguraUtil = largura - esquerda - direita;
  const alturaUtil = altura - topo - base;

  const valores = registros.map((registro) => registro.glicemia);
  const minimo = Math.max(0, Math.floor((Math.min(...valores, alvo) - 20) / 20) * 20);
  const maximo = Math.ceil((Math.max(...valores, alvo) + 20) / 20) * 20;
  const amplitude = maximo - minimo || 20;

  const x = (indice: number) =>
    esquerda + (larguraUtil * indice) / (registros.length - 1);
  const y = (valor: number) => topo + ((maximo - valor) / amplitude) * alturaUtil;

  return (
    <figure className="mt-5">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="w-full"
        role="img"
        aria-label={`Evolução de ${registros.length} registros de glicemia, de ${formatarData(
          registros[0].quando,
        )} a ${formatarData(registros[registros.length - 1].quando)}.`}
      >
        {[minimo, alvo, maximo].map((valor) => (
          <g key={valor}>
            <line
              x1={esquerda}
              y1={y(valor)}
              x2={largura - direita}
              y2={y(valor)}
              stroke={valor === alvo ? "#34d399" : "#1e293b"}
              strokeDasharray={valor === alvo ? "5 5" : undefined}
            />

            <text
              x={esquerda - 8}
              y={y(valor) + 4}
              textAnchor="end"
              fill="#64748b"
              fontSize="12"
            >
              {valor}
            </text>
          </g>
        ))}

        <polyline
          fill="none"
          stroke="#34d399"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={registros
            .map((registro, indice) => `${x(indice)},${y(registro.glicemia)}`)
            .join(" ")}
        />

        {registros.length <= 40 &&
          registros.map((registro, indice) => (
            <circle
              key={registro.id}
              cx={x(indice)}
              cy={y(registro.glicemia)}
              r="4"
              fill="#34d399"
              stroke="#0f172a"
              strokeWidth="2"
            >
              <title>
                {`${formatarData(registro.quando)}: ${registro.glicemia} mg/dL`}
              </title>
            </circle>
          ))}
      </svg>

      <figcaption className="mt-2 text-xs text-slate-500">
        Linha tracejada: glicemia alvo de {alvo} mg/dL, o valor cadastrado para a
        refeição selecionada.
      </figcaption>
    </figure>
  );
}

function GraficoDeDistribuicaoDaFaixa({ registros }: { registros: Registro[] }) {
  const distribuicao = registros.reduce(
    (atual, registro) => {
      atual[categoriaDaFaixaPessoal(registro.glicemia)] += 1;
      return atual;
    },
    { abaixo: 0, "na-faixa": 0, acima: 0 } as Record<CategoriaDaFaixaPessoal, number>,
  );
  const total = registros.length;
  const abaixoPercentual = (distribuicao.abaixo / (total || 1)) * 100;
  const faixaPercentual = (distribuicao["na-faixa"] / (total || 1)) * 100;
  const inicioAcima = abaixoPercentual + faixaPercentual;
  const preenchimento = total
    ? `conic-gradient(#f6c177 0 ${abaixoPercentual}%, #57d9b4 ${abaixoPercentual}% ${inicioAcima}%, #f28b82 ${inicioAcima}% 100%)`
    : "conic-gradient(#29433d 0 100%)";
  const faixas = [
    {
      chave: "abaixo",
      rotulo: "Abaixo da faixa",
      detalhe: `< ${LIMITE_INFERIOR_FAIXA_PESSOAL} mg/dL`,
      classe: "faixa-distribuicao__marcador--abaixo",
      quantidade: distribuicao.abaixo,
    },
    {
      chave: "na-faixa",
      rotulo: "Na faixa",
      detalhe: `${LIMITE_INFERIOR_FAIXA_PESSOAL}–${LIMITE_SUPERIOR_FAIXA_PESSOAL} mg/dL`,
      classe: "faixa-distribuicao__marcador--faixa",
      quantidade: distribuicao["na-faixa"],
    },
    {
      chave: "acima",
      rotulo: "Acima da faixa",
      detalhe: `> ${LIMITE_SUPERIOR_FAIXA_PESSOAL} mg/dL`,
      classe: "faixa-distribuicao__marcador--acima",
      quantidade: distribuicao.acima,
    },
  ];

  const resumo = faixas
    .map(({ rotulo, quantidade }) => `${rotulo}: ${percentual(quantidade, total)}%`)
    .join(". ");

  return (
    <section
      className="faixa-distribuicao rounded-2xl border border-slate-800 bg-slate-900 p-5"
      aria-labelledby="distribuicao-da-faixa-titulo"
    >
      <div className="faixa-distribuicao__cabecalho">
        <div>
          <p className="faixa-distribuicao__sobretitulo">Resumo visual</p>
          <h2
            id="distribuicao-da-faixa-titulo"
            className="faixa-distribuicao__titulo"
          >
            Distribuição da faixa pessoal
          </h2>
        </div>
        <p className="faixa-distribuicao__periodo">Registros do período selecionado</p>
      </div>

      <div className="faixa-distribuicao__conteudo">
        <div
          className="faixa-distribuicao__grafico"
          role="img"
          aria-label={
            total
              ? `Gráfico de pizza com ${total} medições. ${resumo}.`
              : "Gráfico de pizza sem medições no período selecionado."
          }
        >
          <div
            className="faixa-distribuicao__donut"
            style={{ background: preenchimento }}
          >
            <div className="faixa-distribuicao__miolo">
              <strong className="faixa-distribuicao__total">{total || "—"}</strong>
              <span className="faixa-distribuicao__total-rotulo">
                {total === 1 ? "medição" : "medições"}
              </span>
            </div>
          </div>
        </div>

        <ul className="faixa-distribuicao__lista">
          {faixas.map(({ chave, rotulo, detalhe, classe, quantidade }) => (
            <li key={chave} className="faixa-distribuicao__item">
              <span className={`faixa-distribuicao__marcador ${classe}`} />
              <span>
                <span className="faixa-distribuicao__item-rotulo">{rotulo}</span>
                <span className="faixa-distribuicao__item-detalhe">
                  {quantidade} {quantidade === 1 ? "medição" : "medições"} · {detalhe}
                </span>
              </span>
              <strong className="faixa-distribuicao__percentual">
                {percentual(quantidade, total)}%
              </strong>
            </li>
          ))}
        </ul>
      </div>

      <p className="faixa-distribuicao__legenda">
        A faixa pessoal do painel considera abaixo de {LIMITE_INFERIOR_FAIXA_PESSOAL}
        {" mg/dL"}, de {LIMITE_INFERIOR_FAIXA_PESSOAL} a {LIMITE_SUPERIOR_FAIXA_PESSOAL}
        {" mg/dL"} (inclusive) e acima de {LIMITE_SUPERIOR_FAIXA_PESSOAL}
        {" mg/dL"}.
      </p>
    </section>
  );
}
