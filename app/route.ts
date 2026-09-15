import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function normalizeImage(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_500_000) return undefined;

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

  if (!apiKey) {
    return json(503, {
      error: "GEMINI_API_KEY não está configurada no Vercel.",
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Dados inválidos." });
  }

  const description =
    typeof body?.description === "string" ? body.description.trim() : "";
  const portion =
    typeof body?.portion === "string" ? body.portion.trim() : "";
  const imageDataUrl = normalizeImage(body?.imageDataUrl);

  if ((!description && !imageDataUrl) || imageDataUrl === undefined) {
    return json(400, {
      error: "Informe a refeição por texto ou envie uma foto válida.",
    });
  }

  const parts: any[] = [
    {
      text: [
        "Você é um assistente de contagem de carboidratos.",
        "Analise somente alimentos e porções.",
        "Estime carboidratos em gramas por item e no total.",
        "Não calcule nem mencione insulina, medicamentos ou tratamento.",
        "Use uma faixa mínima e máxima realista.",
        `Descrição: ${description || "não informada"}`,
        `Porção: ${portion || "não informada"}`,
      ].join("\n"),
    },
  ];

  if (imageDataUrl) {
    const image = splitImage(imageDataUrl);
    if (!image) return json(400, { error: "Imagem inválida." });

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
            responseSchema,
          },
        }),
      },
    );
  } catch {
    return json(502, { error: "Não foi possível acessar o serviço de IA." });
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
    return json(502, { error: "A IA não retornou uma estimativa." });
  }

  try {
    return json(200, { estimate: JSON.parse(text) });
  } catch {
    return json(502, { error: "A IA retornou uma resposta inválida." });
  }
}
