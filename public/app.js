(function () {
  "use strict";

  var STORAGE_KEY = "diario-aloncinho-v1";
  var TOKEN_KEY = "diario-aloncinho-token";
  var PERIOD_KEY = "diario-aloncinho-periodo";
  var selectedCategory = "cafe";
  var periodDays = 30;
  var pendingItems = [];
  var previewUrl = "";
  var latestEstimate = null;
  var toastTimer = 0;
  var webMcpController = null;

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
    ia: "Estimativa por IA"
  };

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
  var photoPreview = document.getElementById("photo-preview");
  var medicalOrientationForm = document.getElementById("medical-orientation-form");
  var medicalOrientationInput = document.getElementById("medical-orientation-input");
  var medicalOrientationDisplay = document.getElementById("medical-orientation-display");
  var medicalOrientationDate = document.getElementById("medical-orientation-date");
  var dataDialog = document.getElementById("data-dialog");
  var assistantToolsConsent = document.getElementById("assistant-tools-consent");

  function blankState() {
    return { readings: [], meals: [], medicalOrientation: { text: "", updatedAt: "" } };
  }

  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!parsed || !Array.isArray(parsed.readings) || !Array.isArray(parsed.meals)) {
        return blankState();
      }
      return {
        readings: parsed.readings,
        meals: parsed.meals,
        medicalOrientation: parsed.medicalOrientation && typeof parsed.medicalOrientation.text === "string"
          ? {
            text: parsed.medicalOrientation.text.slice(0, 2000),
            updatedAt: typeof parsed.medicalOrientation.updatedAt === "string" ? parsed.medicalOrientation.updatedAt : ""
          }
          : { text: "", updatedAt: "" }
      };
    } catch (error) {
      return blankState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function entryId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return prefix + "-" + window.crypto.randomUUID();
    }
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
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

  // periodDays === 0 significa "tudo"; as leituras já chegam ordenadas da mais recente.
  function readingsInPeriod() {
    var readings = validReadings();
    if (!periodDays) return readings;
    var cutoff = Date.now() - periodDays * 86400000;
    return readings.filter(function (reading) {
      return new Date(reading.timestamp).getTime() >= cutoff;
    });
  }

  function isToday(value) {
    var date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
  }

  function carbsToday() {
    return state.meals
      .filter(function (meal) { return isToday(meal.recordedAt); })
      .reduce(function (sum, meal) {
        var totals = mealTotals(Array.isArray(meal.items) ? meal.items : []);
        return sum + carbMidpoint(totals.min, totals.max);
      }, 0);
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    photoPreview.textContent = "Nenhuma foto selecionada.";
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
    mealPhoto.disabled = true;
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
      throw new Error("Informe o código de acesso em “Acesso privado do site”.");
    }

    // A foto é o único dado que exige autorização explícita; o texto você digitou e enviou.
    var file = estimateConsent.checked && mealPhoto.files ? mealPhoto.files[0] : null;
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
    var points = readings.slice(0, 14).reverse().map(function (reading) {
      return { value: Number(reading.value), timestamp: reading.timestamp };
    });

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
    var dots = points.map(function (point, index) {
      return '<circle class="trend-dot ' + classify(point.value) + '" cx="' + xFor(index).toFixed(1) + '" cy="' + yFor(point.value).toFixed(1) + '" r="4.5"><title>' + point.value + ' mg/dL</title></circle>';
    }).join("");
    var firstDate = formatDate(points[0].timestamp);
    var lastDate = formatDate(points[points.length - 1].timestamp);
    var chartDescription = "Tendência de " + points.length + " medições registradas entre " + firstDate + " e " + lastDate + ".";

    chart.innerHTML = '<title id="trend-chart-title">Tendência de glicose</title><desc id="trend-chart-description">' + escapeHtml(chartDescription) + '</desc>' +
      '<rect class="trend-range-band" x="' + left + '" y="' + rangeTop.toFixed(1) + '" width="' + plotWidth + '" height="' + (rangeBottom - rangeTop).toFixed(1) + '"></rect>' +
      grid +
      '<line class="trend-boundary" x1="' + left + '" y1="' + yFor(80).toFixed(1) + '" x2="' + (width - right) + '" y2="' + yFor(80).toFixed(1) + '"></line>' +
      '<line class="trend-boundary" x1="' + left + '" y1="' + yFor(190).toFixed(1) + '" x2="' + (width - right) + '" y2="' + yFor(190).toFixed(1) + '"></line>' +
      '<polyline class="trend-line" points="' + path + '"></polyline>' + dots +
      '<text class="trend-axis" x="' + left + '" y="' + (height - 10) + '">' + escapeHtml(firstDate) + '</text>' +
      '<text class="trend-axis" x="' + (width - right) + '" y="' + (height - 10) + '" text-anchor="end">' + escapeHtml(lastDate) + '</text>';
    empty.hidden = true;
    summary.textContent = "Exibe " + points.length + " medições salvas. A área destacada representa a faixa pessoal do painel: 80–190 mg/dL.";
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

  function openPdfReport() {
    var reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      showToast("Permita a abertura da nova janela para gerar o relatório.");
      return;
    }
    var summary = getDiarySummary();
    var title = "Relatório do Diário do Aloncinho";
    var html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      '@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#102a36;font-size:12px;line-height:1.45}h1{font-size:22px;margin:0 0 5px}h2{font-size:15px;margin:25px 0 8px;color:#006a6b}.meta{color:#52666c;margin:0}.notice{margin:18px 0;padding:10px 12px;border-left:4px solid #006a6b;background:#eef8f5}.metrics{display:flex;gap:10px;margin:14px 0}.metric{border:1px solid #d9e6e0;padding:9px;min-width:105px}.metric strong{display:block;font-size:18px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #cbd9d7;padding:7px;vertical-align:top;text-align:left}th{background:#eef8f5}@media print{body{font-size:11px}.no-print{display:none}}</style></head><body>' +
      '<h1>' + title + '</h1><p class="meta">Gerado em ' + escapeHtml(formatDate(new Date().toISOString())) + '</p>' +
      '<p class="notice">Ferramenta de registro e apoio. Não substitui orientação médica e não realiza cálculo de dose.</p>' +
      '<h2>Resumo da faixa pessoal do dashboard</h2><div class="metrics"><div class="metric"><span>Faixa</span><strong>80–190</strong><small>mg/dL</small></div><div class="metric"><span>Medições na faixa</span><strong>' + (summary.validReadingCount ? Math.round(summary.inRangeReadingCount / summary.validReadingCount * 100) + "%" : "—") + '</strong><small>' + summary.inRangeReadingCount + " de " + summary.validReadingCount + ' leituras</small></div><div class="metric"><span>Refeições</span><strong>' + summary.mealCount + '</strong><small>salvas no diário</small></div></div>' +
      '<h2>Medições de glicose</h2><table><thead><tr><th>Data e hora</th><th>Valor</th><th>Faixa</th><th>Observação</th></tr></thead><tbody>' + printableReadingRows() + '</tbody></table>' +
      '<h2>Carboidratos registrados</h2><table><thead><tr><th>Data e hora</th><th>Refeição</th><th>Itens e faixa estimada</th><th>Observação</th></tr></thead><tbody>' + printableMealRows() + '</tbody></table>' +
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

  function renderInsights(readings) {
    var last = readings[0];
    document.getElementById("insight-last").textContent = last ? last.value + " mg/dL" : "—";
    document.getElementById("insight-last-detail").textContent = last
      ? statusText(classify(Number(last.value))) + " · " + relativeTime(last.timestamp)
      : "Nenhuma medição no período";

    var average = readings.length
      ? Math.round(readings.reduce(function (sum, reading) { return sum + Number(reading.value); }, 0) / readings.length)
      : null;
    document.getElementById("insight-average").textContent = average === null ? "—" : average + " mg/dL";
    document.getElementById("insight-average-detail").textContent = readings.length
      ? readings.length + (readings.length === 1 ? " medição no período" : " medições no período")
      : "Sem medições no período";

    var mealsToday = state.meals.filter(function (meal) { return isToday(meal.recordedAt); }).length;
    document.getElementById("insight-carbs").textContent = mealsToday ? "≈ " + formatGrams(carbsToday()) : "—";
    document.getElementById("insight-carbs-detail").textContent = mealsToday
      ? mealsToday + (mealsToday === 1 ? " refeição salva hoje" : " refeições salvas hoje")
      : "Nenhuma refeição salva hoje";
  }

  function renderDashboard() {
    // O painel segue o período escolhido; a lista de medições mostra sempre tudo,
    // para nenhum registro parecer perdido por causa do filtro.
    var allReadings = validReadings();
    var readings = readingsInPeriod();
    var counts = { below: 0, range: 0, above: 0 };

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

    renderInsights(readings);

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
        '<button class="row-remove" type="button" data-remove-meal="' + escapeHtml(meal.id) + '" title="Remover refeição" aria-label="Remover refeição">×</button>' +
        '</article>';
    }).join("");
  }

  function renderAll() {
    renderToday();
    renderDashboard();
    renderPendingItems();
    renderMeals();
    renderMedicalOrientation();
  }

  function selectPeriod(days) {
    periodDays = Number.isFinite(days) && days >= 0 ? days : 30;
    document.querySelectorAll(".period-chip").forEach(function (chip) {
      chip.classList.toggle("active", Number(chip.dataset.period) === periodDays);
    });
    renderDashboard();
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
    var id = event.target.dataset.removeMeal;
    if (!id) return;
    if (!window.confirm("Remover esta refeição do diário?")) return;
    if (removeMeal(id)) showToast("Refeição removida.");
  });

  document.querySelectorAll(".period-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      selectPeriod(Number(chip.dataset.period));
      localStorage.setItem(PERIOD_KEY, String(periodDays));
    });
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

  estimateConsent.addEventListener("change", function () {
    mealPhoto.disabled = !estimateConsent.checked;
    if (!estimateConsent.checked) {
      clearSelectedPhoto();
      clearEstimateResult();
      setEstimateStatus("", false);
    }
  });

  mealPhoto.addEventListener("change", function () {
    var file = mealPhoto.files && mealPhoto.files[0];
    if (!file) {
      photoPreview.textContent = "Nenhuma foto selecionada.";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    photoPreview.innerHTML = "Foto selecionada: <strong>" + escapeHtml(file.name) + "</strong>. Ela só será enviada ao pedir uma estimativa.";
    clearEstimateResult();
  });

  [estimateDescription, estimatePortion, estimateAccessToken].forEach(function (field) {
    field.addEventListener("input", function () {
      if (latestEstimate) clearEstimateResult();
    });
  });

  document.getElementById("export-data").addEventListener("click", function () {
    exportDataAsCsv();
  });

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

  var storedPeriod = localStorage.getItem(PERIOD_KEY);
  glucoseTime.value = localDateTimeValue(new Date());
  applyStoredToken();
  selectMeal(mealForHour(new Date().getHours()));
  selectPeriod(storedPeriod === null ? 30 : Number(storedPeriod));
  renderAll();
  installWebMcpTools();
}());
