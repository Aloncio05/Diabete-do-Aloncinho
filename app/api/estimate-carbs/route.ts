import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const MAX_GEMINI_ATTEMPTS = 3;
const MAX_AUTOMATIC_RETRY_DELAY_MS = 4_000;
const RETRYABLE_GEMINI_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TEMPORARY_AI_ERROR =
  "A análise por IA está temporariamente indisponível. Tente novamente em alguns instantes.";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeImage(value: unknown) {
  if (value == null || value === "") return null;

  if (typeof value !== "string" || value.length > 2_500_000) {
    return undefined;
  }

  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
    value,
  )
    ? value
    : undefined;
}

function splitImage(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);

  return match
    ? {
        mimeType: match[1],
        data: match[2],
      }
    : null;
}

function retryAfterMs(value: string | null) {
  const retryAfter = value?.trim();

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(retryAfter);

  return Number.isFinite(retryAt)
    ? Math.max(0, retryAt - Date.now())
    : null;
}

function retryDelayMs(attempt: number, retryAfter: string | null) {
  const serverDelay = retryAfterMs(retryAfter);

  if (serverDelay !== null) {
    return serverDelay <= MAX_AUTOMATIC_RETRY_DELAY_MS ? serverDelay : null;
  }

  const backoff = 500 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);

  return Math.min(backoff + jitter, 2_000);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiStatus(status: number) {
  return RETRYABLE_GEMINI_STATUSES.has(status);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    return json(503, {
      error: "GEMINI_API_KEY não está configurada no Vercel.",
    });
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return json(400, {
      error: "Dados inválidos.",
    });
  }

  const description =
    typeof body?.description === "string"
      ? body.description.trim()
      : "";

  const portion =
    typeof body?.portion === "string"
      ? body.portion.trim()
      : "";

  const imageDataUrl = normalizeImage(body?.imageDataUrl);

  if ((!description && !imageDataUrl) || imageDataUrl === undefined) {
    return json(400, {
      error: "Informe a refeição por texto ou envie uma foto válida.",
    });
  }

  const parts: any[] = [
    {
      text: [
        "Você é um assistente de contagem de carboidratos e calorias.",
        "Analise somente os alimentos e suas porções.",
        "Estime os carboidratos em gramas.",
        "Informe uma faixa mínima e máxima por alimento.",
        "Estime também as calorias em kcal de cada alimento, para a porção indicada.",
        "As calorias são um número único por alimento, não uma faixa.",
        "Não calcule ou recomende insulina.",
        "Não faça alterações de tratamento.",
        `Descrição: ${description || "não informada"}`,
        `Porção: ${portion || "não informada"}`,
      ].join("\n"),
    },
  ];

  if (imageDataUrl) {
    const image = splitImage(imageDataUrl);

    if (!image) {
      return json(400, {
        error: "Imagem inválida.",
      });
    }

    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    });
  }

  const responseSchema = {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: {
              type: "STRING",
            },
            portion: {
              type: "STRING",
            },
            min_g: {
              type: "NUMBER",
            },
            max_g: {
              type: "NUMBER",
            },
            kcal: {
              type: "NUMBER",
            },
          },
          required: [
            "name",
            "portion",
            "min_g",
            "max_g",
            "kcal",
          ],
        },
      },
      total_min_g: {
        type: "NUMBER",
      },
      total_max_g: {
        type: "NUMBER",
      },
      total_kcal: {
        type: "NUMBER",
      },
      observation: {
        type: "STRING",
      },
    },
    required: [
      "items",
      "total_min_g",
      "total_max_g",
      "total_kcal",
      "observation",
    ],
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;
  const requestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  };
  let upstream: Response | null = null;

  for (let attempt = 0; attempt < MAX_GEMINI_ATTEMPTS; attempt += 1) {
    try {
      upstream = await fetch(endpoint, requestInit);
    } catch {
      if (attempt < MAX_GEMINI_ATTEMPTS - 1) {
        const delay = retryDelayMs(attempt, null);

        if (delay !== null) {
          await wait(delay);
        }
      }

      continue;
    }

    if (
      upstream.ok ||
      !isRetryableGeminiStatus(upstream.status) ||
      attempt === MAX_GEMINI_ATTEMPTS - 1
    ) {
      break;
    }

    const delay = retryDelayMs(attempt, upstream.headers.get("retry-after"));

    if (delay === null) {
      break;
    }

    await upstream.body?.cancel().catch(() => undefined);
    await wait(delay);
  }

  if (!upstream) {
    return json(503, {
      error: TEMPORARY_AI_ERROR,
      retryable: true,
    });
  }

  const raw = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    if (isRetryableGeminiStatus(upstream.status)) {
      return json(503, {
        error: TEMPORARY_AI_ERROR,
        retryable: true,
      });
    }

    return json(502, {
      error:
        upstream.status === 404
          ? "O modelo de IA configurado não está disponível. Verifique GEMINI_MODEL."
          : "Não foi possível concluir a análise por IA. Verifique a configuração e tente novamente.",
    });
  }

  const text =
    raw?.candidates?.[0]?.content?.parts?.find(
      (part: any) => typeof part?.text === "string",
    )?.text;

  if (!text) {
    return json(502, {
      error: "A IA não retornou uma estimativa.",
    });
  }

  try {
    const estimate = JSON.parse(text);

    return json(200, {
      estimate,
    });
  } catch {
    return json(502, {
      error: "A IA retornou uma resposta inválida.",
    });
  }
}
