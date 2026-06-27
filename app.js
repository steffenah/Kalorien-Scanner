// ===== Storage Keys =====
const STORE_KEY = 'kalorien-config';
const HISTORY_KEY = 'kalorien-history';
const STEPS_KEY = 'kalorien-steps';
const CUSTOM_FOODS_KEY = 'kalorien-custom-foods';

const MEAL_ORDER = [
  'Frühstück',
  'Zwischenmahlzeit (vormittag)',
  'Mittagessen',
  'Zwischenmahlzeit (nachmittag)',
  'Abendessen',
  'Spät / Nachspeise',
];

const MEAL_COLORS = {
  'Frühstück': '#f59e0b',
  'Zwischenmahlzeit (vormittag)': '#fbbf24',
  'Mittagessen': '#1f7a3a',
  'Zwischenmahlzeit (nachmittag)': '#a3a300',
  'Abendessen': '#3b82f6',
  'Spät / Nachspeise': '#8b5cf6',
};

const MACRO_COLORS = {
  protein: '#3b82f6',
  carbs:   '#f59e0b',
  fat:     '#ef4444',
};

let currentMeal = null;
let currentImage = null;

// ===== Config =====
function loadConfig() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveConfig(cfg) { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); }
function getApiKey() { return loadConfig().apiKey || ''; }
function getModel() { return loadConfig().model || 'claude-haiku-4-5'; }

// ===== Custom foods (KI-generated, cached) =====
function loadCustomFoods() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_FOODS_KEY)) || []; }
  catch { return []; }
}
function saveCustomFoods(arr) { localStorage.setItem(CUSTOM_FOODS_KEY, JSON.stringify(arr)); }
function allFoods() { return [...FOODS, ...loadCustomFoods()]; }

// ===== Settings Dialog =====
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const sexInput = document.getElementById('sexInput');
const ageInput = document.getElementById('ageInput');
const weightInput = document.getElementById('weightInput');
const heightInput = document.getElementById('heightInput');
const activityInput = document.getElementById('activityInput');

function openSettings() {
  const cfg = loadConfig();
  apiKeyInput.value = cfg.apiKey || '';
  modelSelect.value = cfg.model || 'claude-haiku-4-5';
  sexInput.value = cfg.sex || 'm';
  ageInput.value = cfg.age || '';
  weightInput.value = cfg.weight || '';
  heightInput.value = cfg.height || '';
  activityInput.value = cfg.activity || '1.375';
  settingsDialog.showModal();
}

document.getElementById('settingsBtn').addEventListener('click', openSettings);
document.getElementById('openSettingsLink').addEventListener('click', (e) => {
  e.preventDefault();
  openSettings();
});
document.getElementById('cancelSettings').addEventListener('click', () => settingsDialog.close());

document.getElementById('saveSettings').addEventListener('click', (e) => {
  e.preventDefault();
  saveConfig({
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    sex: sexInput.value,
    age: Number(ageInput.value) || null,
    weight: Number(weightInput.value) || null,
    height: Number(heightInput.value) || null,
    activity: Number(activityInput.value) || 1.375,
  });
  settingsDialog.close();
  renderAll();
});

if (!getApiKey()) setTimeout(openSettings, 300);

// ===== Meal Type Selection =====
const entryWrap = document.getElementById('entryWrap');
const mealHint = document.getElementById('mealHint');
const selectedMealLabel = document.getElementById('selectedMealLabel');

document.querySelectorAll('.meal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentMeal = btn.dataset.meal;
    document.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMealLabel.innerHTML = `<span class="meal-dot" style="background:${MEAL_COLORS[currentMeal]}"></span> ${escapeHtml(currentMeal)}`;
    entryWrap.hidden = false;
    mealHint.hidden = true;
    resetEntryUi();
  });
});

function resetEntryUi() {
  document.getElementById('foodSearch').value = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('previewWrap').hidden = true;
  document.getElementById('preview').src = '';
  document.getElementById('photoHint').value = '';
  document.getElementById('resultSection').hidden = true;
  document.getElementById('result').innerHTML = '';
  currentImage = null;
}

