// Checagem do backup e da conferência de dados. Rode com: node scripts/test-backup.mjs
import assert from "node:assert/strict";
import "../public/state.js";

const { blankState, normalizeState, makeBackup, readBackup, counts } = globalThis.DiaryState;

const leitura = (extra) => Object.assign({ value: 135, timestamp: "2026-09-15T08:30:00.000Z", unit: "mg/dL", source: "manual", note: "" }, extra);
const refeicao = (extra) => Object.assign({
  category: "almoco", recordedAt: "2026-09-15T15:10:00.000Z", note: "",
  items: [{ name: "Arroz", min: 12, max: 18, source: "tabela" }]
}, extra);

// 1. Um estado vazio continua vazio e completo.
assert.deepEqual(Object.keys(blankState()).sort(), [
  "favorites", "meals", "medicalOrientation", "parameters", "readings", "templates"
]);
// A tela joga bolus e basal direto no .value do input: faltando, vira "undefined".
assert.deepEqual(blankState().parameters, { rows: [], bolus: "", basal: "", note: "" });

// 2. Lixo no lugar do estado não derruba nada.
for (const entrada of [null, undefined, 42, "texto", []]) {
  assert.deepEqual(normalizeState(entrada), blankState(), `entrada: ${JSON.stringify(entrada)}`);
}

// 3. Medições fora dos limites do formulário são descartadas, não corrigidas.
const readings = normalizeState({
  readings: [
    leitura(),
    leitura({ value: 0 }),
    leitura({ value: 1000 }),
    leitura({ value: "não é número" }),
    leitura({ timestamp: "não é data" }),
    leitura({ timestamp: "" }),
    null
  ]
}).readings;
assert.equal(readings.length, 1);
assert.equal(readings[0].value, 135);
assert.equal(readings[0].unit, "mg/dL", "unidade é sempre mg/dL");
assert.ok(readings[0].id, "ganha id quando o arquivo não traz");

// 4. Campos livres são cortados e a origem cai no padrão quando é desconhecida.
const suja = normalizeState({ readings: [leitura({ note: "x".repeat(400), source: "inventada" })] }).readings[0];
assert.equal(suja.note.length, 160);
assert.equal(suja.source, "manual");
assert.equal(normalizeState({ readings: [leitura({ source: "cgm" })] }).readings[0].source, "cgm");

// 5. Refeição: faixa invertida e item sem nome caem; sem item válido a refeição some.
const meals = normalizeState({
  meals: [
    refeicao(),
    refeicao({ items: [{ name: "Erro", min: 20, max: 5, source: "tabela" }] }),
    refeicao({ items: [{ name: "", min: 1, max: 2, source: "tabela" }] }),
    refeicao({ items: [] }),
    refeicao({ recordedAt: "não é data" }),
    refeicao({ category: "ceia" })
  ]
}).meals;
assert.equal(meals.length, 2, "sobram a válida e a de categoria desconhecida");
assert.equal(meals[0].items[0].max, 18, "a faixa inteira sobrevive");
assert.equal(meals[1].category, "cafe", "categoria desconhecida cai no padrão");

// 6. Refeições padrão preservam a faixa e zeram o histórico ausente.
const templates = normalizeState({
  templates: [
    { name: "Café de sempre", category: "cafe", items: [{ name: "Pão", min: 28, max: 28, source: "tabela" }] },
    { name: "  ", items: [{ name: "Pão", min: 1, max: 1, source: "tabela" }] },
    { name: "Sem itens", items: [] }
  ]
}).templates;
assert.equal(templates.length, 1);
assert.equal(templates[0].uses, 0);
assert.equal(templates[0].items[0].max, 28);
assert.equal(templates[0].items[0].id, undefined, "item de padrão não carrega id");

// 7. Ida e volta: o backup preserva tudo o que estava salvo.
const original = normalizeState({
  readings: [leitura(), leitura({ value: 90, timestamp: "2026-09-14T08:00:00.000Z", source: "cgm" })],
  meals: [refeicao({ items: [
    { name: "Arroz", min: 12, max: 18, source: "tabela" },
    { name: "Feijão", min: 14, max: 14, source: "tabela" },
    { name: "Suco", min: 20, max: 20, source: "rotulo" }
  ] })],
  medicalOrientation: { text: "Texto do paciente", updatedAt: "2026-09-01T10:00:00.000Z" },
  parameters: { rows: [{ start: 6, correction: "50", ratio: "12" }], bolus: "Lispro", basal: "", note: "" },
  favorites: [{ food: "Arroz branco cozido", measure: "colher de sopa cheia", quantity: 2, uses: 3 }],
  templates: [{ name: "Café de sempre", category: "cafe", items: [{ name: "Pão", min: 28, max: 28, source: "tabela" }] }]
});

const voltou = readBackup(JSON.stringify(makeBackup(original, "2026-09-15T12:00:00.000Z")));
assert.equal(voltou.ok, true);
assert.deepEqual(voltou.state, original, "o backup volta idêntico");
assert.equal(voltou.savedAt, "2026-09-15T12:00:00.000Z");
assert.deepEqual(voltou.counts, {
  readings: 2, meals: 1, templates: 1, favorites: 1, parameterRows: 1, hasOrientation: true
});
// O almoço de 3 itens volta inteiro — é exatamente o que o CSV perdia.
assert.equal(voltou.state.meals[0].items.length, 3);

// 8. Um estado cru, sem embrulho de backup, também é aceito.
const cru = readBackup(JSON.stringify({ readings: [leitura()], meals: [] }));
assert.equal(cru.ok, true);
assert.equal(cru.counts.readings, 1);

// 9. Arquivos que não são backup são recusados com motivo, nunca aceitos pela metade.
for (const [conteudo, motivo] of [
  ["não é json", "json inválido"],
  ["[1,2,3]", "lista solta"],
  ["null", "nulo"],
  [JSON.stringify({ app: "outro-app", state: { readings: [] } }), "de outro aplicativo"],
  [JSON.stringify({ qualquer: "coisa" }), "sem medições nem refeições"]
]) {
  const recusado = readBackup(conteudo);
  assert.equal(recusado.ok, false, motivo);
  assert.ok(recusado.error && recusado.error.length > 10, `mensagem clara para: ${motivo}`);
}

// 10. O que foi descartado é contado, para a tela poder avisar.
const parcial = readBackup(JSON.stringify({
  readings: [leitura(), leitura({ value: -5 }), leitura({ timestamp: "" })],
  meals: [refeicao(), refeicao({ items: [] })]
}));
assert.equal(parcial.ok, true);
assert.deepEqual(parcial.discarded, { readings: 2, meals: 1 });

// 11. counts() enxerga o estado vazio sem explodir.
assert.deepEqual(counts(blankState()), {
  readings: 0, meals: 0, templates: 0, favorites: 0, parameterRows: 0, hasOrientation: false
});

console.log("Backup: conferência de dados, ida e volta e recusas conferidas.");
