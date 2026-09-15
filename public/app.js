(function () {
  "use strict";

  var STORAGE_KEY = "diario-aloncinho-v1";
  var TOKEN_KEY = "diario-aloncinho-token";
  var PERIOD_KEY = "diario-aloncinho-periodo";
  var selectedCategory = "cafe";
  // days === 0 é "tudo"; from/to são "AAAA-MM-DD" e, quando preenchidos, mandam.
  var period = { days: 30, from: "", to: "" };
  var pendingItems = [];
  var previewUrl = "";
  var selectedPhoto = null;
  var latestEstimate = null;
  var toastTimer = 0;
  var webMcpController = null;

  // A forma dos dados e as regras de conferência vivem em state.js, para o
  // localStorage e o arquivo de backup entrarem pelo mesmo caminho.
  var diaryState = window.DiaryState;
  var mealLabels = diaryState.mealLabels;
  var sourceLabels = diaryState.sourceLabels;
  var entryId = diaryState.entryId;
  var blankState = diaryState.blankState;
  var normalizeFavorites = diaryState.normalizeFavorites;
  var normalizeParameters = diaryState.normalizeParameters;
  var normalizeTemplates = diaryState.normalizeTemplates;

  // Carboidratos (g) por medida caseira — valores de referência de contagem.
  // Porções variam; o rótulo do produto, quando existe, é sempre mais exato.
  var foods = [
    { name: "Arroz branco cozido", measures: [["colher de sopa cheia", 6], ["escumadeira", 28], ["xícara (chá)", 40]] },
    { name: "Arroz integral cozido", measures: [["colher de sopa cheia", 6], ["escumadeira", 26]] },
    { name: "Feijão cozido (grão e caldo)", measures: [["concha média", 14], ["colher de sopa", 5]] },
    { name: "Macarrão cozido", measures: [["pegador", 28], ["colher de sopa", 7], ["prato raso", 55]] },
    { name: "Batata cozida", measures: [["unidade média", 17], ["colher de sopa", 5]] },
    { name: "Purê de batata", measures: [["colher de sopa", 6]] },
    { name: "Batata frita", measures: [["porção pequena", 30], ["colher de sopa", 7]] },
    { name: "Mandioca (aipim) cozida", measures: [["pedaço médio", 20], ["colher de sopa", 7]] },
    { name: "Farofa", measures: [["colher de sopa", 10]] },
    { name: "Polenta cozida", measures: [["fatia média", 14]] },
    { name: "Pão francês", measures: [["unidade", 28], ["metade", 14]] },
    { name: "Pão de forma", measures: [["fatia", 13]] },
    { name: "Pão integral", measures: [["fatia", 12]] },
    { name: "Pão de queijo", measures: [["unidade pequena", 12], ["unidade grande", 24]] },
    { name: "Tapioca", measures: [["unidade média", 30]] },
    { name: "Cuscuz de milho", measures: [["fatia média", 25]] },
    { name: "Torrada", measures: [["unidade", 6]] },
    { name: "Biscoito água e sal", measures: [["unidade", 4]] },
    { name: "Biscoito recheado", measures: [["unidade", 10]] },
    { name: "Bolo simples", measures: [["fatia média", 30]] },
    { name: "Aveia em flocos", measures: [["colher de sopa", 9]] },
    { name: "Granola", measures: [["colher de sopa", 10]] },
    { name: "Cereal matinal", measures: [["xícara (chá)", 24]] },
    { name: "Leite integral", measures: [["copo (200 ml)", 9], ["xícara (chá)", 9]] },
    { name: "Leite desnatado", measures: [["copo (200 ml)", 10]] },
    { name: "Iogurte natural", measures: [["pote (170 g)", 9]] },
    { name: "Iogurte de frutas", measures: [["pote (170 g)", 20]] },
    { name: "Achocolatado em pó", measures: [["colher de sopa", 12]] },
    { name: "Queijo (mussarela, prato)", measures: [["fatia", 1]] },
    { name: "Requeijão", measures: [["colher de sopa", 2]] },
    { name: "Manteiga", measures: [["ponta de faca", 0]] },
    { name: "Ovo", measures: [["unidade", 0]] },
    { name: "Carne, frango ou peixe grelhado", measures: [["porção", 0]] },
    { name: "Presunto ou peito de peru", measures: [["fatia", 0]] },
    { name: "Banana", measures: [["unidade média", 26], ["unidade pequena", 18]] },
    { name: "Maçã", measures: [["unidade média", 20]] },
    { name: "Laranja", measures: [["unidade média", 15]] },
    { name: "Mamão", measures: [["fatia média", 15]] },
    { name: "Melancia", measures: [["fatia média", 15]] },
    { name: "Melão", measures: [["fatia média", 12]] },
    { name: "Uva", measures: [["10 unidades", 15]] },
    { name: "Manga", measures: [["unidade pequena", 25]] },
    { name: "Abacaxi", measures: [["fatia média", 12]] },
    { name: "Morango", measures: [["xícara (chá)", 11]] },
    { name: "Pera", measures: [["unidade média", 21]] },
    { name: "Suco de laranja natural", measures: [["copo (200 ml)", 20]] },
    { name: "Suco de caixinha", measures: [["copo (200 ml)", 22]] },
    { name: "Refrigerante comum", measures: [["copo (200 ml)", 21], ["lata (350 ml)", 37]] },
    { name: "Refrigerante zero", measures: [["copo (200 ml)", 0]] },
    { name: "Café sem açúcar", measures: [["xícara", 0]] },
    { name: "Açúcar", measures: [["colher de chá", 5], ["colher de sopa", 12]] },
    { name: "Mel", measures: [["colher de sopa", 17]] },
    { name: "Chocolate ao leite", measures: [["barra pequena (25 g)", 14]] },
    { name: "Sorvete", measures: [["bola", 15]] },
    { name: "Pudim", measures: [["fatia média", 30]] },
    { name: "Pizza", measures: [["fatia", 30]] },
    { name: "Lasanha", measures: [["pedaço médio", 30]] },
    { name: "Salgado assado", measures: [["unidade", 25]] },
    { name: "Coxinha", measures: [["unidade", 20]] },
    { name: "Pipoca", measures: [["xícara (chá)", 6]] },
    { name: "Salada de folhas", measures: [["prato", 2]] },
    { name: "Tomate", measures: [["unidade média", 3]] },
    { name: "Cenoura cozida", measures: [["colher de sopa", 2]] },
    { name: "Abobrinha ou chuchu cozido", measures: [["colher de sopa", 2]] },
    { name: "Milho verde", measures: [["colher de sopa", 5]] },
    { name: "Ervilha", measures: [["colher de sopa", 4]] },
    { name: "Feijoada", measures: [["concha média", 15]] },
    { name: "Strogonoff", measures: [["colher de sopa", 3]] }
  ];

  var state = loadState();

  var glucoseForm = document.getElementById("glucose-form");
  var itemForm = document.getElementById("item-form");
  var glucoseValue = document.getElementById("glucose-value");
  var glucoseTime = document.getElementById("glucose-time");
  var glucoseSource = document.getElementById("glucose-source");
  var glucoseNote = document.getElementById("glucose-note");
  var itemName = document.getElementById("item-name");
  var itemMin = document.getElementById("item-min");
  var itemMax = document.getElementById("item-max");
  var itemSource = document.getElementById("item-source");
  var mealNote = document.getElementById("meal-note");
  var aiEstimateForm = document.getElementById("ai-estimate-form");
  var estimateDescription = document.getElementById("estimate-description");
  var estimatePortion = document.getElementById("estimate-portion");
  var estimateAccessToken = document.getElementById("estimate-access-token");
  var rememberAccessToken = document.getElementById("remember-access-token");
  var estimateConsent = document.getElementById("estimate-consent");
  var estimateSubmit = document.getElementById("estimate-submit");
  var estimateStatus = document.getElementById("estimate-status");
  var estimateResult = document.getElementById("estimate-result");
  var estimateResultContent = document.getElementById("estimate-result-content");
  var addEstimateItems = document.getElementById("add-estimate-items");
  var mealPhoto = document.getElementById("meal-photo");
  var mealCamera = document.getElementById("meal-camera");
  var takePhoto = document.getElementById("take-photo");
  var pickPhoto = document.getElementById("pick-photo");
  var photoPreview = document.getElementById("photo-preview");
  var photoThumb = document.getElementById("photo-thumb");
  var photoThumbImage = document.getElementById("photo-thumb-image");
  var periodFrom = document.getElementById("period-from");
  var periodTo = document.getElementById("period-to");
  var clearDateFilter = document.getElementById("clear-date-filter");
  var medicalOrientationForm = document.getElementById("medical-orientation-form");
  var medicalOrientationInput = document.getElementById("medical-orientation-input");
  var medicalOrientationDisplay = document.getElementById("medical-orientation-display");
  var medicalOrientationDate = document.getElementById("medical-orientation-date");
  var foodTableForm = document.getElementById("food-table-form");
  var foodSearch = document.getElementById("food-search");
  var foodOptions = document.getElementById("food-options");
  var foodMeasure = document.getElementById("food-measure");
  var foodQuantity = document.getElementById("food-quantity");
  var foodCarbs = document.getElementById("food-carbs");
  var dataDialog = document.getElementById("data-dialog");
  var assistantToolsConsent = document.getElementById("assistant-tools-consent");

  function loadState() {
    try {
      return diaryState.normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (error) {
      return blankState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function classify(value) {
    if (value < 80) return "below";
    if (value <= 190) return "range";
    return "above";
  }

  function statusText(status) {
    if (status === "below") return "Abaixo";
    if (status === "above") return "Acima";
    return "Na faixa";
  }

  function addGlucoseReading(input) {
    var value = Number(input && input.value);
    var timestamp = input && input.timestamp;
    var source = input && input.source;
    var note = input && typeof input.note === "string" ? input.note.trim() : "";

    if (!Number.isFinite(value) || value <= 0 || value > 999) {
      throw new Error("Informe uma medição válida em mg/dL.");
    }
    if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
      throw new Error("Informe uma data e hora válidas.");
    }
    if (source !== "manual" && source !== "cgm") {
      throw new Error("Informe a origem da medição.");
    }

    var reading = {
      id: entryId("glicose"),
      value: value,
      unit: "mg/dL",
      timestamp: new Date(timestamp).toISOString(),
      source: source,
      note: note
    };

    state.readings.push(reading);
    saveState();
    renderDashboard();
    return reading;
  }

  function saveMedicalOrientation(text) {
    var normalized = typeof text === "string" ? text.trim() : "";
    if (normalized.length > 2000) {
      throw new Error("A orientação pode ter no máximo 2.000 caracteres.");
    }
    state.medicalOrientation = {
      text: normalized,
      updatedAt: normalized ? new Date().toISOString() : ""
    };
    saveState();
    renderMedicalOrientation();
  }

  function addMealRecord(input) {
    var category = input && input.category;
    var note = input && typeof input.note === "string" ? input.note.trim() : "";
    var items = input && Array.isArray(input.items) ? input.items : [];

    if (!Object.prototype.hasOwnProperty.call(mealLabels, category)) {
      throw new Error("Escolha café, almoço, lanche ou jantar.");
    }
    if (!items.length) {
      throw new Error("Adicione ao menos um item à refeição.");
    }

    var normalizedItems = items.map(function (item) {
      var min = Number(item && item.min);
      var max = Number(item && item.max);
      if (!item || typeof item.name !== "string" || !item.name.trim() ||
          !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
        throw new Error("Cada item precisa de um nome e uma faixa válida de carboidratos.");
      }
      if (!Object.prototype.hasOwnProperty.call(sourceLabels, item.source)) {
        throw new Error("Cada item precisa ter uma origem válida.");
      }
      return {
        id: entryId("item"),
        name: item.name.trim(),
        min: min,
        max: max,
        source: item.source
      };
    });

    var meal = {
      id: entryId("refeicao"),
      category: category,
      recordedAt: new Date().toISOString(),
      note: note,
      items: normalizedItems
    };

    state.meals.push(meal);
    saveState();
    renderMeals();
    renderDashboard(); // o card "Carboidratos hoje" vive no painel
    return meal;
  }

  function removeReading(id) {
    var before = state.readings.length;
    state.readings = state.readings.filter(function (reading) { return reading.id !== id; });
    if (state.readings.length === before) return false;
    saveState();
    renderDashboard();
    return true;
  }

  function removeMeal(id) {
    var before = state.meals.length;
    state.meals = state.meals.filter(function (meal) { return meal.id !== id; });
    if (state.meals.length === before) return false;
    saveState();
    renderMeals();
    renderDashboard();
    return true;
  }

  function getDiarySummary() {
    var readings = validReadings();
    var counts = { below: 0, range: 0, above: 0 };
    readings.forEach(function (reading) {
      counts[classify(Number(reading.value))] += 1;
    });
    return {
      personalRangeMgDl: { lowerInclusive: 80, upperInclusive: 190 },
      validReadingCount: readings.length,
      inRangeReadingCount: counts.range,
      belowRangeReadingCount: counts.below,
      aboveRangeReadingCount: counts.above,
      mealCount: state.meals.length
    };
  }

  function validReadings() {
    return state.readings
      .filter(function (reading) {
        return Number.isFinite(Number(reading.value)) &&
          Number(reading.value) > 0 &&
          reading.unit === "mg/dL" &&
          Boolean(reading.timestamp);
      })
      .sort(function (a, b) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
  }

  function usingDateFilter() {
    return Boolean(period.from || period.to);
  }

  function periodRange() {
    return window.DiaryStats.bounds(period);
  }

  function mealsInPeriod(range) {
    return window.DiaryStats.filterByRange(state.meals, range || periodRange(), "recordedAt");
  }

  function carbsIn(meals) {
    return meals.reduce(function (sum, meal) {
      var totals = mealTotals(Array.isArray(meal.items) ? meal.items : []);
      return sum + carbMidpoint(totals.min, totals.max);
    }, 0);
  }

  // Texto do recorte em uso, para o painel nunca deixar dúvida sobre o que conta.
  function periodLabel() {
    if (usingDateFilter()) {
      if (period.from && period.to) return "De " + formatDay(period.from) + " a " + formatDay(period.to);
      if (period.from) return "A partir de " + formatDay(period.from);
      return "Até " + formatDay(period.to);
    }
    if (!period.days) return "Todo o histórico";
    return "Últimos " + period.days + " dias";
  }

  function relativeTime(value) {
    var minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    var formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
    if (Math.abs(minutes) < 60) return formatter.format(-minutes, "minute");
    if (Math.abs(minutes) < 1440) return formatter.format(-Math.round(minutes / 60), "hour");
    return formatter.format(-Math.round(minutes / 1440), "day");
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sem data";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  // Só o dia: usado nos rótulos do filtro de data e no eixo de médias diárias.
  function formatDay(value) {
    var date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
      ? new Date(value + "T12:00")
      : new Date(value);
    if (Number.isNaN(date.getTime())) return "sem data";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
  }

  function localDateTimeValue(date) {
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatGrams(value) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(numeric) + " g";
  }

  function mealTotals(items) {
    return items.reduce(function (totals, item) {
      totals.min += Number(item.min) || 0;
      totals.max += Number(item.max) || 0;
      return totals;
    }, { min: 0, max: 0 });
  }

  function formatRange(min, max) {
    if (Number(min) === Number(max)) return formatGrams(min);
    return formatGrams(min) + " – " + formatGrams(max);
  }

  // Número único para a contagem: o meio da faixa estimada, arredondado em gramas.
  function carbMidpoint(min, max) {
    var low = Number(min) || 0;
    var high = Number(max) || 0;
    return Math.round((low + high) / 2);
  }

  function formatCarbTotal(min, max) {
    if (Number(min) === Number(max)) return formatGrams(min);
    return "≈ " + formatGrams(carbMidpoint(min, max));
  }

  function setEstimateStatus(message, isError) {
    estimateStatus.textContent = message || "";
    estimateStatus.classList.toggle("is-error", Boolean(isError));
  }

  function clearEstimateResult() {
    latestEstimate = null;
    estimateResult.hidden = true;
    estimateResultContent.replaceChildren();
    addEstimateItems.disabled = false;
    addEstimateItems.textContent = "Confirmar e adicionar ao diário";
  }

  function clearSelectedPhoto() {
    mealPhoto.value = "";
    mealCamera.value = "";
    selectedPhoto = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    photoThumbImage.removeAttribute("src");
    photoThumb.hidden = true;
    photoPreview.textContent = "Nenhuma foto selecionada.";
  }

  // Câmera e galeria alimentam a mesma foto: quem escolhe uma descarta a outra.
  function selectPhoto(file) {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    selectedPhoto = file;
    previewUrl = URL.createObjectURL(file);
    photoThumbImage.src = previewUrl;
    photoThumb.hidden = false;
    photoPreview.textContent = "Foto pronta. Ela só sai deste aparelho quando você pedir a estimativa.";
    clearEstimateResult();
  }

  function setPhotoControlsEnabled(enabled) {
    takePhoto.disabled = !enabled;
    pickPhoto.disabled = !enabled;
  }

  function applyStoredToken() {
    var stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    estimateAccessToken.value = stored;
    rememberAccessToken.checked = true;
  }

  function rememberTokenChoice() {
    if (rememberAccessToken.checked && estimateAccessToken.value) {
      localStorage.setItem(TOKEN_KEY, estimateAccessToken.value);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  function resetEstimateForm() {
    aiEstimateForm.reset();
    setPhotoControlsEnabled(false);
    clearSelectedPhoto();
    clearEstimateResult();
    setEstimateStatus("", false);
    applyStoredToken();
  }

  function readPhotoAsDataUrl(file) {
    if (!file) return Promise.resolve("");
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      return Promise.reject(new Error("Use uma foto JPEG, PNG ou WebP."));
    }
    if (file.size > 2 * 1024 * 1024) {
      return Promise.reject(new Error("Escolha uma foto de até 2 MB para a estimativa."));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Não foi possível ler esta foto.")); };
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.readAsDataURL(file);
    });
  }

  function normalizeEstimate(payload) {
    if (!payload || !Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 8) {
      throw new Error("A estimativa recebida não está completa. Tente novamente com mais detalhes.");
    }

    var items = payload.items.map(function (item) {
      var name = item && typeof item.name === "string" ? item.name.trim() : "";
      var portion = item && typeof item.portion_description === "string" ? item.portion_description.trim() : "";
      var min = Number(item && item.carbohydrates_min_g);
      var max = Number(item && item.carbohydrates_max_g);
      var confidence = item && typeof item.confidence === "string" ? item.confidence.trim() : "";

      if (!name || name.length > 120 || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min || max > 999) {
        throw new Error("A estimativa recebida não tem uma faixa de carboidratos válida.");
      }

      return {
        name: name,
        portion: portion.slice(0, 220),
        min: min,
        max: max,
        confidence: confidence === "baixa" || confidence === "média" || confidence === "alta" ? confidence : "não informada"
      };
    });

    var assumptions = Array.isArray(payload.assumptions) ? payload.assumptions
      .filter(function (value) { return typeof value === "string" && value.trim(); })
      .map(function (value) { return value.trim().slice(0, 240); })
      .slice(0, 5) : [];
    var clarification = typeof payload.clarification_question === "string" && payload.clarification_question.trim()
      ? payload.clarification_question.trim().slice(0, 240) : "";

    return {
      items: items,
      totals: mealTotals(items),
      assumptions: assumptions,
      clarification: clarification
    };
  }

  function renderEstimate(estimate) {
    var items = estimate.items.map(function (item) {
      var portion = item.portion ? '<small>' + escapeHtml(item.portion) + ' · confiança ' + escapeHtml(item.confidence) + '</small>' :
        '<small>confiança ' + escapeHtml(item.confidence) + '</small>';
      return '<li><div><strong>' + escapeHtml(item.name) + '</strong>' + portion + '</div><b>' + formatRange(item.min, item.max) + '</b></li>';
    }).join("");
    var assumptions = estimate.assumptions.length
      ? '<div class="estimate-assumptions"><strong>Considerações da IA</strong><ul>' + estimate.assumptions.map(function (assumption) {
        return '<li>' + escapeHtml(assumption) + '</li>';
      }).join("") + '</ul></div>' : "";
    var clarification = estimate.clarification
      ? '<p class="estimate-question"><strong>Para refinar:</strong> ' + escapeHtml(estimate.clarification) + '</p>' : "";

    estimateResultContent.innerHTML = '<div class="estimate-result-heading"><div><p class="eyebrow">Estimativa pronta</p><h4>' +
      formatCarbTotal(estimate.totals.min, estimate.totals.max) + ' de carboidratos<small>faixa estimada: ' +
      formatRange(estimate.totals.min, estimate.totals.max) + '</small></h4></div><span>confira antes de registrar</span></div>' +
      '<ul class="estimate-items">' + items + '</ul>' + assumptions + clarification;
    estimateResult.hidden = false;
  }

  async function requestCarbohydrateEstimate() {
    var description = estimateDescription.value.trim();
    var portion = estimatePortion.value.trim();
    var accessToken = estimateAccessToken.value;

    if (!description || !portion) {
      throw new Error("Informe o alimento ou a refeição e a porção que vai consumir.");
    }
    if (!accessToken) {
      throw new Error("A estimativa por IA precisa do código definido em APP_ACCESS_TOKEN no Vercel. Enquanto isso, use a tabela de alimentos acima.");
    }

    // A foto é o único dado que exige autorização explícita; o texto você digitou e enviou.
    var file = estimateConsent.checked ? selectedPhoto : null;
    var imageDataUrl = await readPhotoAsDataUrl(file);
    var response;
    var responseBody;

    try {
      response = await fetch("/api/estimate-carbs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-diary-access-token": accessToken
        },
        body: JSON.stringify({
          description: description,
          portion: portion,
          imageDataUrl: imageDataUrl,
          consent: true
        })
      });
      responseBody = await response.json().catch(function () { return null; });
    } catch (error) {
      throw new Error("Não foi possível falar com o serviço de estimativa. Tente novamente.");
    }

    if (!response.ok) {
      throw new Error(responseBody && typeof responseBody.error === "string"
        ? responseBody.error
        : "A estimativa não ficou disponível agora. Tente novamente.");
    }

    return normalizeEstimate(responseBody && responseBody.estimate);
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  function renderTrend(readings) {
    var chart = document.getElementById("glucose-trend-chart");
    var empty = document.getElementById("trend-empty");
    var summary = document.getElementById("trend-summary");
    var note = document.getElementById("trend-note");
    var series = window.DiaryStats.trendSeries(readings, 14);
    var points = series.points;
    var byDay = series.mode === "dias";
    var labelFor = function (point) { return byDay ? formatDay(point.timestamp) : formatDate(point.timestamp); };

    note.textContent = byDay ? "uma média por dia no período" : "cada medição do período";

    if (points.length < 2) {
      chart.innerHTML = '<title id="trend-chart-title">Tendência de glicose</title><desc id="trend-chart-description">Registre ao menos duas medições para visualizar a tendência.</desc>';
      empty.hidden = false;
      summary.textContent = "O gráfico usa medições registradas e não prevê resultados futuros.";
      return;
    }

    var minMeasured = Math.min.apply(null, points.map(function (point) { return point.value; }));
    var maxMeasured = Math.max.apply(null, points.map(function (point) { return point.value; }));
    var minValue = Math.max(0, Math.floor((Math.min(minMeasured, 80) - 20) / 20) * 20);
    var maxValue = Math.ceil((Math.max(maxMeasured, 190) + 20) / 20) * 20;
    if (maxValue <= minValue) maxValue = minValue + 20;

    var width = 760;
    var height = 260;
    var left = 50;
    var right = 22;
    var top = 20;
    var bottom = 38;
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var xFor = function (index) { return left + (plotWidth * index / (points.length - 1)); };
    var yFor = function (value) { return top + ((maxValue - value) / (maxValue - minValue)) * plotHeight; };
    var rangeTop = yFor(190);
    var rangeBottom = yFor(80);
    var gridValues = [minValue, 80, 190, maxValue].filter(function (value, index, values) {
      return values.indexOf(value) === index;
    });
    var grid = gridValues.map(function (value) {
      var y = yFor(value).toFixed(1);
      return '<line class="trend-grid" x1="' + left + '" y1="' + y + '" x2="' + (width - right) + '" y2="' + y + '"></line>' +
        '<text class="trend-axis" x="' + (left - 9) + '" y="' + (Number(y) + 4) + '" text-anchor="end">' + value + '</text>';
    }).join("");
    var path = points.map(function (point, index) {
      return xFor(index).toFixed(1) + "," + yFor(point.value).toFixed(1);
    }).join(" ");
    // Acima de 40 pontos os círculos viram um borrão: a linha já conta a história.
    var dots = points.length > 40 ? "" : points.map(function (point, index) {
      var detail = point.daily
        ? formatDay(point.timestamp) + ": média de " + point.value + " mg/dL em " +
          point.count + (point.count === 1 ? " medição" : " medições")
        : formatDate(point.timestamp) + ": " + point.value + " mg/dL";
      return '<circle class="trend-dot ' + classify(point.value) + '" cx="' + xFor(index).toFixed(1) + '" cy="' + yFor(point.value).toFixed(1) + '" r="4.5"><title>' + escapeHtml(detail) + '</title></circle>';
    }).join("");
    var firstDate = labelFor(points[0]);
    var lastDate = labelFor(points[points.length - 1]);
    var chartDescription = byDay
      ? "Tendência da média diária de " + points.length + " dias com medições, entre " + firstDate + " e " + lastDate + "."
      : "Tendência de " + points.length + " medições registradas entre " + firstDate + " e " + lastDate + ".";

    chart.innerHTML = '<title id="trend-chart-title">Tendência de glicose</title><desc id="trend-chart-description">' + escapeHtml(chartDescription) + '</desc>' +
      '<rect class="trend-range-band" x="' + left + '" y="' + rangeTop.toFixed(1) + '" width="' + plotWidth + '" height="' + (rangeBottom - rangeTop).toFixed(1) + '"></rect>' +
      grid +
      '<line class="trend-boundary" x1="' + left + '" y1="' + yFor(80).toFixed(1) + '" x2="' + (width - right) + '" y2="' + yFor(80).toFixed(1) + '"></line>' +
      '<line class="trend-boundary" x1="' + left + '" y1="' + yFor(190).toFixed(1) + '" x2="' + (width - right) + '" y2="' + yFor(190).toFixed(1) + '"></line>' +
      '<polyline class="trend-line" points="' + path + '"></polyline>' + dots +
      '<text class="trend-axis" x="' + left + '" y="' + (height - 10) + '">' + escapeHtml(firstDate) + '</text>' +
      '<text class="trend-axis" x="' + (width - right) + '" y="' + (height - 10) + '" text-anchor="end">' + escapeHtml(lastDate) + '</text>';
    empty.hidden = true;
    summary.textContent = (byDay
      ? "Exibe a média diária de " + points.length + " dias com medições em " + periodLabel().toLowerCase() + "."
      : "Exibe " + points.length + " medições salvas em " + periodLabel().toLowerCase() + ".") +
      " A área destacada representa a faixa pessoal do painel: 80–190 mg/dL. O gráfico usa medições registradas e não prevê resultados futuros.";
  }

  function renderMedicalOrientation() {
    var orientation = state.medicalOrientation || { text: "", updatedAt: "" };
    medicalOrientationInput.value = orientation.text || "";
    medicalOrientationDisplay.replaceChildren();

    var paragraph = document.createElement("p");
    paragraph.textContent = orientation.text || "Nenhuma orientação foi salva neste navegador.";
    medicalOrientationDisplay.appendChild(paragraph);
    medicalOrientationDate.textContent = orientation.updatedAt
      ? "Atualizado em " + formatDate(orientation.updatedAt)
      : "";
  }

  function formatHour(hour) {
    return String(hour).padStart(2, "0") + "h00";
  }

  // A faixa vai do próprio início até um minuto antes do início da seguinte.
  function bandLabel(rows, index) {
    var start = rows[index].start;
    var nextStart = rows[(index + 1) % rows.length].start;
    if (rows.length === 1) return "o dia todo";
    return formatHour(start) + " – " + String((nextStart + 23) % 24).padStart(2, "0") + "h59";
  }

  // Última faixa cujo início já passou; antes da primeira, vale a última (vira a noite).
  function activeBandIndex(rows) {
    if (!rows.length) return -1;
    var hour = new Date().getHours();
    var active = -1;
    rows.forEach(function (row, index) {
      if (row.start <= hour) active = index;
    });
    return active === -1 ? rows.length - 1 : active;
  }

  // Faixa vigente, para exibir junto do total de carboidratos sem rolar a página.
  function renderMealParameters() {
    var target = document.getElementById("meal-parameters");
    var rows = (state.parameters || { rows: [] }).rows;
    var active = activeBandIndex(rows);

    if (active === -1) {
      target.innerHTML = '<p class="meal-parameters-empty">Cadastre em “Orientação médica” a tabela que você recebeu para ela aparecer aqui.</p>';
      return;
    }

    var row = rows[active];
    target.innerHTML = '<p class="eyebrow">Sua tabela agora · ' + bandLabel(rows, active) + '</p>' +
      '<div class="meal-parameters-values">' +
      '<div><span>Correção</span><strong>' + (row.correction ? escapeHtml(row.correction) + " mg/dL" : "—") + '</strong></div>' +
      '<div><span>Carb/insulina</span><strong>' + (row.ratio ? escapeHtml(row.ratio) + " g/U" : "—") + '</strong></div>' +
      '</div>';
  }

  function renderParameters() {
    var parameters = state.parameters || { rows: [], note: "" };
    var view = document.getElementById("parameters-view");
    var rows = parameters.rows;

    renderMealParameters();

    if (!rows.length) {
      view.innerHTML = '<div class="empty-state compact"><span aria-hidden="true">◷</span>' +
        '<p>Digite em “Editar os valores” a tabela por faixa de horário que você recebeu.</p></div>';
    } else {
      var active = activeBandIndex(rows);
      var heads = [];
      if (parameters.bolus) heads.push('<div><span>Bolus</span><strong>' + escapeHtml(parameters.bolus) + '</strong></div>');
      if (parameters.basal) heads.push('<div><span>Basal</span><strong>' + escapeHtml(parameters.basal) + '</strong></div>');

      view.innerHTML = (heads.length ? '<div class="parameters-heads">' + heads.join("") + '</div>' : "") +
        '<table class="parameters-table"><thead><tr>' +
        '<th>Faixa de horário</th><th>Fator de correção</th><th>Relação carb/insulina</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (row, index) {
          return '<tr' + (index === active ? ' class="is-now"' : '') + '>' +
            '<td>' + bandLabel(rows, index) +
            (index === active ? ' <span class="now-badge">agora</span>' : '') + '</td>' +
            '<td>' + (row.correction ? escapeHtml(row.correction) + " mg/dL" : '<em class="pending">pendente</em>') + '</td>' +
            '<td>' + (row.ratio ? escapeHtml(row.ratio) + " g/U" : '<em class="pending">pendente</em>') + '</td>' +
            '</tr>';
        }).join("") +
        '</tbody></table>' +
        (parameters.note ? '<p class="parameters-note">' + escapeHtml(parameters.note) + '</p>' : "");
    }

    document.getElementById("parameters-bolus").value = parameters.bolus;
    document.getElementById("parameters-basal").value = parameters.basal;
    document.getElementById("parameters-note").value = parameters.note;
    var editor = document.getElementById("parameters-rows");
    editor.innerHTML = rows.map(function (row, index) {
      var hours = "";
      for (var hour = 0; hour < 24; hour += 1) {
        hours += '<option value="' + hour + '"' + (hour === row.start ? " selected" : "") + ">" + formatHour(hour) + "</option>";
      }
      return '<div class="parameter-row">' +
        '<label><span>Começa às</span><select data-field="start" data-index="' + index + '">' + hours + '</select></label>' +
        '<label><span>Correção (mg/dL)</span><input type="text" inputmode="decimal" maxlength="12" value="' + escapeHtml(row.correction) + '" data-field="correction" data-index="' + index + '" /></label>' +
        '<label><span>Carb/insulina (g/U)</span><input type="text" inputmode="decimal" maxlength="12" value="' + escapeHtml(row.ratio) + '" data-field="ratio" data-index="' + index + '" /></label>' +
        '<button class="row-remove" type="button" data-remove-parameter="' + index + '" title="Remover faixa" aria-label="Remover faixa">×</button>' +
        '</div>';
    }).join("");
  }

  function csvValue(value) {
    var text = String(value === undefined || value === null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadFile(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  // Uma leitura já existente é a mesma data/hora com o mesmo valor.
  function readingKey(timestamp, value) {
    return new Date(timestamp).toISOString().slice(0, 16) + "|" + Number(value);
  }

  function prepareImport(text) {
    var parsed = window.DiaryCsv.extractEntries(window.DiaryCsv.parseCsv(text));
    var existing = new Set(state.readings.map(function (reading) {
      return readingKey(reading.timestamp, reading.value);
    }));

    var newReadings = parsed.readings.filter(function (reading) {
      var key = readingKey(reading.timestamp, reading.value);
      if (existing.has(key)) return false;
      existing.add(key); // duplicatas dentro do próprio arquivo também caem fora
      return true;
    });

    var existingMeals = new Set(state.meals.map(function (meal) {
      return new Date(meal.recordedAt).toISOString().slice(0, 16);
    }));
    var newCarbs = parsed.carbs.filter(function (entry) {
      var key = new Date(entry.timestamp).toISOString().slice(0, 16);
      if (existingMeals.has(key)) return false;
      existingMeals.add(key);
      return true;
    });

    return {
      header: parsed.header,
      skipped: parsed.skipped,
      duplicates: (parsed.readings.length - newReadings.length) + (parsed.carbs.length - newCarbs.length),
      readings: newReadings,
      carbs: newCarbs
    };
  }

  function applyImport(prepared) {
    prepared.readings.forEach(function (reading) {
      state.readings.push({
        id: entryId("glicose"),
        value: reading.value,
        unit: "mg/dL",
        timestamp: reading.timestamp,
        source: "manual",
        note: reading.note
      });
    });

    prepared.carbs.forEach(function (entry) {
      var hour = new Date(entry.timestamp).getHours();
      state.meals.push({
        id: entryId("refeicao"),
        category: mealForHour(hour),
        recordedAt: entry.timestamp,
        note: entry.note || "Importado",
        items: [{
          id: entryId("item"),
          name: "Carboidratos importados",
          min: entry.grams,
          max: entry.grams,
          source: "rotulo"
        }]
      });
    });

    saveState();
    renderAll();
  }

  function exportDataAsCsv() {
    var rows = [["Tipo", "Data e hora (ISO)", "Glicemia", "Unidade", "Origem", "Observação", "Refeição", "Alimento", "Carboidratos mín. (g)", "Carboidratos máx. (g)"]];

    state.readings.forEach(function (reading) {
      rows.push(["Glicemia", reading.timestamp, reading.value, reading.unit, reading.source, reading.note, "", "", "", ""]);
    });
    state.meals.forEach(function (meal) {
      (meal.items || []).forEach(function (item) {
        rows.push(["Carboidrato", meal.recordedAt, "", "", item.source || "", meal.note || "", mealLabels[meal.category] || meal.category, item.name || "", item.min, item.max]);
      });
    });

    var csv = "\ufeff" + rows.map(function (row) {
      return row.map(csvValue).join(";");
    }).join("\r\n");
    downloadFile("diario-aloncinho-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv;charset=utf-8");
    showToast("Planilha baixada.");
  }

  function printableMealRows() {
    if (!state.meals.length) return '<tr><td colspan="4">Nenhuma refeição registrada.</td></tr>';
    return state.meals.slice().sort(function (a, b) {
      return new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime();
    }).map(function (meal) {
      var totals = mealTotals(Array.isArray(meal.items) ? meal.items : []);
      var items = (meal.items || []).map(function (item) {
        return escapeHtml(item.name) + " (" + formatRange(item.min, item.max) + ")";
      }).join("<br>") + "<br><strong>Total " + formatCarbTotal(totals.min, totals.max) + "</strong>";
      return "<tr><td>" + escapeHtml(formatDate(meal.recordedAt)) + "</td><td>" + escapeHtml(mealLabels[meal.category] || meal.category) + "</td><td>" + items + "</td><td>" + escapeHtml(meal.note || "") + "</td></tr>";
    }).join("");
  }

  function printableReadingRows() {
    var readings = validReadings();
    if (!readings.length) return '<tr><td colspan="4">Nenhuma medição registrada.</td></tr>';
    return readings.map(function (reading) {
      var status = statusText(classify(Number(reading.value)));
      return "<tr><td>" + escapeHtml(formatDate(reading.timestamp)) + "</td><td>" + escapeHtml(reading.value) + " mg/dL</td><td>" + escapeHtml(status) + "</td><td>" + escapeHtml(reading.note || "") + "</td></tr>";
    }).join("");
  }

  function printableParameterRows() {
    var parameters = state.parameters || { rows: [], note: "" };
    if (!parameters.rows.length) return '<p class="meta">Nenhuma tabela de referência cadastrada.</p>';
    var heads = [];
    if (parameters.bolus) heads.push("<strong>Bolus:</strong> " + escapeHtml(parameters.bolus));
    if (parameters.basal) heads.push("<strong>Basal:</strong> " + escapeHtml(parameters.basal));

    return (heads.length ? '<p class="meta">' + heads.join(" &nbsp;·&nbsp; ") + "</p>" : "") +
      '<table><thead><tr><th>Faixa de horário</th><th>Fator de correção</th><th>Relação carboidrato/insulina</th></tr></thead><tbody>' +
      parameters.rows.map(function (row, index) {
        return "<tr><td>" + escapeHtml(bandLabel(parameters.rows, index)) + "</td><td>" +
          (row.correction ? escapeHtml(row.correction) + " mg/dL" : "pendente") + "</td><td>" +
          (row.ratio ? escapeHtml(row.ratio) + " g/U" : "pendente") + "</td></tr>";
      }).join("") + "</tbody></table>" +
      (parameters.note ? '<p class="meta">' + escapeHtml(parameters.note) + "</p>" : "");
  }

  function openPdfReport() {
    var reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      showToast("Permita a abertura da nova janela para gerar o relatório.");
      return;
    }
    var summary = getDiarySummary();
    var title = "Relatório do Diário do Aloncinho";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      '@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#0b113a;font-size:12px;line-height:1.45}h1{font-size:22px;margin:0 0 5px}h2{font-size:15px;margin:25px 0 8px;color:#2f6f72}.meta{color:#667090;margin:0}.notice{margin:18px 0;padding:10px 12px;border-left:4px solid #67a1a4;background:#eef5f5}.metrics{display:flex;gap:10px;margin:14px 0}.metric{border:1px solid #dde2ec;padding:9px;min-width:105px}.metric strong{display:block;font-size:18px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #dde2ec;padding:7px;vertical-align:top;text-align:left}th{background:#eef5f5}@media print{body{font-size:11px}.no-print{display:none}}</style></head><body>' +
      '<h1>' + title + '</h1><p class="meta">Gerado em ' + escapeHtml(formatDate(new Date().toISOString())) + '</p>' +
      '<p class="notice">Ferramenta de registro e apoio. Não substitui orientação médica e não realiza cálculo de dose.</p>' +
      '<h2>Resumo da faixa pessoal do dashboard</h2><div class="metrics"><div class="metric"><span>Faixa</span><strong>80–190</strong><small>mg/dL</small></div><div class="metric"><span>Medições na faixa</span><strong>' + (summary.validReadingCount ? Math.round(summary.inRangeReadingCount / summary.validReadingCount * 100) + "%" : "—") + '</strong><small>' + summary.inRangeReadingCount + " de " + summary.validReadingCount + ' leituras</small></div><div class="metric"><span>Refeições</span><strong>' + summary.mealCount + '</strong><small>salvas no diário</small></div></div>' +
      '<h2>Medições de glicose</h2><table><thead><tr><th>Data e hora</th><th>Valor</th><th>Faixa</th><th>Observação</th></tr></thead><tbody>' + printableReadingRows() + '</tbody></table>' +
      '<h2>Carboidratos registrados</h2><table><thead><tr><th>Data e hora</th><th>Refeição</th><th>Itens e faixa estimada</th><th>Observação</th></tr></thead><tbody>' + printableMealRows() + '</tbody></table>' +
      '<h2>Parâmetros de referência</h2><p class="meta">Valores transcritos pelo paciente e apenas exibidos pelo aplicativo. Nenhum cálculo de dose é realizado a partir deles.</p>' + printableParameterRows() +
      '<p class="meta no-print">Use “Salvar como PDF” na janela de impressão para baixar este relatório.</p></body></html>';
    reportWindow.opener = null;
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    window.setTimeout(function () { reportWindow.print(); }, 250);
  }

  function renderToday() {
    document.getElementById("today-label").textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(new Date());
  }

  // Variação contra o período anterior de mesma duração. Só o percentual de
  // medições na faixa ganha cor, porque subir já é o objetivo declarado deste
  // painel. A média aparece sem juízo de valor: o app não interpreta glicemia.
  function renderDelta(element, current, previous, unit, higherIsBetter) {
    if (current === null || previous === null) {
      element.hidden = true;
      return;
    }
    var difference = Math.round(current - previous);
    if (!difference) {
      element.textContent = "igual ao período anterior";
      element.className = "delta steady";
      element.hidden = false;
      return;
    }
    var tone = "neutral";
    if (higherIsBetter !== null) tone = (higherIsBetter ? difference > 0 : difference < 0) ? "better" : "worse";
    element.textContent = (difference > 0 ? "▲ +" : "▼ ") + difference + unit + " vs. período anterior";
    element.className = "delta " + tone;
    element.hidden = false;
  }

  function averageOf(readings) {
    var value = window.DiaryStats.average(readings.map(function (reading) { return Number(reading.value); }));
    return value === null ? null : Math.round(value);
  }

  function inRangePercent(readings) {
    if (!readings.length) return null;
    var inside = readings.filter(function (reading) { return classify(Number(reading.value)) === "range"; });
    return Math.round((inside.length / readings.length) * 100);
  }

  function renderInsights(readings, range) {
    var last = readings[0];
    document.getElementById("insight-last").textContent = last ? last.value + " mg/dL" : "—";
    document.getElementById("insight-last-detail").textContent = last
      ? statusText(classify(Number(last.value))) + " · " + relativeTime(last.timestamp)
      : "Nenhuma medição no período";

    var average = averageOf(readings);
    document.getElementById("insight-average").textContent = average === null ? "—" : average + " mg/dL";
    document.getElementById("insight-average-detail").textContent = readings.length
      ? readings.length + (readings.length === 1 ? " medição no período" : " medições no período")
      : "Sem medições no período";

    var previous = window.DiaryStats.previousBounds(range);
    var previousReadings = previous ? window.DiaryStats.filterByRange(validReadings(), previous) : [];
    renderDelta(
      document.getElementById("insight-average-delta"),
      average,
      previousReadings.length ? averageOf(previousReadings) : null,
      " mg/dL",
      null
    );
    renderDelta(
      document.getElementById("range-delta"),
      inRangePercent(readings),
      previousReadings.length ? inRangePercent(previousReadings) : null,
      " pontos",
      true
    );

    var days = window.DiaryStats.daySpan(range, readings);
    var perDay = days && readings.length ? readings.length / days : null;
    document.getElementById("insight-frequency").textContent = perDay === null
      ? "—"
      : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(perDay) + "×";
    document.getElementById("insight-frequency-detail").textContent = perDay === null
      ? "Mostra a constância do registro"
      : readings.length + " em " + days + (days === 1 ? " dia" : " dias");

    var meals = mealsInPeriod(range);
    var carbsPerDay = days && meals.length ? carbsIn(meals) / days : null;
    document.getElementById("insight-carbs").textContent = carbsPerDay === null
      ? "—"
      : "≈ " + formatGrams(Math.round(carbsPerDay));
    document.getElementById("insight-carbs-detail").textContent = meals.length
      ? meals.length + (meals.length === 1 ? " refeição no período" : " refeições no período")
      : "Nenhuma refeição salva no período";
  }

  function renderDashboard() {
    // O painel segue o período escolhido; a lista de medições mostra sempre tudo,
    // para nenhum registro parecer perdido por causa do filtro.
    var allReadings = validReadings();
    var range = periodRange();
    var readings = window.DiaryStats.filterByRange(allReadings, range);
    var counts = { below: 0, range: 0, above: 0 };

    document.getElementById("period-label").textContent = periodLabel();
    renderTrend(readings);

    readings.forEach(function (reading) {
      counts[classify(Number(reading.value))] += 1;
    });

    document.getElementById("below-count").textContent = counts.below;
    document.getElementById("range-count").textContent = counts.range;
    document.getElementById("above-count").textContent = counts.above;
    document.getElementById("reading-total").textContent = allReadings.length;

    var percentage = readings.length ? Math.round((counts.range / readings.length) * 100) : null;
    document.getElementById("range-percent").textContent = percentage === null ? "—" : percentage + "%";
    document.getElementById("range-detail").textContent = readings.length
      ? counts.range + " de " + readings.length + " medições válidas"
      : (allReadings.length ? "Nenhuma medição neste período" : "Adicione a primeira medição");

    var total = readings.length || 1;
    document.getElementById("below-segment").style.width = (counts.below / total) * 100 + "%";
    document.getElementById("range-segment").style.width = readings.length ? (counts.range / total) * 100 + "%" : "100%";
    document.getElementById("above-segment").style.width = (counts.above / total) * 100 + "%";

    renderInsights(readings, range);

    var recent = document.getElementById("recent-readings");
    if (!allReadings.length) {
      recent.innerHTML = '<div class="empty-state compact"><span aria-hidden="true">⌁</span><p>Suas últimas medições aparecerão aqui.</p></div>';
      return;
    }

    recent.innerHTML = allReadings.map(function (reading) {
      var status = classify(Number(reading.value));
      var source = reading.source === "cgm" ? "CGM registrado" : "Medição de dedo";
      var note = reading.note ? " · " + escapeHtml(reading.note) : "";
      return '<div class="reading-row">' +
        '<span class="status-dot ' + status + '" aria-hidden="true"></span>' +
        '<div><strong class="reading-value">' + escapeHtml(reading.value) + '</strong> <span class="reading-meta inline">mg/dL</span>' +
        '<small class="reading-meta">' + source + ' · ' + formatDate(reading.timestamp) + note + '</small></div>' +
        '<span class="status-label ' + status + '">' + statusText(status) + '</span>' +
        '<button class="row-remove" type="button" data-remove-reading="' + escapeHtml(reading.id) + '" title="Remover medição" aria-label="Remover medição de ' + escapeHtml(reading.value) + ' mg/dL">×</button>' +
        '</div>';
    }).join("");
  }

  function renderPendingItems() {
    var pending = document.getElementById("pending-items");
    var total = mealTotals(pendingItems);
    document.getElementById("item-count").textContent = pendingItems.length;
    document.getElementById("meal-total").textContent = pendingItems.length
      ? formatCarbTotal(total.min, total.max)
      : "—";
    document.getElementById("meal-total-range").textContent = pendingItems.length
      ? "faixa estimada: " + formatRange(total.min, total.max)
      : "Adicione itens para somar";

    if (!pendingItems.length) {
      pending.innerHTML = '<div class="empty-state compact"><span aria-hidden="true">＋</span><p>Adicione um alimento para ver a estimativa.</p></div>';
      return;
    }

    pending.innerHTML = pendingItems.map(function (item, index) {
      return '<div class="pending-row">' +
        '<div><strong>' + escapeHtml(item.name) + '</strong><small>' + sourceLabels[item.source] + '</small></div>' +
        '<span class="carb-range">' + formatRange(item.min, item.max) + '</span>' +
        '<button class="row-remove" type="button" data-remove-item="' + index + '" title="Remover item" aria-label="Remover ' + escapeHtml(item.name) + '">×</button>' +
        '</div>';
    }).join("");
  }

  function renderMeals() {
    var history = document.getElementById("meal-history");
    var meals = state.meals.slice().sort(function (a, b) {
      return new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime();
    });
    document.getElementById("meal-total-count").textContent = meals.length;

    if (!meals.length) {
      history.innerHTML = '<div class="empty-state"><span aria-hidden="true">◻</span><h3>Seu diário começa com uma refeição.</h3><p>Escolha café, almoço, lanche ou jantar e registre os itens.</p></div>';
      return;
    }

    history.innerHTML = meals.map(function (meal) {
      var total = mealTotals(Array.isArray(meal.items) ? meal.items : []);
      var itemNames = (meal.items || []).map(function (item) { return escapeHtml(item.name); }).join(", ");
      return '<article class="saved-meal-card">' +
        '<div class="saved-meal-top"><span class="saved-meal-category">' + mealLabels[meal.category] + '</span>' +
        '<span class="saved-meal-date">' + formatDate(meal.recordedAt) + '</span></div>' +
        '<h3>' + (itemNames || "Refeição registrada") + '</h3>' +
        '<p>' + (meal.note ? escapeHtml(meal.note) : "Itens confirmados no diário.") + '</p>' +
        '<span class="saved-meal-total">' + formatCarbTotal(total.min, total.max) + ' de carboidratos' +
        '<small>faixa: ' + formatRange(total.min, total.max) + '</small></span>' +
        '<button class="repeat-meal" type="button" data-repeat-meal="' + escapeHtml(meal.id) + '" title="Copiar os itens para a refeição atual">Repetir</button>' +
        '<button class="row-remove" type="button" data-remove-meal="' + escapeHtml(meal.id) + '" title="Remover refeição" aria-label="Remover refeição">×</button>' +
        '</article>';
    }).join("");
  }

  function templateHistory(template) {
    if (!template.uses) {
      return template.createdAt ? "salva em " + formatDay(template.createdAt) : "ainda não usada";
    }
    return "usada " + template.uses + (template.uses === 1 ? " vez" : " vezes") +
      (template.lastUsedAt ? " · última em " + formatDay(template.lastUsedAt) : "");
  }

  function renderTemplates() {
    var target = document.getElementById("meal-templates");
    // Mais usadas primeiro: o atalho fica onde a mão já procura.
    var templates = state.templates.slice().sort(function (a, b) {
      return b.uses - a.uses || (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "");
    });

    if (!templates.length) {
      target.innerHTML = '<div class="empty-state compact"><span aria-hidden="true">☆</span>' +
        '<h3>Nenhuma refeição padrão ainda.</h3>' +
        '<p>Monte uma refeição logo abaixo e toque em “Salvar como refeição padrão”.</p></div>';
      return;
    }

    target.innerHTML = templates.map(function (template) {
      var totals = mealTotals(template.items);
      var items = template.items.map(function (item) { return escapeHtml(item.name); }).join(", ");
      return '<article class="template-card">' +
        '<div class="template-top">' +
        '<span class="template-category">' + escapeHtml(mealLabels[template.category]) + '</span>' +
        '<span class="template-uses">' + escapeHtml(templateHistory(template)) + '</span>' +
        '</div>' +
        '<h4>' + escapeHtml(template.name) + '</h4>' +
        '<p>' + items + '</p>' +
        '<span class="template-total">' + formatCarbTotal(totals.min, totals.max) + ' de carboidratos' +
        '<small>faixa: ' + formatRange(totals.min, totals.max) + '</small></span>' +
        '<div class="template-actions">' +
        '<button class="secondary-button" type="button" data-use-template="' + escapeHtml(template.id) + '">Usar</button>' +
        '<button class="row-remove" type="button" data-remove-template="' + escapeHtml(template.id) + '" title="Remover refeição padrão" aria-label="Remover a refeição padrão ' + escapeHtml(template.name) + '">×</button>' +
        '</div>' +
        '</article>';
    }).join("");
  }

  function renderAll() {
    renderToday();
    renderDashboard();
    renderPendingItems();
    renderMeals();
    renderMedicalOrientation();
    renderParameters();
    renderFavorites();
    renderTemplates();
  }

  // Um recorte de cada vez: escolher datas desliga os atalhos e vice-versa,
  // para o painel nunca mostrar um total que não bate com o filtro visível.
  function applyPeriod() {
    var byDate = usingDateFilter();
    periodFrom.value = period.from;
    periodTo.value = period.to;
    clearDateFilter.hidden = !byDate;
    document.querySelectorAll(".period-chip").forEach(function (chip) {
      chip.classList.toggle("active", !byDate && Number(chip.dataset.period) === period.days);
    });
    localStorage.setItem(PERIOD_KEY, JSON.stringify(period));
    renderDashboard();
  }

  function loadPeriod() {
    try {
      var stored = JSON.parse(localStorage.getItem(PERIOD_KEY) || "null");
      // Versões anteriores guardavam só o número de dias.
      if (typeof stored === "number" || typeof stored === "string") {
        var days = Number(stored);
        if (Number.isFinite(days) && days >= 0) period.days = days;
        return;
      }
      if (!stored) return;
      if (Number.isFinite(Number(stored.days)) && Number(stored.days) >= 0) period.days = Number(stored.days);
      period.from = window.DiaryStats.startOfDay(stored.from) === null ? "" : stored.from;
      period.to = window.DiaryStats.startOfDay(stored.to) === null ? "" : stored.to;
    } catch (error) {
      // Preferência ilegível: segue com os 30 dias padrão.
    }
  }

  function findFood(name) {
    var normalized = String(name || "").trim().toLowerCase();
    if (!normalized) return null;
    return foods.find(function (food) { return food.name.toLowerCase() === normalized; }) || null;
  }

  function currentFoodSelection() {
    var food = findFood(foodSearch.value);
    if (!food) return null;
    var measure = food.measures[Number(foodMeasure.value)];
    var quantity = Number(foodQuantity.value);
    if (!measure || !Number.isFinite(quantity) || quantity <= 0 || quantity > 50) return null;
    return {
      food: food,
      measure: measure,
      quantity: quantity,
      grams: Math.round(measure[1] * quantity * 10) / 10
    };
  }

  // Um item da tabela vira item pendente. Usado pelo formulário e pelos favoritos.
  function addFoodItem(food, measure, quantity) {
    var grams = Math.round(measure[1] * quantity * 10) / 10;
    var quantityText = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(quantity);
    var label = quantity === 1
      ? food.name + " (" + measure[0] + ")"
      : food.name + " (" + quantityText + " × " + measure[0] + ")";

    pendingItems.push({
      id: entryId("item"),
      name: label.slice(0, 80),
      min: grams,
      max: grams,
      source: "tabela"
    });
    renderPendingItems();
    return grams;
  }

  function registerFavorite(foodName, measureName, quantity) {
    var existing = state.favorites.find(function (item) {
      return item.food === foodName && item.measure === measureName && item.quantity === quantity;
    });
    if (existing) {
      existing.uses += 1;
    } else {
      state.favorites.push({ food: foodName, measure: measureName, quantity: quantity, uses: 1 });
    }
    state.favorites = normalizeFavorites(state.favorites);
    saveState();
    renderFavorites();
  }

  // Resolve o favorito na tabela atual; some sozinho se o alimento ou a medida sumir.
  function resolveFavorite(favorite) {
    var food = foods.find(function (item) { return item.name === favorite.food; });
    if (!food) return null;
    var measure = food.measures.find(function (item) { return item[0] === favorite.measure; });
    return measure ? { food: food, measure: measure } : null;
  }

  function renderFavorites() {
    var target = document.getElementById("food-favorites");
    var chips = state.favorites.map(function (favorite, index) {
      var resolved = resolveFavorite(favorite);
      if (!resolved) return "";
      var grams = Math.round(resolved.measure[1] * favorite.quantity * 10) / 10;
      var quantityText = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(favorite.quantity);
      return '<span class="food-chip">' +
        '<button type="button" data-favorite="' + index + '">' +
        escapeHtml(favorite.food) + ' <small>' + quantityText + ' × ' + escapeHtml(favorite.measure) +
        ' · ' + formatGrams(grams) + '</small></button>' +
        '<button class="chip-remove" type="button" data-remove-favorite="' + index + '" title="Tirar dos frequentes" aria-label="Tirar ' + escapeHtml(favorite.food) + ' dos frequentes">×</button>' +
        '</span>';
    }).filter(Boolean).slice(0, 6).join("");

    target.innerHTML = chips
      ? '<p class="eyebrow">Você repete bastante</p><div class="food-chips">' + chips + '</div>'
      : "";
  }

  function renderFoodPicker() {
    var food = findFood(foodSearch.value);

    if (food && foodMeasure.dataset.food !== food.name) {
      foodMeasure.dataset.food = food.name;
      foodMeasure.innerHTML = food.measures.map(function (measure, index) {
        return '<option value="' + index + '">' + escapeHtml(measure[0]) + ' · ' + formatGrams(measure[1]) + '</option>';
      }).join("");
      foodMeasure.disabled = false;
    } else if (!food && foodMeasure.dataset.food) {
      delete foodMeasure.dataset.food;
      foodMeasure.innerHTML = '<option value="">Escolha o alimento</option>';
      foodMeasure.disabled = true;
    }

    var selection = currentFoodSelection();
    foodCarbs.textContent = selection ? formatGrams(selection.grams) : "—";
  }

  function mealForHour(hour) {
    if (hour < 11) return "cafe";
    if (hour < 15) return "almoco";
    if (hour < 18) return "lanche";
    return "jantar";
  }

  function selectMeal(category) {
    selectedCategory = category;
    document.getElementById("selected-meal-label").textContent = mealLabels[category];
    document.querySelectorAll(".meal-choice").forEach(function (button) {
      button.classList.toggle("active", button.dataset.category === category);
    });
  }

  glucoseForm.addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      addGlucoseReading({
        value: glucoseValue.value,
        timestamp: glucoseTime.value,
        source: glucoseSource.value,
        note: glucoseNote.value
      });
      glucoseForm.reset();
      glucoseTime.value = localDateTimeValue(new Date());
      showToast("Medição registrada no seu diário.");
    } catch (error) {
      showToast(error.message);
    }
  });

  medicalOrientationForm.addEventListener("submit", function (event) {
    event.preventDefault();
    try {
      saveMedicalOrientation(medicalOrientationInput.value);
      showToast(medicalOrientationInput.value.trim() ? "Orientação salva como referência." : "Orientação removida do navegador.");
    } catch (error) {
      showToast(error.message);
    }
  });

  aiEstimateForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearEstimateResult();
    setEstimateStatus("Preparando a estimativa…", false);
    estimateSubmit.disabled = true;
    estimateSubmit.textContent = "Estimando…";

    try {
      latestEstimate = await requestCarbohydrateEstimate();
      renderEstimate(latestEstimate);
      setEstimateStatus("Estimativa pronta. Confira os itens antes de adicionar ao diário.", false);
    } catch (error) {
      clearEstimateResult();
      setEstimateStatus(error.message || "Não foi possível gerar a estimativa.", true);
    } finally {
      estimateSubmit.disabled = false;
      estimateSubmit.textContent = "Estimar carboidratos";
    }
  });

  addEstimateItems.addEventListener("click", function () {
    if (!latestEstimate || !Array.isArray(latestEstimate.items)) return;

    latestEstimate.items.forEach(function (item) {
      pendingItems.push({
        id: entryId("item"),
        name: item.name,
        min: item.min,
        max: item.max,
        source: "ia"
      });
    });

    renderPendingItems();
    addEstimateItems.disabled = true;
    addEstimateItems.textContent = "Itens adicionados ao diário";
    showToast("Estimativa adicionada. Confira os itens antes de salvar a refeição.");
  });

  document.getElementById("add-parameter-row").addEventListener("click", function () {
    var rows = state.parameters.rows;
    rows.push({ start: rows.length ? (rows[rows.length - 1].start + 1) % 24 : 0, correction: "", ratio: "" });
    renderParameters();
  });

  // Só atualiza o modelo em memória: re-renderizar aqui tiraria o foco do campo.
  document.getElementById("parameters-rows").addEventListener("input", function (event) {
    var field = event.target.dataset.field;
    var index = Number(event.target.dataset.index);
    if (!field || !state.parameters.rows[index]) return;
    state.parameters.rows[index][field] = field === "start" ? Number(event.target.value) : event.target.value;
  });

  document.getElementById("parameters-rows").addEventListener("click", function (event) {
    var index = event.target.dataset.removeParameter;
    if (typeof index === "undefined") return;
    state.parameters.rows.splice(Number(index), 1);
    renderParameters();
  });

  document.getElementById("parameters-form").addEventListener("submit", function (event) {
    event.preventDefault();
    state.parameters.bolus = document.getElementById("parameters-bolus").value.trim().slice(0, 80);
    state.parameters.basal = document.getElementById("parameters-basal").value.trim().slice(0, 200);
    state.parameters.note = document.getElementById("parameters-note").value.trim().slice(0, 200);
    state.parameters = normalizeParameters(state.parameters);
    saveState();
    renderParameters();
    showToast("Tabela de referência salva neste navegador.");
  });

  foodTableForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var selection = currentFoodSelection();
    if (!selection) {
      showToast("Escolha um alimento da lista e a medida caseira.");
      return;
    }

    addFoodItem(selection.food, selection.measure, selection.quantity);
    registerFavorite(selection.food.name, selection.measure[0], selection.quantity);

    foodSearch.value = "";
    foodQuantity.value = "1";
    renderFoodPicker();
    showToast(selection.food.name + " adicionado à refeição.");
    foodSearch.focus();
  });

  document.getElementById("food-favorites").addEventListener("click", function (event) {
    var removeIndex = event.target.dataset.removeFavorite;
    if (typeof removeIndex !== "undefined") {
      state.favorites.splice(Number(removeIndex), 1);
      saveState();
      renderFavorites();
      return;
    }

    var index = event.target.dataset.favorite;
    if (typeof index === "undefined") return;
    var favorite = state.favorites[Number(index)];
    var resolved = favorite && resolveFavorite(favorite);
    if (!resolved) return;

    addFoodItem(resolved.food, resolved.measure, favorite.quantity);
    favorite.uses += 1;
    state.favorites = normalizeFavorites(state.favorites);
    saveState();
    renderFavorites();
    showToast(favorite.food + " adicionado à refeição.");
  });

  [foodSearch, foodMeasure, foodQuantity].forEach(function (field) {
    field.addEventListener("input", renderFoodPicker);
    field.addEventListener("change", renderFoodPicker);
  });

  itemForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var min = Number(itemMin.value);
    var max = itemMax.value === "" ? min : Number(itemMax.value);

    if (!itemName.value.trim() || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      showToast("Preencha o alimento e uma faixa válida de carboidratos.");
      return;
    }

    pendingItems.push({
      id: entryId("item"),
      name: itemName.value.trim(),
      min: min,
      max: max,
      source: itemSource.value
    });

    itemForm.reset();
    itemSource.value = "descricao";
    renderPendingItems();
    showToast("Item adicionado à refeição.");
  });

  document.getElementById("pending-items").addEventListener("click", function (event) {
    var index = event.target.dataset.removeItem;
    if (typeof index === "undefined") return;
    pendingItems.splice(Number(index), 1);
    renderPendingItems();
  });

  document.getElementById("recent-readings").addEventListener("click", function (event) {
    var id = event.target.dataset.removeReading;
    if (!id) return;
    if (!window.confirm("Remover esta medição do diário?")) return;
    if (removeReading(id)) showToast("Medição removida.");
  });

  document.getElementById("meal-history").addEventListener("click", function (event) {
    var repeatId = event.target.dataset.repeatMeal;
    if (repeatId) {
      var meal = state.meals.find(function (saved) { return saved.id === repeatId; });
      if (!meal) return;
      (meal.items || []).forEach(function (item) {
        pendingItems.push({
          id: entryId("item"),
          name: item.name,
          min: item.min,
          max: item.max,
          source: item.source
        });
      });
      renderPendingItems();
      showToast("Itens copiados. Confira e salve como " + mealLabels[selectedCategory] + ".");
      document.querySelector(".meal-workspace").scrollIntoView({ block: "start" });
      return;
    }

    var id = event.target.dataset.removeMeal;
    if (!id) return;
    if (!window.confirm("Remover esta refeição do diário?")) return;
    if (removeMeal(id)) showToast("Refeição removida.");
  });

  document.querySelectorAll(".period-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var days = Number(chip.dataset.period);
      period.days = Number.isFinite(days) && days >= 0 ? days : 30;
      period.from = "";
      period.to = "";
      applyPeriod();
    });
  });

  [periodFrom, periodTo].forEach(function (field) {
    field.addEventListener("change", function () {
      period.from = periodFrom.value;
      period.to = periodTo.value;
      // Datas invertidas não recortam nada: troco em vez de mostrar painel vazio.
      if (period.from && period.to && period.from > period.to) {
        var swap = period.from;
        period.from = period.to;
        period.to = swap;
        showToast("Datas trocadas de lugar para o período fazer sentido.");
      }
      applyPeriod();
    });
  });

  clearDateFilter.addEventListener("click", function () {
    period.from = "";
    period.to = "";
    applyPeriod();
  });

  estimateAccessToken.addEventListener("change", rememberTokenChoice);
  rememberAccessToken.addEventListener("change", rememberTokenChoice);

  document.getElementById("save-meal").addEventListener("click", function () {
    if (!pendingItems.length) {
      showToast("Adicione pelo menos um item antes de salvar.");
      return;
    }

    try {
      addMealRecord({
        category: selectedCategory,
        note: mealNote.value,
        items: pendingItems
      });
      pendingItems = [];
      mealNote.value = "";
      resetEstimateForm();
      renderPendingItems();
      showToast(mealLabels[selectedCategory] + " salvo no diário.");
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelectorAll(".meal-choice").forEach(function (button) {
    button.addEventListener("click", function () {
      selectMeal(button.dataset.category);
    });
  });

  document.getElementById("save-template").addEventListener("click", function () {
    if (!pendingItems.length) {
      showToast("Monte a refeição primeiro: a padrão guarda os itens que estão na lista.");
      return;
    }

    var suggested = pendingItems.length === 1
      ? pendingItems[0].name
      : mealLabels[selectedCategory] + " de sempre";
    var name = window.prompt("Como você quer chamar esta refeição padrão?", suggested);
    if (name === null) return;
    if (!name.trim()) {
      showToast("Dê um nome para encontrar essa refeição depois.");
      return;
    }

    state.templates.push({
      id: entryId("padrao"),
      name: name,
      category: selectedCategory,
      createdAt: new Date().toISOString(),
      lastUsedAt: "",
      uses: 0,
      items: pendingItems
    });
    state.templates = normalizeTemplates(state.templates);
    saveState();
    renderTemplates();
    showToast('"' + name.trim() + '" salva nas refeições padrão.');
  });

  // Usar a padrão só preenche a lista de itens: o registro no diário continua
  // dependendo do "Salvar refeição", como qualquer outra montagem.
  document.getElementById("meal-templates").addEventListener("click", function (event) {
    var removeId = event.target.dataset.removeTemplate;
    if (removeId) {
      if (!window.confirm("Remover esta refeição padrão? O que já foi salvo no diário continua lá.")) return;
      state.templates = state.templates.filter(function (template) { return template.id !== removeId; });
      saveState();
      renderTemplates();
      showToast("Refeição padrão removida.");
      return;
    }

    var useId = event.target.dataset.useTemplate;
    if (!useId) return;
    var chosen = state.templates.find(function (template) { return template.id === useId; });
    if (!chosen) return;

    chosen.items.forEach(function (item) {
      pendingItems.push({
        id: entryId("item"),
        name: item.name,
        min: item.min,
        max: item.max,
        source: item.source
      });
    });

    chosen.uses += 1;
    chosen.lastUsedAt = new Date().toISOString();
    saveState();
    selectMeal(chosen.category);
    renderPendingItems();
    renderTemplates();
    showToast('"' + chosen.name + '" carregada. Confira e salve como ' + mealLabels[chosen.category] + ".");
    document.querySelector(".meal-workspace").scrollIntoView({ block: "start" });
  });

  estimateConsent.addEventListener("change", function () {
    setPhotoControlsEnabled(estimateConsent.checked);
    if (!estimateConsent.checked) {
      clearSelectedPhoto();
      clearEstimateResult();
      setEstimateStatus("", false);
    }
  });

  takePhoto.addEventListener("click", function () { mealCamera.click(); });
  pickPhoto.addEventListener("click", function () { mealPhoto.click(); });
  document.getElementById("remove-photo").addEventListener("click", clearSelectedPhoto);

  [mealCamera, mealPhoto].forEach(function (input) {
    input.addEventListener("change", function () {
      selectPhoto(input.files && input.files[0]);
    });
  });

  [estimateDescription, estimatePortion, estimateAccessToken].forEach(function (field) {
    field.addEventListener("input", function () {
      if (latestEstimate) clearEstimateResult();
    });
  });

  var pendingImport = null;
  var importDialog = document.getElementById("import-dialog");
  var importFile = document.getElementById("import-file");

  function closeImportDialog() {
    importDialog.close();
    pendingImport = null;
    importFile.value = "";
  }

  importFile.addEventListener("change", async function () {
    var file = importFile.files && importFile.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Arquivo muito grande. Envie um .csv de até 5 MB.");
      importFile.value = "";
      return;
    }

    var summary = document.getElementById("import-summary");
    try {
      pendingImport = prepareImport(await file.text());
    } catch (error) {
      showToast("Não consegui ler esse arquivo.");
      importFile.value = "";
      return;
    }

    var total = pendingImport.readings.length + pendingImport.carbs.length;
    var linhas = [
      '<p class="import-file-name">' + escapeHtml(file.name) + "</p>",
      '<ul class="import-list">',
      "<li><strong>" + pendingImport.readings.length + "</strong> medições novas</li>",
      "<li><strong>" + pendingImport.carbs.length + "</strong> registros de carboidrato novos</li>",
      pendingImport.duplicates ? "<li>" + pendingImport.duplicates + " já estavam no diário e serão ignorados</li>" : "",
      pendingImport.skipped ? "<li>" + pendingImport.skipped + " linhas sem data ou valor reconhecível</li>" : "",
      "</ul>"
    ];

    if (!total) {
      linhas.push('<p class="import-warning">Nada novo para importar. Colunas encontradas no arquivo: <em>' +
        escapeHtml((pendingImport.header || []).join(", ").slice(0, 300)) + "</em></p>");
    }

    summary.innerHTML = linhas.join("");
    document.getElementById("confirm-import").disabled = !total;
    importDialog.showModal();
  });

  document.getElementById("confirm-import").addEventListener("click", function () {
    if (!pendingImport) return;
    var total = pendingImport.readings.length + pendingImport.carbs.length;
    applyImport(pendingImport);
    closeImportDialog();
    showToast(total + " registros importados para o diário.");
  });

  document.getElementById("cancel-import").addEventListener("click", closeImportDialog);
  document.getElementById("close-import").addEventListener("click", closeImportDialog);

  document.getElementById("export-data").addEventListener("click", function () {
    exportDataAsCsv();
  });

  document.getElementById("export-backup").addEventListener("click", function () {
    downloadFile(
      "backup-diario-aloncinho-" + new Date().toISOString().slice(0, 10) + ".json",
      JSON.stringify(diaryState.makeBackup(state), null, 2),
      "application/json"
    );
    showToast("Backup baixado. Guarde o arquivo em lugar seguro: ele tem seus dados de saúde.");
  });

  // Restaurar troca o diário inteiro pelo do arquivo. O diálogo mostra os dois
  // lados antes, porque é a única forma de não apagar dado sem a pessoa ver.
  var pendingRestore = null;
  var restoreDialog = document.getElementById("restore-dialog");
  var restoreFile = document.getElementById("restore-file");

  function closeRestoreDialog() {
    restoreDialog.close();
    pendingRestore = null;
    restoreFile.value = "";
  }

  function describeCounts(counts) {
    return '<ul class="import-list">' +
      "<li><strong>" + counts.readings + "</strong> medições</li>" +
      "<li><strong>" + counts.meals + "</strong> refeições</li>" +
      "<li><strong>" + counts.templates + "</strong> refeições padrão</li>" +
      "<li><strong>" + counts.favorites + "</strong> alimentos frequentes</li>" +
      "<li><strong>" + counts.parameterRows + "</strong> faixas de horário</li>" +
      "<li>" + (counts.hasOrientation ? "com" : "sem") + " orientação médica salva</li>" +
      "</ul>";
  }

  restoreFile.addEventListener("change", async function () {
    var file = restoreFile.files && restoreFile.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showToast("Arquivo muito grande. Envie um backup de até 20 MB.");
      restoreFile.value = "";
      return;
    }

    var result;
    try {
      result = diaryState.readBackup(await file.text());
    } catch (error) {
      result = { ok: false, error: "Não consegui ler esse arquivo." };
    }

    if (!result.ok) {
      showToast(result.error);
      restoreFile.value = "";
      return;
    }

    pendingRestore = result;
    var discarded = result.discarded.readings + result.discarded.meals;
    document.getElementById("restore-summary").innerHTML =
      '<p class="import-file-name">' + escapeHtml(file.name) + "</p>" +
      (result.savedAt ? '<p class="restore-date">Backup de ' + escapeHtml(formatDate(result.savedAt)) + "</p>" : "") +
      '<div class="restore-sides">' +
      "<div><p class=\"eyebrow\">Vem do arquivo</p>" + describeCounts(result.counts) + "</div>" +
      "<div><p class=\"eyebrow\">Está salvo agora</p>" + describeCounts(diaryState.counts(state)) + "</div>" +
      "</div>" +
      (discarded ? '<p class="import-warning">' + discarded + " registros do arquivo não passaram na conferência e ficam de fora.</p>" : "") +
      '<p class="import-warning">Restaurar <strong>substitui</strong> o que está salvo neste navegador. Baixe um backup antes se quiser guardar o atual.</p>';
    restoreDialog.showModal();
  });

  document.getElementById("confirm-restore").addEventListener("click", function () {
    if (!pendingRestore) return;
    var restored = pendingRestore.counts;
    state = pendingRestore.state;
    pendingItems = [];
    saveState();
    resetEstimateForm();
    renderAll();
    closeRestoreDialog();
    showToast(restored.readings + " medições e " + restored.meals + " refeições restauradas.");
  });

  document.getElementById("cancel-restore").addEventListener("click", closeRestoreDialog);
  document.getElementById("close-restore").addEventListener("click", closeRestoreDialog);

  document.getElementById("export-pdf").addEventListener("click", function () {
    openPdfReport();
  });

  document.getElementById("clear-data").addEventListener("click", function () {
    if (!window.confirm("Apagar todas as medições, refeições e orientações salvas neste navegador?")) return;
    state = blankState();
    pendingItems = [];
    localStorage.removeItem(STORAGE_KEY);
    resetEstimateForm();
    renderAll();
    showToast("Dados locais apagados.");
  });

  document.getElementById("open-data-help").addEventListener("click", function () {
    dataDialog.showModal();
  });

  document.getElementById("close-data-help").addEventListener("click", function () {
    dataDialog.close();
  });

  function unregisterWebMcpTools() {
    if (webMcpController) webMcpController.abort();
    webMcpController = null;
  }

  function installWebMcpTools() {
    var context = document.modelContext;
    if (!assistantToolsConsent.checked || !context || typeof context.registerTool !== "function" || webMcpController) {
      return;
    }

    webMcpController = new AbortController();
    var options = { signal: webMcpController.signal };

    Promise.resolve(context.registerTool({
      name: "read_diary_summary",
      title: "Ler resumo do diário",
      description: "Mostra apenas contagens agregadas de medições e refeições salvas localmente.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false
      },
      execute: function () {
        return getDiarySummary();
      }
    }, options)).catch(function () {
      unregisterWebMcpTools();
    });

    Promise.resolve(context.registerTool({
      name: "add_glucose_reading",
      title: "Adicionar medição de glicose",
      description: "Registra uma medição em mg/dL no diário local e atualiza o painel de faixa pessoal.",
      inputSchema: {
        type: "object",
        properties: {
          value: { type: "number", minimum: 1, maximum: 999 },
          timestamp: { type: "string" },
          source: { type: "string", enum: ["manual", "cgm"] },
          note: { type: "string", maxLength: 160 }
        },
        required: ["value", "timestamp", "source"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      execute: function (input) {
        var reading = addGlucoseReading(input);
        return {
          id: reading.id,
          classification: classify(reading.value),
          timestamp: reading.timestamp
        };
      }
    }, options)).catch(function () {
      unregisterWebMcpTools();
    });

    Promise.resolve(context.registerTool({
      name: "save_meal_record",
      title: "Salvar refeição no diário",
      description: "Salva uma refeição com itens e faixas de carboidratos, sem qualquer cálculo de insulina.",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["cafe", "almoco", "lanche", "jantar"] },
          note: { type: "string", maxLength: 160 },
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                name: { type: "string", minLength: 1, maxLength: 80 },
                min: { type: "number", minimum: 0 },
                max: { type: "number", minimum: 0 },
                source: { type: "string", enum: ["descricao", "rotulo", "foto"] }
              },
              required: ["name", "min", "max", "source"],
              additionalProperties: false
            }
          }
        },
        required: ["category", "items"],
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false
      },
      execute: function (input) {
        var meal = addMealRecord(input);
        var total = mealTotals(meal.items);
        return {
          id: meal.id,
          category: meal.category,
          itemCount: meal.items.length,
          carbohydrates: { minGrams: total.min, maxGrams: total.max }
        };
      }
    }, options)).catch(function () {
      unregisterWebMcpTools();
    });
  }

  assistantToolsConsent.checked = localStorage.getItem("diario-aloncinho-assistant-consent") === "true";
  assistantToolsConsent.addEventListener("change", function () {
    localStorage.setItem("diario-aloncinho-assistant-consent", assistantToolsConsent.checked ? "true" : "false");
    if (assistantToolsConsent.checked) {
      installWebMcpTools();
      showToast("Ações do assistente ativadas neste navegador.");
    } else {
      unregisterWebMcpTools();
      showToast("Ações do assistente desativadas.");
    }
  });

  foodOptions.innerHTML = foods.map(function (food) {
    return '<option value="' + escapeHtml(food.name) + '"></option>';
  }).join("");
  renderFoodPicker();
  glucoseTime.value = localDateTimeValue(new Date());
  // Ninguém mediu glicose no futuro: o filtro não deixa escolher depois de hoje.
  periodFrom.max = window.DiaryStats.dayKey(new Date());
  periodTo.max = periodFrom.max;
  applyStoredToken();
  selectMeal(mealForHour(new Date().getHours()));
  loadPeriod();
  applyPeriod();
  renderAll();
  installWebMcpTools();
}());
