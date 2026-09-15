import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_DATA_URL_LENGTH = 2_500_000;

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeImage(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return undefined;
  }

  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : undefined;
}

function splitImage(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const configuredToken = process.env.APP_ACCESS_TOKEN?.trim();

  if (!apiKey) {
    return json(503, {
      error: "GEMINI_API_KEY não configurada no Vercel.",
    });
  }

  if (configuredToken) {
    const received = request.headers.get("x-diary-access-token")?.trim();
    if (received !== configuredToken) {
      return json(401, { error: "Token privado inválido." });
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "JSON inválido." });
  }

  const description =
    typeof body?.description === "string" ? body.description.trim().slice(0, 700) : "";
  const portion =
    typeof body?.portion === "string" ? body.portion.trim().slice(0, 220) : "";
  const imageDataUrl = normalizeImage(body?.imageDataUrl);

  if ((!description && !imageDataUrl) || imageDataUrl === undefined) {
    return json(400, {
      error: "Informe a refeição por texto ou envie uma foto válida.",
    });
  }

  const parts: any[] = [
    {
      text: [
        "Analise somente a refeição informada.",
        "Estime carboidratos em gramas por item e no total.",
        "Retorne uma faixa mínima e máxima realista.",
        "Não calcule nem mencione insulina, dose, bolus ou correção.",
        `Descrição: ${description || "não informada"}`,
        `Porção: ${portion || "não informada"}`,
      ].join("\n"),
    },
  ];

  if (imageDataUrl) {
    const image = splitImage(imageDataUrl);
    if (!image) return json(400, { error: "Foto inválida." });

    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    });
  }

  const schema = {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            portion: { type: "STRING" },
            min_g: { type: "NUMBER" },
            max_g: { type: "NUMBER" },
          },
          required: ["name", "portion", "min_g", "max_g"],
        },
      },
      total_min_g: { type: "NUMBER" },
      total_max_g: { type: "NUMBER" },
      observation: { type: "STRING" },
    },
    required: ["items", "total_min_g", "total_max_g", "observation"],
  };

  let upstream: Response;
  try {
    upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      },
    );
  } catch {
    return json(502, { error: "Falha ao acessar o Gemini." });
  }

  const raw = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    const message =
      typeof raw?.error?.message === "string"
        ? raw.error.message.slice(0, 300)
        : "Falha na estimativa.";
    return json(502, { error: message });
  }

  const text = raw?.candidates?.[0]?.content?.parts?.find(
    (part: any) => typeof part?.text === "string",
  )?.text;

  if (!text) {
    return json(502, { error: "Gemini não retornou uma estimativa." });
  }

  try {
    const estimate = JSON.parse(text);
    return json(200, { estimate });
  } catch {
    return json(502, { error: "Resposta inválida do Gemini." });
  }
}
