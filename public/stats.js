// Contas do painel de acompanhamento: recorte por período, médias diárias e
// comparação com o período anterior. Nenhum cálculo de dose acontece aqui.
// Roda no navegador e no Node, para poder ser testado sem tela.
(function (root) {
  "use strict";

  var DAY = 86400000;

  // "AAAA-MM-DD" no fuso local — o mesmo formato que <input type="date"> usa.
  function dayKey(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  }

  function startOfDay(isoDate) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
    if (!parts) return null;
    var date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  function endOfDay(isoDate) {
    var start = startOfDay(isoDate);
    return start === null ? null : start + DAY - 1;
  }

  // As datas escolhidas mandam no recorte. Sem elas vale a janela móvel em dias,
  // onde days === 0 significa "tudo".
  function bounds(period, now) {
    var reference = Number.isFinite(now) ? now : Date.now();
    var from = startOfDay(period && period.from);
    var to = endOfDay(period && period.to);

    if (from !== null || to !== null) {
      return {
        start: from === null ? -Infinity : from,
        end: to === null ? Infinity : to
      };
    }

    var days = Number(period && period.days);
    if (!Number.isFinite(days) || days <= 0) return { start: -Infinity, end: Infinity };
    return { start: reference - days * DAY, end: Infinity };
  }

  // Só há período anterior quando o recorte tem começo e fim conhecidos:
  // em "tudo" ou numa data inicial aberta não existe com o que comparar.
  function previousBounds(range, now) {
    var reference = Number.isFinite(now) ? now : Date.now();
    if (!range || !Number.isFinite(range.start)) return null;
    var end = Number.isFinite(range.end) ? Math.min(range.end, reference) : reference;
    var span = end - range.start;
    if (span <= 0) return null;
    return { start: range.start - span, end: range.start - 1 };
  }

  function inRange(value, range) {
    var time = new Date(value).getTime();
    return !Number.isNaN(time) && time >= range.start && time <= range.end;
  }

  function filterByRange(entries, range, field) {
    var key = field || "timestamp";
    return (entries || []).filter(function (entry) {
      return entry && inRange(entry[key], range);
    });
  }

  function average(values) {
    if (!values || !values.length) return null;
    var sum = values.reduce(function (total, value) { return total + Number(value); }, 0);
    return sum / values.length;
  }

  // Quantos dias o recorte cobre, para médias por dia. Recorte aberto usa o
  // intervalo entre a primeira e a última medição que existe nele.
  function daySpan(range, entries, now) {
    var reference = Number.isFinite(now) ? now : Date.now();
    var start = range && Number.isFinite(range.start) ? range.start : null;
    var end = range && Number.isFinite(range.end) ? Math.min(range.end, reference) : reference;

    if (start === null) {
      var times = (entries || []).map(function (entry) {
        return new Date(entry.timestamp).getTime();
      }).filter(function (time) { return !Number.isNaN(time); });
      if (!times.length) return 0;
      start = Math.min.apply(null, times);
      end = Math.max.apply(null, times);
    }

    return Math.max(1, Math.round((end - start) / DAY) || 1);
  }

  // Média por dia, do dia mais antigo para o mais novo.
  function dailyAverages(readings) {
    var days = new Map();
    (readings || []).forEach(function (reading) {
      var key = dayKey(reading && reading.timestamp);
      var value = Number(reading && reading.value);
      if (!key || !Number.isFinite(value)) return;
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(value);
    });

    return Array.from(days.keys()).sort().map(function (key) {
      var values = days.get(key);
      return { day: key, value: Math.round(average(values)), count: values.length };
    });
  }

  // Poucas leituras: cada uma vira um ponto. Muitas, espalhadas por vários dias:
  // uma média por dia, que é o que mostra andamento sem virar um borrão de pontos.
  function trendSeries(readings, maxPoints) {
    var limit = Number.isFinite(maxPoints) && maxPoints > 0 ? maxPoints : 14;
    var ordered = (readings || []).slice().sort(function (a, b) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
    var daily = dailyAverages(ordered);

    if (ordered.length <= limit || daily.length < 3) {
      return {
        mode: "leituras",
        points: ordered.map(function (reading) {
          return {
            value: Number(reading.value),
            timestamp: reading.timestamp,
            count: 1,
            daily: false
          };
        })
      };
    }

    return {
      mode: "dias",
      points: daily.map(function (day) {
        return {
          value: day.value,
          timestamp: day.day + "T12:00",
          count: day.count,
          daily: true
        };
      })
    };
  }

  root.DiaryStats = {
    dayKey: dayKey,
    startOfDay: startOfDay,
    endOfDay: endOfDay,
    bounds: bounds,
    previousBounds: previousBounds,
    filterByRange: filterByRange,
    average: average,
    daySpan: daySpan,
    dailyAverages: dailyAverages,
    trendSeries: trendSeries
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
