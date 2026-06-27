// ===== Storage Keys =====
const STORE_KEY = 'kalorien-config';
const HISTORY_KEY = 'kalorien-history';
const STEPS_KEY = 'kalorien-steps';

let currentImage = null;

// ===== Config =====
function loadConfig() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { return {}; }
}
function saveConfig(cfg) { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); }
function getApiKey() { return loadConfig().apiKey || ''; }
function getModel() { return loadConfig().model || 'claude-haiku-4-5'; }

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
  renderBalance();
});

// First-run: open settings if API key missing
if (!getApiKey()) {
  setTimeout(openSettings, 300);
}

// ===== Calorie Math =====
function calcBMR(cfg) {
  // Mifflin-St-Jeor
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
  const w = weight || 70;
  return steps * 0.04 * (w / 70);
}

// ===== Image Capture =====
const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const previewWrap = document.getElementById('previewWrap');
const preview = document.getElementById('preview');

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const resized = await resizeImage(e.target.result, 1280);
    currentImage = {
      dataUrl: resized,
      base64: resized.split(',')[1],
      mediaType: 'image/jpeg',
    };
    preview.src = resized;
    previewWrap.hidden = false;
    previewWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  reader.readAsDataURL(file);
}

cameraInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
galleryInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

function resizeImage(dataUrl, maxDim) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataUrl;
  });
}

// ===== Analyze =====
const analyzeBtn = document.getElementById('analyzeBtn');
const resultSection = document.getElementById('resultSection');
const loading = document.getElementById('loading');
const result = document.getElementById('result');

analyzeBtn.addEventListener('click', async () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    alert('Bitte zuerst API-Key in Einstellungen eintragen.');
    openSettings();
    return;
  }
  if (!currentImage) return;

  resultSection.hidden = false;
  result.innerHTML = '';
  loading.hidden = false;
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const userHint = document.getElementById('hint').value.trim();

  try {
    const data = await analyzeImage(currentImage, userHint, apiKey, getModel());
    renderResult(data);
  } catch (err) {
    result.innerHTML = `<div class="error">Fehler: ${escapeHtml(err.message)}</div>`;
  } finally {
    loading.hidden = true;
  }
});

async function analyzeImage(image, hint, apiKey, model) {
  const systemPrompt = `Du bist ein Ernährungsexperte. Analysiere das Foto und schätze die Nährwerte der gezeigten Speise.
Antworte AUSSCHLIESSLICH mit gültigem JSON in genau diesem Schema:
{
  "name": "Bezeichnung der Speise auf Deutsch",
  "portion": "Geschätzte Portionsbeschreibung (z.B. '1 Teller, ca. 350g')",
  "kcal": 450,
  "protein_g": 25,
  "carbs_g": 50,
  "fat_g": 15,
  "confidence": "hoch" | "mittel" | "niedrig",
  "note": "Kurze Bemerkung zur Schätzung oder Annahme"
}
Keine Markdown-Code-Blöcke, kein erklärender Text außerhalb des JSON.`;

  const userText = hint
    ? `Schätze die Kalorien dieser Speise. Hinweis vom Nutzer: ${hint}`
    : `Schätze die Kalorien dieser Speise.`;

  const body = {
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
        { type: 'text', text: userText },
      ],
    }],
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let msg = `${response.status} ${response.statusText}`;
    try {
      const err = JSON.parse(text);
      if (err.error?.message) msg = err.error.message;
    } catch {}
    throw new Error(msg);
  }

  const data = await response.json();
  const textBlock = data.content?.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Keine Antwort vom Modell erhalten.');

  let json = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('Antwort konnte nicht als JSON gelesen werden:\n' + json.slice(0, 200));
  }
}