// ===== Entry Tabs =====
document.querySelectorAll('.entry-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.entry-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.getElementById('searchTab').hidden = (which !== 'search');
    document.getElementById('photoTab').hidden = (which !== 'photo');
    document.getElementById('resultSection').hidden = true;
  });
});

// ===== Food Search =====
const foodSearch = document.getElementById('foodSearch');
const searchResults = document.getElementById('searchResults');

foodSearch.addEventListener('input', renderSearchResults);

function normalize(s) {
  return String(s).toLowerCase()
    .replaceAll('ä', 'a').replaceAll('ö', 'o').replaceAll('ü', 'u').replaceAll('ß', 'ss');
}

function searchFoods(query) {
  const q = normalize(query.trim());
  if (!q) return [];
  return allFoods()
    .map(f => {
      const n = normalize(f.name);
      let score = 0;
      if (n === q) score = 100;
      else if (n.startsWith(q)) score = 50;
      else if (n.includes(q)) score = 20;
      else {
        // word-start match
        const words = n.split(/[\s(),]+/);
        if (words.some(w => w.startsWith(q))) score = 15;
      }
      return { f, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(x => x.f);
}

function renderSearchResults() {
  const query = foodSearch.value.trim();
  if (!query) { searchResults.innerHTML = ''; return; }
  const results = searchFoods(query);

  let html = '';
  if (results.length === 0) {
    html += `<div class="no-result">Keine Treffer in der Datenbank.</div>`;
  } else {
    html += results.map(f => `
      <div class="food-item" data-name="${escapeAttr(f.name)}">
        <div class="food-item-main">
          <div class="food-name">${escapeHtml(f.name)}</div>
          <div class="food-meta">${f.kcal} kcal · ${escapeHtml(f.einheit)} · ${healthDot(f.health)}</div>
        </div>
        <input type="number" class="qty" min="0.25" step="0.25" value="1" inputmode="decimal" />
        <button class="add-btn btn primary small">+</button>
      </div>
    `).join('');
  }
  html += `
    <button id="askAiBtn" class="btn small ghost full-width">
      🤖 „${escapeHtml(query)}“ per KI hinzufügen
    </button>
  `;
  searchResults.innerHTML = html;

  searchResults.querySelectorAll('.food-item').forEach(row => {
    row.querySelector('.add-btn').addEventListener('click', () => {
      const name = row.dataset.name;
      const qty = Number(row.querySelector('.qty').value) || 1;
      const food = allFoods().find(f => f.name === name);
      if (!food) return;
      addFoodToMeal(food, qty);
    });
  });

  const askBtn = document.getElementById('askAiBtn');
  if (askBtn) askBtn.addEventListener('click', () => askAiForFood(query));
}

function addFoodToMeal(food, qty) {
  addToHistory({
    name: qty === 1 ? food.name : `${qty}× ${food.name}`,
    portion: `${qty} × ${food.einheit}`,
    kcal: Math.round(food.kcal * qty),
    protein_g: round1(food.p * qty),
    carbs_g: round1(food.c * qty),
    fat_g: round1(food.f * qty),
    health: food.health,
  }, currentMeal);
  flashAdded(food.name);
}

function flashAdded(name) {
  const banner = document.createElement('div');
  banner.className = 'flash-banner';
  banner.textContent = `✓ ${name} hinzugefügt`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 1500);
}

// ===== KI Food Lookup =====
async function askAiForFood(query) {
  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Bitte zuerst API-Key in Einstellungen eintragen.');
    openSettings();
    return;
  }
  const btn = document.getElementById('askAiBtn');
  btn.textContent = '🤖 Frage KI …';
  btn.disabled = true;

  try {
    const food = await fetchFoodFromAi(query, apiKey, getModel());
    // Cache in custom foods
    const custom = loadCustomFoods();
    if (!custom.find(f => normalize(f.name) === normalize(food.name))) {
      custom.push(food);
      saveCustomFoods(custom);
    }
    foodSearch.value = food.name;
    renderSearchResults();
  } catch (err) {
    btn.textContent = `Fehler: ${err.message}`;
    btn.disabled = false;
  }
}

async function fetchFoodFromAi(query, apiKey, model) {
  const body = {
    model,
    max_tokens: 400,
    system: `Du bist Ernährungsdatenbank. Antworte AUSSCHLIESSLICH mit JSON in genau diesem Schema:
{"name":"deutscher Name","einheit":"sinnvolle Einheit (z.B. 'Stück', 'Scheibe', 'Portion (200g)')","kcal":150,"p":5,"c":20,"f":3,"health":6,"cat":"Kategorie"}
Werte pro EINER Einheit. health 1-10 (1=sehr ungesund, 10=sehr gesund). Kein Markdown, kein erklärender Text.`,
    messages: [{ role: 'user', content: `Nährwerte für: ${query}` }],
  };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    try { throw new Error(JSON.parse(txt).error?.message || r.statusText); }
    catch { throw new Error(r.statusText); }
  }
  const data = await r.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '';
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const parsed = JSON.parse(clean);
  return {
    name: parsed.name || query,
    einheit: parsed.einheit || 'Portion',
    kcal: Number(parsed.kcal) || 0,
    p: Number(parsed.p) || 0,
    c: Number(parsed.c) || 0,
    f: Number(parsed.f) || 0,
    health: Number(parsed.health) || 5,
    cat: parsed.cat || 'KI',
  };
}

