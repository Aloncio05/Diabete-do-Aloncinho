// Checagem do histórico e das contas do painel.
// Rode com: node --experimental-strip-types scripts/test-diario.mjs
import assert from "node:assert/strict";
import {
  normalizarDiario,
  normalizarRegistros,
  normalizarPadroes,
  diarioVazio,
  recorteDe,
  recorteAnterior,
  dentroDoRecorte,
  diasCobertos,
  resumir,
  media,
  diaLocal,
  montarBackup,
  lerBackup,
} from "../lib/diario.ts";

const DIA = 86400000;
const agora = new Date(2026, 8, 15, 12).getTime();
const registro = (extra = {}) => ({
  quando: "2026-09-15T11:30:00.000Z",
  tipoRefeicao: "almoco",
  glicemia: 140,
  carboidratos: 60,
  insulinaAtiva: 0,
  dose: 7.5,
  descricao: "arroz e feijão",
  ...extra,
});

// 1. Lixo não derruba o histórico.
for (const entrada of [null, undefined, 42, "texto", []]) {
  assert.deepEqual(normalizarDiario(entrada), diarioVazio(), `entrada: ${JSON.stringify(entrada)}`);
}

// 2. Registros fora dos limites são descartados, não corrigidos.
const registros = normalizarRegistros([
  registro(),
  registro({ glicemia: 0 }),
  registro({ glicemia: 1000 }),
  registro({ glicemia: "nada" }),
  registro({ carboidratos: -1 }),
  registro({ quando: "não é data" }),
  null,
]);
assert.equal(registros.length, 1);
assert.equal(registros[0].glicemia, 140);
assert.ok(registros[0].id, "ganha id quando não vem no armazenamento");

// 3. Tipo de refeição desconhecido cai no padrão, e texto longo é cortado.
const sujo = normalizarRegistros([registro({ tipoRefeicao: "brunch", descricao: "x".repeat(400) })])[0];
assert.equal(sujo.tipoRefeicao, "almoco");
assert.equal(sujo.descricao.length, 200);
assert.equal(normalizarRegistros([registro({ tipoRefeicao: "ceia" })])[0].tipoRefeicao, "ceia");

// 4. Refeição padrão sem nome não existe; o histórico de uso começa zerado.
const padroes = normalizarPadroes([
  { nome: "Almoço de sempre", tipoRefeicao: "almoco", carboidratos: 60, descricao: "arroz", porcao: "2 colheres" },
  { nome: "   ", carboidratos: 10 },
  { nome: "Sem carboidrato", carboidratos: "nada" },
]);
assert.equal(padroes.length, 1);
assert.equal(padroes[0].usos, 0);
assert.equal(padroes[0].carboidratos, 60);

// 5. O filtro de data manda, e "até" inclui o dia inteiro.
const recorte = recorteDe({ dias: 30, de: "2026-09-10", ate: "2026-09-12" }, agora);
assert.equal(recorte.inicio, new Date(2026, 8, 10).getTime());
assert.equal(recorte.fim, new Date(2026, 8, 12).getTime() + DIA - 1);

const emDias = [
  registro({ quando: new Date(2026, 8, 9, 8).toISOString(), glicemia: 150 }),
  registro({ quando: new Date(2026, 8, 10, 8).toISOString(), glicemia: 100 }),
  registro({ quando: new Date(2026, 8, 12, 23).toISOString(), glicemia: 120 }),
  registro({ quando: new Date(2026, 8, 13, 8).toISOString(), glicemia: 200 }),
].map((item) => normalizarRegistros([item])[0]);

assert.deepEqual(dentroDoRecorte(emDias, recorte).map((r) => r.glicemia), [100, 120]);

// 6. Só uma das pontas também recorta.
assert.deepEqual(
  dentroDoRecorte(emDias, recorteDe({ dias: 30, de: "2026-09-12", ate: "" }, agora)).map((r) => r.glicemia),
  [120, 200],
);
assert.deepEqual(
  dentroDoRecorte(emDias, recorteDe({ dias: 30, de: "", ate: "2026-09-10" }, agora)).map((r) => r.glicemia),
  [150, 100],
);

// 7. Sem datas vale a janela móvel; dias === 0 é "tudo".
assert.equal(recorteDe({ dias: 7, de: "", ate: "" }, agora).inicio, agora - 7 * DIA);
assert.equal(recorteDe({ dias: 0, de: "", ate: "" }, agora).inicio, -Infinity);

