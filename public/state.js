// Forma e validação dos dados do diário, num só lugar: o que vem do
// localStorage e o que vem de um arquivo de backup passam pelas mesmas regras.
// Arquivo é fronteira de confiança — nada entra sem ser conferido item a item.
// Roda no navegador e no Node, para poder ser testado sem tela.
(function (root) {
  "use strict";

  var BACKUP_APP = "diario-aloncinho";
  var BACKUP_VERSION = 1;

  // Tetos para um arquivo grande não travar a tela nem estourar o localStorage.
  var MAX_READINGS = 20000;
  var MAX_MEALS = 20000;
  var MAX_ITEMS = 40;

  var mealLabels = {
    cafe: "Café",
    almoco: "Almoço",
    lanche: "Lanche",
    jantar: "Jantar"
  };

  var sourceLabels = {
    descricao: "Descrição",
    rotulo: "Rótulo",
    foto: "Foto local",
    ia: "Estimativa por IA",
    tabela: "Tabela de alimentos"
  };

  function entryId(prefix) {
    if (root.crypto && root.crypto.randomUUID) {
      return prefix + "-" + root.crypto.randomUUID();
    }
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function text(value, limit) {
    return typeof value === "string" ? value.trim().slice(0, limit) : "";
  }

  function isoOrEmpty(value) {
    var date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
  }

  function keyOf(labels, value, fallback) {
    return Object.prototype.hasOwnProperty.call(labels, value) ? value : fallback;
  }

  // Mesma forma que normalizeState produz: campo faltando aqui virava a string
  // "undefined" dentro dos inputs de bolus e basal num navegador novo.
  function blankState() {
    return {
      readings: [],
      meals: [],
      medicalOrientation: { text: "", updatedAt: "" },
      parameters: { rows: [], bolus: "", basal: "", note: "" },
      favorites: [],
      templates: []
    };
  }

  // Mesmos limites que o formulário de glicose aplica ao digitar.
  function normalizeReadings(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (reading) {
        if (!reading) return null;
        var amount = Number(reading.value);
        var timestamp = isoOrEmpty(reading.timestamp);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 999 || !timestamp) return null;
        return {
          id: text(reading.id, 80) || entryId("glicose"),
          value: amount,
          unit: "mg/dL",
          timestamp: timestamp,
          source: reading.source === "cgm" ? "cgm" : "manual",
          note: text(reading.note, 160)
        };
      })
      .filter(Boolean)
      .slice(0, MAX_READINGS);
  }

  function normalizeItems(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (item) {
        if (!item) return null;
        var name = text(item.name, 80);
        var min = Number(item.min);
        var max = Number(item.max);
        if (!name || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return null;
        return {
          id: text(item.id, 80) || entryId("item"),
          name: name,
          min: min,
          max: max,
          source: keyOf(sourceLabels, item.source, "descricao")
        };
      })
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  }

  // Refeição sem nenhum item válido não tem o que mostrar nem somar: sai fora.
  function normalizeMeals(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (meal) {
        if (!meal) return null;
        var recordedAt = isoOrEmpty(meal.recordedAt);
        var items = normalizeItems(meal.items);
        if (!recordedAt || !items.length) return null;
        return {
          id: text(meal.id, 80) || entryId("refeicao"),
          category: keyOf(mealLabels, meal.category, "cafe"),
          recordedAt: recordedAt,
          note: text(meal.note, 160),
          items: items
        };
      })
      .filter(Boolean)
      .slice(0, MAX_MEALS);
  }

  function normalizeOrientation(value) {
    var content = value && typeof value.text === "string" ? value.text.slice(0, 2000) : "";
    return {
      text: content,
      updatedAt: value && typeof value.updatedAt === "string" ? value.updatedAt : ""
    };
  }

  function normalizeParameters(value) {
    var rows = value && Array.isArray(value.rows) ? value.rows : [];
    return {
      rows: rows.slice(0, 12).map(function (row) {
        var start = Number(row && row.start);
        return {
          start: Number.isInteger(start) && start >= 0 && start <= 23 ? start : 0,
          correction: text(row && row.correction, 12),
          ratio: text(row && row.ratio, 12)
        };
      }).sort(function (a, b) { return a.start - b.start; }),
      bolus: text(value && value.bolus, 80),
      basal: text(value && value.basal, 200),
      note: text(value && value.note, 200)
    };
  }

  // Guarda o NOME da medida, não o índice: a tabela de alimentos pode mudar.
  function normalizeFavorites(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(function (item) {
        return item && typeof item.food === "string" && typeof item.measure === "string" &&
          Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0;
      })
      .map(function (item) {
        var uses = Number(item.uses);
        return {
          food: item.food.slice(0, 120),
          measure: item.measure.slice(0, 60),
          quantity: Number(item.quantity),
          uses: Number.isFinite(uses) && uses > 0 ? Math.floor(uses) : 1
        };
      })
      .sort(function (a, b) { return b.uses - a.uses; })
      .slice(0, 12);
  }

  // Refeição padrão: combinação nomeada, mais o histórico de uso.
  function normalizeTemplates(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (template) {
        if (!template) return null;
        var name = text(template.name, 80);
        var items = normalizeItems(template.items).map(function (item) {
          // O item da padrão não carrega id: ganha um novo a cada uso.
          return { name: item.name, min: item.min, max: item.max, source: item.source };
        });
        if (!name || !items.length) return null;
        var uses = Number(template.uses);
        return {
          id: text(template.id, 80) || entryId("padrao"),
          name: name,
          category: keyOf(mealLabels, template.category, "cafe"),
          createdAt: typeof template.createdAt === "string" ? template.createdAt : "",
          lastUsedAt: typeof template.lastUsedAt === "string" ? template.lastUsedAt : "",
          uses: Number.isFinite(uses) && uses > 0 ? Math.floor(uses) : 0,
          items: items
        };
      })
      .filter(Boolean)
      .slice(0, 24);
  }

  function normalizeState(value) {
    if (!value || typeof value !== "object") return blankState();
    return {
      readings: normalizeReadings(value.readings),
      meals: normalizeMeals(value.meals),
      medicalOrientation: normalizeOrientation(value.medicalOrientation),
      parameters: normalizeParameters(value.parameters),
      favorites: normalizeFavorites(value.favorites),
      templates: normalizeTemplates(value.templates)
    };
  }

  function counts(state) {
    return {
      readings: state.readings.length,
      meals: state.meals.length,
      templates: state.templates.length,
      favorites: state.favorites.length,
      parameterRows: state.parameters.rows.length,
      hasOrientation: Boolean(state.medicalOrientation.text)
    };
  }

  function makeBackup(state, savedAt) {
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      savedAt: savedAt || new Date().toISOString(),
      state: normalizeState(state)
    };
  }

  // Aceita o arquivo de backup e também um estado cru, para quem tiver copiado
  // o conteúdo do localStorage na mão antes desta tela existir.
  function readBackup(content) {
    var parsed;
    try {
      parsed = JSON.parse(String(content || ""));
    } catch (error) {
      return { ok: false, error: "Este arquivo não é um backup do diário: não consegui ler o conteúdo." };
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Este arquivo não é um backup do diário." };
    }

    var raw = parsed.state && typeof parsed.state === "object" ? parsed.state : parsed;
    if (parsed.app && parsed.app !== BACKUP_APP) {
      return { ok: false, error: "Este backup é de outro aplicativo." };
    }
    if (!Array.isArray(raw.readings) && !Array.isArray(raw.meals)) {
      return { ok: false, error: "Não encontrei medições nem refeições neste arquivo." };
    }

    var state = normalizeState(raw);
    return {
      ok: true,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      state: state,
      counts: counts(state),
      // O que veio no arquivo mas não passou na conferência.
      discarded: {
        readings: Math.max(0, (Array.isArray(raw.readings) ? raw.readings.length : 0) - state.readings.length),
        meals: Math.max(0, (Array.isArray(raw.meals) ? raw.meals.length : 0) - state.meals.length)
      }
    };
  }

  root.DiaryState = {
    mealLabels: mealLabels,
    sourceLabels: sourceLabels,
    entryId: entryId,
    blankState: blankState,
    normalizeReadings: normalizeReadings,
    normalizeMeals: normalizeMeals,
    normalizeParameters: normalizeParameters,
    normalizeFavorites: normalizeFavorites,
    normalizeTemplates: normalizeTemplates,
    normalizeState: normalizeState,
    counts: counts,
    makeBackup: makeBackup,
    readBackup: readBackup
  };
}(typeof globalThis !== "undefined" ? globalThis : this));
