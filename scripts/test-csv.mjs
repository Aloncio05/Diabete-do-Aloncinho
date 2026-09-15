// Checagem do leitor de exportações. Rode com: node scripts/test-csv.mjs
import assert from "node:assert/strict";
import "../public/csv.js";

const { parseCsv, parseDateTime, parseNumber, extractEntries } = globalThis.DiaryCsv;

// 1. Separador ponto e vírgula, BOM e aspas com separador dentro.
let rows = parseCsv('﻿Data;Glicemia;Observação\r\n15/09/2026 08:30;135;"café, com açúcar"\r\n');
assert.equal(rows.length, 2);
assert.deepEqual(rows[1], ["15/09/2026 08:30", "135", "café, com açúcar"]);

// 2. Separador vírgula e aspas escapadas.
rows = parseCsv('Data,Glicemia\n2026-09-15T08:30,135\n"16/09/2026 09:00",142\n');
assert.equal(rows.length, 3);
assert.deepEqual(rows[2], ["16/09/2026 09:00", "142"]);

// 3. Datas nos formatos que aparecem em exportações brasileiras.
assert.equal(parseDateTime("15/09/2026", "08:30").getHours(), 8);
assert.equal(parseDateTime("15/09/2026 08:30").getDate(), 15);
assert.equal(parseDateTime("15/09/2026 08:30").getMonth(), 8, "setembro = mês 8");
assert.equal(parseDateTime("2026-09-15T08:30").getFullYear(), 2026);
assert.equal(parseDateTime("15-09-2026 08:30:45").getMinutes(), 30);
assert.equal(parseDateTime(""), null);
assert.equal(parseDateTime("não é data"), null);

// 4. Números no padrão brasileiro.
assert.equal(parseNumber("135"), 135);
assert.equal(parseNumber("12,5"), 12.5);
assert.equal(parseNumber("1.234,5"), 1234.5);
assert.equal(parseNumber("135 mg/dL"), 135);
assert.equal(parseNumber(""), null);
assert.equal(parseNumber("—"), null);

// 5. Cabeçalho com acento e maiúsculas é reconhecido.
let resultado = extractEntries(parseCsv(
  "Data;Hora;Glicemia (mg/dL);Carboidratos;Observação\n" +
  "15/09/2026;08:30;135;15;café da manhã\n" +
  "15/09/2026;12:10;110;60;almoço\n"
));
assert.equal(resultado.readings.length, 2);
assert.equal(resultado.carbs.length, 2);
assert.equal(resultado.readings[0].value, 135);
assert.equal(resultado.carbs[1].grams, 60);
assert.equal(resultado.readings[0].note, "café da manhã");
assert.equal(resultado.skipped, 0);

// 6. Linhas sem data ou com valores fora de faixa são ignoradas, não importadas.
resultado = extractEntries(parseCsv(
  "Data;Glicemia\n" +
  "15/09/2026 08:30;135\n" +
  ";200\n" +            // sem data
  "16/09/2026 08:30;0\n" +   // valor inválido
  "17/09/2026 08:30;5000\n"  // fora de faixa
));
assert.equal(resultado.readings.length, 1, "só a linha válida entra");
assert.equal(resultado.skipped, 3);

// 7. Exportação só de glicemia (sem coluna de carboidrato) não inventa refeições.
resultado = extractEntries(parseCsv("Data;Valor\n15/09/2026 08:30;135\n"));
assert.equal(resultado.readings.length, 1);
assert.equal(resultado.carbs.length, 0);

// 8. Arquivo irreconhecível não explode nem importa lixo.
resultado = extractEntries(parseCsv("alguma coisa;outra coisa\nabc;def\n"));
assert.equal(resultado.readings.length, 0);
assert.equal(resultado.carbs.length, 0);

console.log("ok — 8 checagens passaram");
