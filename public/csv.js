// Leitura de exportações de outros apps (Glic e similares).
// Roda no navegador e no Node, para poder ser testado sem tela.
(function (root) {
  "use strict";

  function stripAccents(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  // Separador: o que aparecer mais no cabeçalho, entre ; \t e ,
  function detectDelimiter(firstLine) {
    var counts = [";", "\t", ","].map(function (candidate) {
      return { candidate: candidate, count: firstLine.split(candidate).length };
    });
    counts.sort(function (a, b) { return b.count - a.count; });
    return counts[0].count > 1 ? counts[0].candidate : ";";
  }

  function parseCsv(text) {
    var clean = String(text || "").replace(/^﻿/, "");
    if (!clean.trim()) return [];

    var delimiter = detectDelimiter(clean.split(/\r?\n/)[0]);
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < clean.length; i += 1) {
      var char = clean[i];

      if (inQuotes) {
        if (char === '"') {
          if (clean[i + 1] === '"') { field += '"'; i += 1; }
          else inQuotes = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') { inQuotes = true; continue; }
      if (char === delimiter) { row.push(field); field = ""; continue; }
      if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
        continue;
      }
      field += char;
    }

    row.push(field.replace(/\r$/, ""));
    rows.push(row);
    return rows.filter(function (entry) {
      return entry.some(function (cell) { return String(cell).trim() !== ""; });
    });
  }

  var COLUMN_HINTS = {
    date: ["data", "data hora", "datahora", "date", "dia", "data e hora", "timestamp", "quando"],
    time: ["hora", "horario", "time", "hora medicao"],
    glucose: ["glicemia", "glicose", "glucose", "valor", "resultado", "medicao", "mg/dl", "glicemia (mg/dl)"],
    carbs: ["carboidrato", "carboidratos", "carbo", "carbs", "cho", "gramas de carboidrato"],
    note: ["observacao", "observacoes", "nota", "notas", "comentario", "anotacao", "note"]
  };

  function detectColumns(header) {
    var normalized = header.map(stripAccents);
    var found = {};

    Object.keys(COLUMN_HINTS).forEach(function (key) {
      found[key] = -1;
      // Primeiro procura igualdade exata, depois "contém" — evita que "data"
      // case com "data de cadastro" quando existe uma coluna "data" de verdade.
      COLUMN_HINTS[key].forEach(function (hint) {
        if (found[key] === -1) found[key] = normalized.indexOf(hint);
      });
      if (found[key] === -1) {
        COLUMN_HINTS[key].forEach(function (hint) {
          if (found[key] !== -1) return;
          normalized.forEach(function (column, index) {
            if (found[key] === -1 && column.indexOf(hint) !== -1) found[key] = index;
          });
        });
      }
    });

    return found;
  }

  // Aceita "15/09/2026 14:30", "2026-09-15T14:30", "15-09-2026 14:30:00".
  function parseDateTime(dateText, timeText) {
    var raw = String(dateText || "").trim();
    var time = String(timeText || "").trim();
    if (!raw) return null;

    var combined = time && !/\d{1,2}:\d{2}/.test(raw) ? raw + " " + time : raw;
    var br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(combined);

    if (br) {
      var date = new Date(
        Number(br[3]), Number(br[2]) - 1, Number(br[1]),
        Number(br[4] || 0), Number(br[5] || 0), Number(br[6] || 0)
      );
      return Number.isNaN(date.getTime()) ? null : date;
    }

    var iso = new Date(combined.replace(" ", "T"));
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  function parseNumber(value) {
    var text = String(value || "").trim().replace(/\s/g, "");
    if (!text) return null;
    // "1.234,5" -> "1234.5"; "123,4" -> "123.4"
    if (text.indexOf(",") !== -1) text = text.replace(/\./g, "").replace(",", ".");
    var digits = text.replace(/[^\d.-]/g, "");
    // Sem nenhum dígito não há número: "—", "n/a" e "-" não podem virar zero.
    if (!/\d/.test(digits)) return null;
    var number = Number(digits);
    return Number.isFinite(number) ? number : null;
  }

  // Devolve leituras e carboidratos reconhecidos, além do que foi ignorado.
  function extractEntries(rows) {
    if (rows.length < 2) return { columns: {}, header: rows[0] || [], readings: [], carbs: [], skipped: 0 };

    var header = rows[0];
    var columns = detectColumns(header);
    var readings = [];
    var carbs = [];
    var skipped = 0;

    rows.slice(1).forEach(function (row) {
      var when = columns.date === -1 ? null : parseDateTime(row[columns.date], columns.time === -1 ? "" : row[columns.time]);
      if (!when) { skipped += 1; return; }

      var note = columns.note === -1 ? "" : String(row[columns.note] || "").trim().slice(0, 160);
      var glucose = columns.glucose === -1 ? null : parseNumber(row[columns.glucose]);
      var carbValue = columns.carbs === -1 ? null : parseNumber(row[columns.carbs]);
      var used = false;

      if (glucose !== null && glucose > 0 && glucose <= 999) {
        readings.push({ value: glucose, timestamp: when.toISOString(), note: note });
        used = true;
      }
      if (carbValue !== null && carbValue > 0 && carbValue <= 999) {
        carbs.push({ grams: carbValue, timestamp: when.toISOString(), note: note });
        used = true;
      }
      if (!used) skipped += 1;
    });

    return { columns: columns, header: header, readings: readings, carbs: carbs, skipped: skipped };
  }

  root.DiaryCsv = {
    parseCsv: parseCsv,
    detectColumns: detectColumns,
    parseDateTime: parseDateTime,
    parseNumber: parseNumber,
    extractEntries: extractEntries
  };
}(typeof globalThis !== "undefined" ? globalThis : window));