// ===== Render Result =====
function renderResult(data) {
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
      ${data.note ? `<div class="confidence">${escapeHtml(data.note)} (Sicherheit: ${escapeHtml(data.confidence || '–')})</div>` : ''}
      <div class="result-actions">
        <button class="btn primary" id="saveResultBtn">✓ Zu heute hinzufügen</button>
      </div>
    </div>
  `;
  document.getElementById('saveResultBtn').addEventListener('click', (ev) => {
    addToHistory(data);
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

function addToHistory(data) {
  const items = loadHistory();
  items.push({
    id: Date.now(),
    date: todayKey(),
    name: data.name,
    kcal: Math.round(data.kcal || 0),
    protein_g: Math.round(data.protein_g || 0),
    carbs_g: Math.round(data.carbs_g || 0),
    fat_g: Math.round(data.fat_g || 0),
  });
  saveHistory(items);
  renderHistory();
  renderBalance();
}

function renderHistory() {
  const today = todayKey();
  const items = loadHistory().filter(i => i.date === today);
  const list = document.getElementById('history');

  if (items.length === 0) {
    list.innerHTML = '<li style="color:#999;justify-content:center;">Noch nichts erfasst</li>';
    return;
  }

  list.innerHTML = items.map(i => `
    <li>
      <span class="hist-name">${escapeHtml(i.name)}</span>
      <span class="hist-kcal">${i.kcal} kcal</span>
      <button class="hist-delete" data-id="${i.id}" title="Entfernen">×</button>
    </li>
  `).join('');

  list.querySelectorAll('.hist-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      saveHistory(loadHistory().filter(i => i.id !== id));
      renderHistory();
      renderBalance();
    });
  });
}

document.getElementById('clearTodayBtn').addEventListener('click', () => {
  if (!confirm('Alle Einträge von heute löschen?')) return;
  const today = todayKey();
  saveHistory(loadHistory().filter(i => i.date !== today));
  renderHistory();
  renderBalance();
});

// ===== Steps =====
const stepsInput = document.getElementById('stepsInput');

function loadSteps() {
  try { return JSON.parse(localStorage.getItem(STEPS_KEY)) || {}; }
  catch { return {}; }
}
function saveSteps(map) { localStorage.setItem(STEPS_KEY, JSON.stringify(map)); }

function getTodaySteps() {
  return Number(loadSteps()[todayKey()] || 0);
}

stepsInput.addEventListener('input', () => {
  const map = loadSteps();
  const v = Number(stepsInput.value) || 0;
  map[todayKey()] = v;
  saveSteps(map);
  renderBalance();
});

// ===== Balance =====
function renderBalance() {
  const cfg = loadConfig();
  const need = calcDailyNeed(cfg);
  const steps = getTodaySteps();
  const burnedFromSteps = Math.round(stepsToKcal(steps, cfg.weight));
  const eaten = loadHistory()
    .filter(i => i.date === todayKey())
    .reduce((s, i) => s + (i.kcal || 0), 0);

  const profileOk = need != null;
  document.getElementById('profileMissing').hidden = profileOk;

  document.getElementById('bdNeed').textContent = profileOk ? `${Math.round(need)} kcal` : '–';
  document.getElementById('bdBurned').textContent = profileOk
    ? `+${burnedFromSteps} kcal`
    : (steps ? `+${burnedFromSteps} kcal` : '–');
  document.getElementById('bdEaten').textContent = `${eaten} kcal`;

  // Saldo: positiv = noch verfügbar, negativ = überzogen
  const saldoEl = document.getElementById('bdSaldo');
  const saldoHint = document.getElementById('bdSaldoHint');

  if (!profileOk) {
    saldoEl.textContent = '–';
    saldoEl.className = 'bl-value-big';
    saldoHint.textContent = 'Körperdaten in Einstellungen ergänzen';
    return;
  }

  const totalAvailable = need + burnedFromSteps;
  const remaining = Math.round(totalAvailable - eaten);

  saldoEl.className = 'bl-value-big';
  if (remaining < -100) saldoEl.classList.add('over');
  else if (remaining < 100) saldoEl.classList.add('warn');

  if (remaining >= 0) {
    saldoEl.textContent = `${remaining} kcal frei`;
    saldoHint.textContent = `Bedarf ${Math.round(need)} + ${burnedFromSteps} Schritte − ${eaten} gegessen`;
  } else {
    saldoEl.textContent = `${Math.abs(remaining)} kcal über`;
    saldoHint.textContent = `Bedarf ${Math.round(need)} + ${burnedFromSteps} Schritte − ${eaten} gegessen`;
  }
}

// Initial render
stepsInput.value = getTodaySteps() || '';
renderHistory();
renderBalance();

// ===== Utilities =====
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
