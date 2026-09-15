// Checagem das contas do painel. Rode com: node scripts/test-dashboard.mjs
import assert from "node:assert/strict";
import "../public/stats.js";

const { dayKey, bounds, previousBounds, filterByRange, average, daySpan, dailyAverages, trendSeries } =
  globalThis.DiaryStats;

const DAY = 86400000;
const at = (isoDate, hour) => new Date(`${isoDate}T${String(hour).padStart(2, "0")}:00`).toISOString();
const reading = (isoDate, hour, value) => ({ timestamp: at(isoDate, hour), value });

// 1. dayKey usa o dia local, não o dia UTC.
assert.equal(dayKey(at("2026-09-15", 23)), "2026-09-15");
assert.equal(dayKey(at("2026-09-15", 0)), "2026-09-15");
assert.equal(dayKey("não é data"), "");

// 2. O filtro de data manda; "até" inclui o dia inteiro.
let range = bounds({ days: 30, from: "2026-09-10", to: "2026-09-12" });
assert.equal(range.start, new Date(2026, 8, 10).getTime());
assert.equal(range.end, new Date(2026, 8, 12).getTime() + DAY - 1);

const readings = [
  reading("2026-09-09", 8, 150),
  reading("2026-09-10", 8, 100),
  reading("2026-09-12", 23, 120),
  reading("2026-09-13", 8, 200)
];
assert.deepEqual(filterByRange(readings, range).map((entry) => entry.value), [100, 120]);

// 3. Só uma das pontas também recorta.
assert.deepEqual(
  filterByRange(readings, bounds({ days: 30, from: "2026-09-12", to: "" })).map((entry) => entry.value),
  [120, 200]
);
assert.deepEqual(
  filterByRange(readings, bounds({ days: 30, from: "", to: "2026-09-10" })).map((entry) => entry.value),
  [150, 100]
);

// 4. Sem datas vale a janela móvel; days === 0 é "tudo".
const now = new Date(2026, 8, 15, 12).getTime();
assert.equal(bounds({ days: 7, from: "", to: "" }, now).start, now - 7 * DAY);
assert.equal(bounds({ days: 0, from: "", to: "" }, now).start, -Infinity);
assert.equal(bounds({ days: 0, from: "", to: "" }, now).end, Infinity);

// 5. O período anterior tem a mesma duração e termina onde o atual começa.
const week = bounds({ days: 7, from: "", to: "" }, now);
const before = previousBounds(week, now);
assert.equal(before.end, week.start - 1);
assert.equal(before.start, week.start - 7 * DAY);
// "Tudo" e uma data inicial aberta não têm com o que comparar.
assert.equal(previousBounds(bounds({ days: 0, from: "", to: "" }, now), now), null);
assert.equal(previousBounds(bounds({ days: 30, from: "", to: "2026-09-10" }), now), null);

// 6. Médias.
assert.equal(average([100, 200]), 150);
assert.equal(average([]), null);
assert.deepEqual(dailyAverages([reading("2026-09-10", 8, 100), reading("2026-09-10", 20, 200)]), [
  { day: "2026-09-10", value: 150, count: 2 }
]);

// 7. Dias cobertos: nunca zero, para não dividir por zero na média por dia.
assert.equal(daySpan(bounds({ days: 7, from: "", to: "" }, now), readings, now), 7);
assert.equal(daySpan(bounds({ days: 30, from: "2026-09-15", to: "2026-09-15" }), readings, now), 1);
assert.equal(daySpan(bounds({ days: 0, from: "", to: "" }, now), [], now), 0);

// 8. Até o limite, cada leitura é um ponto.
let series = trendSeries(readings, 14);
assert.equal(series.mode, "leituras");
assert.equal(series.points.length, 4);
assert.deepEqual(series.points.map((point) => point.value), [150, 100, 120, 200], "ordem cronológica");

// 9. Acima do limite e com vários dias, vira uma média por dia.
const muitas = [];
for (let dia = 1; dia <= 10; dia += 1) {
  const iso = `2026-09-${String(dia).padStart(2, "0")}`;
  muitas.push(reading(iso, 8, 100), reading(iso, 20, 200));
}
series = trendSeries(muitas, 14);
assert.equal(series.mode, "dias");
assert.equal(series.points.length, 10);
assert.equal(series.points[0].value, 150);
assert.equal(series.points[0].count, 2);
assert.equal(series.points[0].daily, true);

// 10. Muitas leituras num dia só continuam ponto a ponto: 1 ou 2 dias não formam linha.
series = trendSeries(
  Array.from({ length: 20 }, (unused, index) => reading("2026-09-10", index, 120)),
  14
);
assert.equal(series.mode, "leituras");
assert.equal(series.points.length, 20);

console.log("Painel: contas de período, médias diárias e comparação conferidas.");