// ===== Photo capture =====
const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const previewWrap = document.getElementById('previewWrap');
const preview = document.getElementById('preview');

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const resized = await resizeImage(e.target.result, 1280);
    currentImage = { base64: resized.split(',')[1], mediaType: 'image/jpeg' };
    preview.src = resized;
    previewWrap.hidden = false;
  };
  reader.readAsDataURL(file);
}
cameraInput.addEventListener('change', e => handleFile(e.target.files[0]));
galleryInput.addEventListener('change', e => handleFile(e.target.files[0]));

function resizeImage(dataUrl, maxDim) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

// ===== Photo Analyze =====
document.getElementById('analyzeBtn').addEventListener('click', async () => {
  const apiKey = getApiKey();
  if (!apiKey) { alert('Bitte zuerst API-Key in Einstellungen eintragen.'); openSettings(); return; }
  if (!currentImage) return;

  const resultSection = document.getElementById('resultSection');
  const loading = document.getElementById('loading');
  const result = document.getElementById('result');

  resultSection.hidden = false;
  result.innerHTML = '';
  loading.hidden = false;

  const userHint = document.getElementById('photoHint').value.trim();
  try {
    const data = await analyzeImage(currentImage, userHint, apiKey, getModel());
    renderPhotoResult(data);
  } catch (err) {
    result.innerHTML = `<div class="error">Fehler: ${escapeHtml(err.message)}</div>`;
  } finally {
    loading.hidden = true;
  }
});

async function analyzeImage(image, hint, apiKey, model) {
  const systemPrompt = `Du bist Ernährungsexperte. Schätze die Speise auf dem Foto.
Antworte AUSSCHLIESSLICH mit gültigem JSON:
{"name":"deutscher Name","portion":"Portionsbeschreibung","kcal":450,"protein_g":25,"carbs_g":50,"fat_g":15,"health":5,"confidence":"hoch|mittel|niedrig","note":"kurze Bemerkung"}
health: 1 (sehr ungesund) - 10 (sehr gesund). Kein Markdown, kein erklärender Text.`;

  const userText = hint ? `Schätze die Kalorien. Hinweis: ${hint}` : `Schätze die Kalorien.`;
  const body = {
    model, max_tokens: 1024, system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: userText },
      ],
    }],
  };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    try { throw new Error(JSON.parse(t).error?.message || r.statusText); }
    catch { throw new Error(r.statusText); }
  }
  const data = await r.json();
  const text = data.content?.find(b => b.type === 'text')?.text || '';
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  return JSON.parse(clean);
}