// 8. O período anterior tem a mesma duração e termina onde o atual começa.
const semana = recorteDe({ dias: 7, de: "", ate: "" }, agora);
const anterior = recorteAnterior(semana, agora);
assert.equal(anterior.fim, semana.inicio - 1);
assert.equal(anterior.inicio, semana.inicio - 7 * DIA);
assert.equal(recorteAnterior(recorteDe({ dias: 0, de: "", ate: "" }, agora), agora), null, "'tudo' não compara");

// 9. Resumo: médias, extremos e registros por dia.
const resumo = resumir(dentroDoRecorte(emDias, recorteDe({ dias: 0, de: "", ate: "" }, agora)), recorteDe({ dias: 0, de: "", ate: "" }, agora), agora);
assert.equal(resumo.quantidade, 4);
assert.equal(resumo.glicemiaMedia, 143, "(150+100+120+200)/4 = 142,5 -> 143");
assert.equal(resumo.glicemiaMinima, 100);
assert.equal(resumo.glicemiaMaxima, 200);
assert.equal(resumo.carboidratosMedios, 60);

// 10. Sem registros o resumo não quebra nem inventa número.
const vazio = resumir([], recorteDe({ dias: 7, de: "", ate: "" }, agora), agora);
assert.deepEqual(vazio, {
  quantidade: 0,
  glicemiaMedia: null,
  glicemiaMinima: null,
  glicemiaMaxima: null,
  carboidratosMedios: null,
  caloriasMedias: null,
  caloriasPorDia: null,
  registrosComCalorias: 0,
  diasComCalorias: 0,
  registrosPorDia: null,
});

// 11. Dias cobertos nunca é zero quando há recorte, para não dividir por zero.
assert.equal(diasCobertos(recorteDe({ dias: 7, de: "", ate: "" }, agora), emDias, agora), 7);
assert.equal(diasCobertos(recorteDe({ dias: 30, de: "2026-09-15", ate: "2026-09-15" }, agora), emDias, agora), 1);
assert.equal(diasCobertos(recorteDe({ dias: 0, de: "", ate: "" }, agora), [], agora), 0);

// 12. Calorias: ausência não é zero, e registro antigo sem o campo continua válido.
const comCalorias = normalizarRegistros([
  registro({ calorias: 450 }),
  registro({ calorias: 0 }),
  registro({}), // anterior às calorias
  registro({ calorias: "nada" }),
  registro({ calorias: -10 }),
  registro({ calorias: 99999 }),
  registro({ calorias: 320.4 }),
]);
assert.equal(comCalorias.length, 7, "nenhum registro é descartado por causa da caloria");
assert.deepEqual(
  comCalorias.map((r) => r.calorias),
  [450, 0, null, null, null, null, 320],
  "zero vale; inválido e fora de faixa viram ausência; decimal arredonda",
);

// 13. A média por refeição usa só quem tem o dado; a média por dia divide pelos
// dias que têm registro, não pelos dias do recorte.
const recorteDeDoisDias = recorteDe({ dias: 2, de: "", ate: "" }, agora);
const resumoComCalorias = resumir(
  normalizarRegistros([
    registro({ quando: new Date(agora - 3600000).toISOString(), calorias: 600 }),
    registro({ quando: new Date(agora - 7200000).toISOString(), calorias: 400 }),
    registro({ quando: new Date(agora - 10800000).toISOString() }), // sem caloria
  ]),
  recorteDeDoisDias,
  agora,
);
assert.equal(resumoComCalorias.quantidade, 3);
assert.equal(resumoComCalorias.registrosComCalorias, 2);
assert.equal(resumoComCalorias.diasComCalorias, 1, "as duas refeições são do mesmo dia");
assert.equal(resumoComCalorias.caloriasMedias, 500, "(600+400)/2 refeições");
assert.equal(resumoComCalorias.caloriasPorDia, 1000, "(600+400)/1 dia registrado");

// Uma refeição num recorte longo não pode virar uma média por dia minúscula.
const umDiaEmTrintaDias = resumir(
  normalizarRegistros([
    registro({ quando: new Date(agora - 3600000).toISOString(), calorias: 555 }),
  ]),
  recorteDe({ dias: 30, de: "", ate: "" }, agora),
  agora,
);
assert.equal(umDiaEmTrintaDias.diasComCalorias, 1);
assert.equal(umDiaEmTrintaDias.caloriasPorDia, 555, "não dilui pelos 30 dias do recorte");

