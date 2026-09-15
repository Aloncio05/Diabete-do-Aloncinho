// Checagem do endpoint de estimativa sem rede e sem chave de API.
// Rode com: node scripts/test-estimate-carbs.mjs
import assert from "node:assert/strict";
import api from "../api/estimate-carbs.js";

const TOKEN = "token-de-teste";

function geminiReply(estimate) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(estimate) }] } }] }),
  };
}

function pedido(body, token = TOKEN) {
  return new Request("https://exemplo.test/api/estimate-carbs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-diary-access-token": token },
    body: JSON.stringify(body),
  });
}

const refeicao = { description: "arroz e feijão", portion: "2 colheres e 1 concha", consent: true };

const estimativaValida = {
  items: [{
    name: "Arroz branco",
    portion_description: "2 colheres de sopa",
    carbohydrates_min_g: 10,
    carbohydrates_max_g: 14,
    confidence: "média",
  }],
  total_min_g: 10,
  total_max_g: 14,
  assumptions: ["Colher de sopa cheia."],
  needs_confirmation: true,
  clarification_question: "",
};

const original = { fetch: globalThis.fetch, env: { ...process.env } };
const usarResposta = (r) => { globalThis.fetch = async () => r; };

try {
  // 1. Sem configuração: 503 nomeia o que falta, sem vazar valores.
  delete process.env.GEMINI_API_KEY;
  delete process.env.APP_ACCESS_TOKEN;
  let res = await api.fetch(pedido(refeicao));
  let body = await res.json();
  assert.equal(res.status, 503);
  assert.deepEqual(body.missing, ["GEMINI_API_KEY", "APP_ACCESS_TOKEN"]);

  process.env.GEMINI_API_KEY = "chave-falsa";
  process.env.APP_ACCESS_TOKEN = TOKEN;

  // 2. Código de acesso errado é barrado antes de qualquer chamada externa.
  usarResposta(geminiReply(estimativaValida));
  res = await api.fetch(pedido(refeicao, "senha-errada"));
  assert.equal(res.status, 401);

  // 3. Caminho feliz: clarification_question vazia NÃO pode invalidar a estimativa.
  usarResposta(geminiReply(estimativaValida));
  res = await api.fetch(pedido(refeicao));
  body = await res.json();
  assert.equal(res.status, 200, "estimativa válida deveria passar");
  assert.equal(body.estimate.clarification_question, null, '"" vira null para o navegador');
  assert.equal(body.estimate.total_max_g, 14);

  // 4. Trava clínica: resposta que fala de dose é descartada inteira.
  usarResposta(geminiReply({
    ...estimativaValida,
    assumptions: ["Aplique a dose de insulina conforme a glicemia."],
  }));
  res = await api.fetch(pedido(refeicao));
  assert.equal(res.status, 502, "texto sobre dose tem de ser rejeitado");

  // 5. Totais que não batem com a soma dos itens são rejeitados.
  usarResposta(geminiReply({ ...estimativaValida, total_max_g: 99 }));
  res = await api.fetch(pedido(refeicao));
  assert.equal(res.status, 502, "total inconsistente tem de ser rejeitado");

  // 6. Erro do Google é repassado para o usuário saber o que corrigir.
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ error: { message: "models/modelo-inexistente is not found" } }),
  });
  res = await api.fetch(pedido(refeicao));
  body = await res.json();
  assert.equal(res.status, 502);
  assert.match(body.error, /modelo-inexistente/);

  console.log("ok — 6 checagens passaram");
} finally {
  globalThis.fetch = original.fetch;
  process.env = original.env;
}