function renderPhotoResult(data) {
  const result = document.getElementById('result');
  result.innerHTML = `
    <div class="result-card">
      <div class="result-name">${escapeHtml(data.name || 'Unbekannt')}</div>
      <div class="result-portion">${escapeHtml(data.portion || '')}</div>
      <div class="kcal-big">${Math.round(data.kcal || 0)} kcal</div>
      <div class="macros">
        <div class="macro"><div class="macro-label">Eiweiß</div><div class="macro-value">${Math.round(data.protein_g || 0)} g</div></div>
        <div class="macro"><div class="macro-label">Kohlenh.</div><div class="macro-value">${Math.round(data.carbs_g || 0)} g</div></div>
        <div class="macro"><div class="macro-label">Fett</div><div class="macro-value">${Math.round(data.fat_g || 0)} g</div></div>
      </div>
      <div class="health-row">Gesundheit: ${healthBadge(data.health || 5)}</div>
      ${data.note ? `<div class="confidence">${escapeHtml(data.note)} (Sicherheit: ${escapeHtml(data.confidence || '–')})</div>` : ''}
      <button class="btn primary full" id="saveResultBtn">✓ Zu „${escapeHtml(currentMeal)}“ hinzufügen</button>
    </div>
  `;
  document.getElementById('saveResultBtn').addEventListener('click', (ev) => {
    addToHistory({
      name: data.name,
      portion: data.portion,
      kcal: Math.round(data.kcal || 0),
      protein_g: Math.round(data.protein_g || 0),
      carbs_g: Math.round(data.carbs_g || 0),
      fat_g: Math.round(data.fat_g || 0),
      health: data.health || 5,
    }, currentMeal);
    ev.target.textContent = '✓ Hinzugefügt';
    ev.target.disabled = true;
  });
}

// ===== History =====
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(items) { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); }
function todayKey() { return new Date().toISOString().slice(0, 10); }

function addToHistory(data, mealType) {
  if (!mealType) { alert('Bitte zuerst Mahlzeit auswählen.'); return; }
  const items = loadHistory();
  items.push({
    id: Date.now() + Math.random(),
    date: todayKey(),
    meal: mealType,
    name: data.name,
    portion: data.portion || '',
    kcal: Math.round(data.kcal || 0),
    protein_g: Number(data.protein_g) || 0,
    carbs_g: Number(data.carbs_g) || 0,
    fat_g: Number(data.fat_g) || 0,
    health: Number(data.health) || 5,
  });
  saveHistory(items);
  renderAll();
}

function todayItems() {
  return loadHistory().filter(i => i.date === todayKey());
}