// Dias diferentes somam e dividem pelo número de dias com registro.
const doisDias = resumir(
  normalizarRegistros([
    registro({ quando: new Date(agora - 3600000).toISOString(), calorias: 600 }),
    registro({ quando: new Date(agora - 30 * 3600000).toISOString(), calorias: 400 }),
  ]),
  recorteDe({ dias: 30, de: "", ate: "" }, agora),
  agora,
);
assert.equal(doisDias.diasComCalorias, 2);
assert.equal(doisDias.caloriasPorDia, 500, "(600+400)/2 dias");

// Nenhum registro com caloria: nada de média, em vez de zero.
const semNenhuma = resumir(
  normalizarRegistros([registro({}), registro({})]),
  recorteDeDoisDias,
  agora,
);
assert.equal(semNenhuma.caloriasMedias, null);
assert.equal(semNenhuma.caloriasPorDia, null);
assert.equal(semNenhuma.registrosComCalorias, 0);
assert.equal(semNenhuma.diasComCalorias, 0);

// 14. Refeição padrão também guarda caloria, e a ausência dela não invalida.
const padroesComCalorias = normalizarPadroes([
  { nome: "Com caloria", carboidratos: 60, calorias: 520 },
  { nome: "Sem caloria", carboidratos: 60 },
]);
assert.deepEqual(padroesComCalorias.map((p) => p.calorias), [520, null]);

// 15. Utilitários.
assert.equal(media([100, 200]), 150);
assert.equal(media([]), null);
assert.equal(diaLocal(new Date(2026, 8, 15, 23)), "2026-09-15", "usa o dia local, não o UTC");

// 16. Backup: o arquivo volta idêntico, com calorias e histórico de uso.
const diarioCompleto = normalizarDiario({
  registros: [
    registro({ calorias: 555 }),
    registro({ quando: "2026-09-14T11:00:00.000Z", glicemia: 90, calorias: null, tipoRefeicao: "ceia" }),
  ],
  padroes: [
    {
      nome: "Almoço de sempre", tipoRefeicao: "almoco", descricao: "arroz", porcao: "2 colheres",
      carboidratos: 60, calorias: 520, usos: 4, criadoEm: "2026-09-01T10:00:00.000Z",
      ultimoUso: "2026-09-14T12:00:00.000Z",
    },
  ],
});

const voltou = lerBackup(JSON.stringify(montarBackup(diarioCompleto, "2026-09-15T12:00:00.000Z")));
assert.equal(voltou.ok, true);
assert.deepEqual(voltou.diario, diarioCompleto, "o backup volta idêntico");
assert.equal(voltou.salvoEm, "2026-09-15T12:00:00.000Z");
assert.deepEqual(voltou.contagens, { registros: 2, padroes: 1 });
assert.equal(voltou.diario.registros[0].calorias, 555, "a caloria sobrevive à ida e volta");
assert.equal(voltou.diario.padroes[0].usos, 4, "o histórico de uso sobrevive");

// 17. Um diário cru, sem embrulho de backup, também é aceito.
const cru = lerBackup(JSON.stringify({ registros: [registro()], padroes: [] }));
assert.equal(cru.ok, true);
assert.equal(cru.contagens.registros, 1);

// 18. Arquivos que não são backup são recusados com motivo, nunca pela metade.
for (const [conteudo, motivo] of [
  ["não é json", "json inválido"],
  ["[1,2,3]", "lista solta"],
  ["null", "nulo"],
  [JSON.stringify({ app: "outro-app", diario: { registros: [] } }), "de outro aplicativo"],
  [JSON.stringify({ qualquer: "coisa" }), "sem registros nem padrões"],
]) {
  const recusado = lerBackup(conteudo);
  assert.equal(recusado.ok, false, motivo);
  assert.ok(recusado.erro && recusado.erro.length > 10, `mensagem clara para: ${motivo}`);
}

// 19. O que não passa na conferência é contado, para a tela poder avisar.
const parcial = lerBackup(JSON.stringify({
  registros: [registro(), registro({ glicemia: -5 }), registro({ quando: "" })],
  padroes: [{ nome: "Boa", carboidratos: 10 }, { nome: "", carboidratos: 10 }],
}));
assert.equal(parcial.ok, true);
assert.deepEqual(parcial.descartados, { registros: 2, padroes: 1 });

console.log("Diário: histórico, recorte por data, resumo e backup conferidos.");