function renderHistory() {
  const container = document.getElementById('mealsGrouped');
  const items = todayItems();

  if (items.length === 0) {
    container.innerHTML = '<p class="hint" style="text-align:center">Noch nichts erfasst</p>';
    return;
  }

  const byMeal = {};
  for (const m of MEAL_ORDER) byMeal[m] = [];
  for (const it of items) {
    if (!byMeal[it.meal]) byMeal[it.meal] = [];
    byMeal[it.meal].push(it);
  }

  let html = '';
  for (const meal of MEAL_ORDER) {
    const group = byMeal[meal];
    if (!group || group.length === 0) continue;
    const kcalSum = group.reduce((s, i) => s + i.kcal, 0);
    const pSum = group.reduce((s, i) => s + i.protein_g, 0);
    const cSum = group.reduce((s, i) => s + i.carbs_g, 0);
    const fSum = group.reduce((s, i) => s + i.fat_g, 0);
    const healthAvg = avgHealth(group);

    html += `
      <div class="meal-group">
        <div class="meal-header">
          <span class="meal-dot" style="background:${MEAL_COLORS[meal]}"></span>
          <span class="meal-title">${escapeHtml(meal)}</span>
          <span class="meal-kcal">${kcalSum} kcal</span>
        </div>
        <ul class="meal-items">
          ${group.map(i => `
            <li>
              <span class="hist-name">${escapeHtml(i.name)}</span>
              <span class="hist-kcal">${i.kcal} kcal</span>
              <button class="hist-delete" data-id="${i.id}" title="Entfernen">×</button>
            </li>
          `).join('')}
        </ul>
        <div class="meal-footer">
          <div class="meal-macros-mini">
            ${pieChart([
              { value: pSum * 4, color: MACRO_COLORS.protein },
              { value: cSum * 4, color: MACRO_COLORS.carbs },
              { value: fSum * 9, color: MACRO_COLORS.fat },
            ], 60)}
            <div class="macro-legend">
              <span><i style="background:${MACRO_COLORS.protein}"></i>E ${Math.round(pSum)}g</span>
              <span><i style="background:${MACRO_COLORS.carbs}"></i>K ${Math.round(cSum)}g</span>
              <span><i style="background:${MACRO_COLORS.fat}"></i>F ${Math.round(fSum)}g</span>
            </div>
          </div>
          <div class="meal-health">${healthBadge(healthAvg)}</div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.hist-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      saveHistory(loadHistory().filter(i => String(i.id) !== id));
      renderAll();
    });
  });
}

document.getElementById('clearTodayBtn').addEventListener('click', () => {
  if (!confirm('Alle Einträge von heute löschen?')) return;
  saveHistory(loadHistory().filter(i => i.date !== todayKey()));
  renderAll();
});

// ===== Steps =====
const stepsInput = document.getElementById('stepsInput');

function loadSteps() {
  try { return JSON.parse(localStorage.getItem(STEPS_KEY)) || {}; }
  catch { return {}; }
}
function saveStepsMap(map) { localStorage.setItem(STEPS_KEY, JSON.stringify(map)); }
function getTodaySteps() { return Number(loadSteps()[todayKey()] || 0); }

stepsInput.addEventListener('input', () => {
  const map = loadSteps();
  map[todayKey()] = Number(stepsInput.value) || 0;
  saveStepsMap(map);
  renderBalance();
});

// ===== Calorie Math =====
function calcBMR(cfg) {
  if (!cfg.weight || !cfg.height || !cfg.age || !cfg.sex) return null;
  const base = 10 * cfg.weight + 6.25 * cfg.height - 5 * cfg.age;
  return cfg.sex === 'w' ? base - 161 : base + 5;
}
function calcDailyNeed(cfg) {
  const bmr = calcBMR(cfg);
  if (bmr == null) return null;
  return bmr * (cfg.activity || 1.375);
}
function stepsToKcal(steps, weight) {
  if (!steps) return 0;
  return steps * 0.04 * ((weight || 70) / 70);
}

function avgHealth(items) {
  const totalKcal = items.reduce((s, i) => s + i.kcal, 0);
  if (totalKcal === 0) return items.length ? items[0].health : 5;
  const weighted = items.reduce((s, i) => s + i.health * i.kcal, 0);
  return weighted / totalKcal;
}

// ===== Balance =====
function renderBalance() {
  const cfg = loadConfig();
  const need = calcDailyNeed(cfg);
  const steps = getTodaySteps();
  const burned = Math.round(stepsToKcal(steps, cfg.weight));
  const items = todayItems();
  const eaten = items.reduce((s, i) => s + i.kcal, 0);

  document.getElementById('profileMissing').hidden = need != null;
  document.getElementById('bdNeed').textContent = need != null ? `${Math.round(need)} kcal` : '–';
  document.getElementById('bdBurned').textContent = (steps || need != null) ? `+${burned} kcal` : '–';
  document.getElementById('bdEaten').textContent = `${eaten} kcal`;

  const saldoEl = document.getElementById('bdSaldo');
  const saldoHint = document.getElementById('bdSaldoHint');
  saldoEl.className = 'bl-value-big';

  if (need == null) {
    saldoEl.textContent = '–';
    saldoHint.textContent = 'Körperdaten in Einstellungen ergänzen';
  } else {
    const total = need + burned;
    const remaining = Math.round(total - eaten);
    if (remaining < -100) saldoEl.classList.add('over');
    else if (remaining < 100) saldoEl.classList.add('warn');
    saldoEl.textContent = remaining >= 0 ? `${remaining} kcal frei` : `${Math.abs(remaining)} kcal über`;
    saldoHint.textContent = `Bedarf ${Math.round(need)} + ${burned} Schritte − ${eaten} gegessen`;
  }

  renderDayCharts(items);
}

function renderDayCharts(items) {
  const chartsWrap = document.getElementById('dayCharts');
  const banner = document.getElementById('dayHealth');
  if (items.length === 0) {
    chartsWrap.hidden = true;
    banner.hidden = true;
    return;
  }
  chartsWrap.hidden = false;

  // Verteilung nach Mahlzeit (kcal)
  const mealKcal = {};
  for (const m of MEAL_ORDER) mealKcal[m] = 0;
  for (const i of items) mealKcal[i.meal] = (mealKcal[i.meal] || 0) + i.kcal;

  const mealSlices = MEAL_ORDER
    .map(m => ({ value: mealKcal[m] || 0, color: MEAL_COLORS[m], label: m }))
    .filter(s => s.value > 0);

  document.getElementById('mealDistChart').innerHTML = `
    ${pieChart(mealSlices, 120)}
    <div class="chart-legend">
      ${mealSlices.map(s => `
        <span><i style="background:${s.color}"></i>${escapeHtml(s.label.split(' (')[0])} ${s.value}</span>
      `).join('')}
    </div>
  `;

  // Tages-Makros
  const pSum = items.reduce((s, i) => s + i.protein_g, 0);
  const cSum = items.reduce((s, i) => s + i.carbs_g, 0);
  const fSum = items.reduce((s, i) => s + i.fat_g, 0);

  document.getElementById('dayMacroChart').innerHTML = `
    ${pieChart([
      { value: pSum * 4, color: MACRO_COLORS.protein },
      { value: cSum * 4, color: MACRO_COLORS.carbs },
      { value: fSum * 9, color: MACRO_COLORS.fat },
    ], 120)}
    <div class="chart-legend">
      <span><i style="background:${MACRO_COLORS.protein}"></i>Eiweiß ${Math.round(pSum)}g</span>
      <span><i style="background:${MACRO_COLORS.carbs}"></i>Kohlenh. ${Math.round(cSum)}g</span>
      <span><i style="background:${MACRO_COLORS.fat}"></i>Fett ${Math.round(fSum)}g</span>
    </div>
  `;

  // Gesamt-Gesundheit
  const h = avgHealth(items);
  banner.hidden = false;
  banner.innerHTML = `Gesundheit heute: ${healthBadge(h)} <span class="health-text">${healthText(h)}</span>`;
}

// ===== Pie Chart =====
function pieChart(slices, size = 100) {
  const filtered = slices.filter(s => s.value > 0);
  const total = filtered.reduce((s, x) => s + x.value, 0);
  if (total === 0) return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="#eee"/></svg>`;

  // Single slice → full circle
  if (filtered.length === 1) {
    const s = filtered[0];
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${s.color}"/></svg>`;
  }

  const radius = size / 2 - 2;
  const cx = size / 2, cy = size / 2;
  let cumulative = 0;
  const paths = filtered.map(item => {
    const startAngle = (cumulative / total) * 2 * Math.PI;
    cumulative += item.value;
    const endAngle = (cumulative / total) * 2 * Math.PI;
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const x1 = cx + radius * Math.sin(startAngle);
    const y1 = cy - radius * Math.cos(startAngle);
    const x2 = cx + radius * Math.sin(endAngle);
    const y2 = cy - radius * Math.cos(endAngle);
    return `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${largeArc},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${item.color}" />`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}</svg>`;
}

function healthBadge(score) {
  const s = Math.round(score);
  let cls = 'h-mid';
  if (s >= 7) cls = 'h-good';
  else if (s <= 3) cls = 'h-bad';
  return `<span class="health-badge ${cls}">${s}/10</span>`;
}
function healthDot(score) {
  const s = Math.round(score);
  let color = '#f59e0b';
  if (s >= 7) color = '#1f7a3a';
  else if (s <= 3) color = '#b00020';
  return `<span class="health-inline" style="background:${color}">${s}</span>`;
}
function healthText(s) {
  if (s >= 8) return 'sehr gesund';
  if (s >= 6.5) return 'gesund';
  if (s >= 4.5) return 'okay';
  if (s >= 3) return 'eher ungesund';
  return 'ungesund';
}

// ===== Utilities =====
function round1(x) { return Math.round(x * 10) / 10; }
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

function renderAll() {
  renderHistory();
  renderBalance();
}

// ===== Init =====
stepsInput.value = getTodaySteps() || '';
renderAll();

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
