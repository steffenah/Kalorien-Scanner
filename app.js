// ===== State =====
const STORE_KEY = 'kalorien-config';
const HISTORY_KEY = 'kalorien-history';

let currentImage = null; // { dataUrl, base64, mediaType }

// ===== Settings =====
function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch { return {}; }
}

function saveConfig(cfg) {
  localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
}

function getApiKey() {
  return loadConfig().apiKey || '';
}

function getModel() {
  return loadConfig().model || 'claude-haiku-4-5';
}

// ===== Settings Dialog =====
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');

document.getElementById('settingsBtn').addEventListener('click', () => {
  const cfg = loadConfig();
  apiKeyInput.value = cfg.apiKey || '';
  modelSelect.value = cfg.model || 'claude-haiku-4-5';
  settingsDialog.showModal();
});

document.getElementById('cancelSettings').addEventListener('click', () => {
  settingsDialog.close();
});

document.getElementById('saveSettings').addEventListener('click', (e) => {
  e.preventDefault();
  saveConfig({ apiKey: apiKeyInput.value.trim(), model: modelSelect.value });
  settingsDialog.close();
});

// Prompt for key on first visit
if (!getApiKey()) {
  setTimeout(() => {
    apiKeyInput.value = '';
    modelSelect.value = 'claude-haiku-4-5';
    settingsDialog.showModal();
  }, 300);
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
    const dataUrl = e.target.result;
    // Downscale to keep API cost & latency in check
    const resized = await resizeImage(dataUrl, 1280);
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
    settingsDialog.showModal();
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
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.base64,
          },
        },
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

  // Strip potential markdown code fences just in case
  let json = textBlock.text.trim();
  json = json.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error('Antwort konnte nicht als JSON gelesen werden:\n' + json.slice(0, 200));
  }
  return parsed;
}

// ===== Render Result =====
function renderResult(data) {
  const html = `
    <div class="result-card">
      <div class="result-name">${escapeHtml(data.name || 'Unbekannt')}</div>
      <div class="result-portion">${escapeHtml(data.portion || '')}</div>
      <div class="kcal-big">${Math.round(data.kcal || 0)} kcal</div>
      <div class="macros">
        <div class="macro">
          <div class="macro-label">Eiweiß</div>
          <div class="macro-value">${Math.round(data.protein_g || 0)} g</div>
        </div>
        <div class="macro">
          <div class="macro-label">Kohlenh.</div>
          <div class="macro-value">${Math.round(data.carbs_g || 0)} g</div>
        </div>
        <div class="macro">
          <div class="macro-label">Fett</div>
          <div class="macro-value">${Math.round(data.fat_g || 0)} g</div>
        </div>
      </div>
      ${data.note ? `<div class="confidence">${escapeHtml(data.note)} (Sicherheit: ${escapeHtml(data.confidence || '–')})</div>` : ''}
      <div class="result-actions">
        <button class="btn primary" id="saveResultBtn">✓ Zu heute hinzufügen</button>
      </div>
    </div>
  `;
  result.innerHTML = html;

  document.getElementById('saveResultBtn').addEventListener('click', () => {
    addToHistory(data);
    document.getElementById('saveResultBtn').textContent = '✓ Hinzugefügt';
    document.getElementById('saveResultBtn').disabled = true;
  });
}

// ===== History =====
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

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
}

function renderHistory() {
  const today = todayKey();
  const items = loadHistory().filter(i => i.date === today);
  const list = document.getElementById('history');
  const total = items.reduce((s, i) => s + (i.kcal || 0), 0);

  document.getElementById('dailyTotal').textContent = `${total} kcal`;

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
    });
  });
}

document.getElementById('clearTodayBtn').addEventListener('click', () => {
  if (!confirm('Alle Einträge von heute löschen?')) return;
  const today = todayKey();
  saveHistory(loadHistory().filter(i => i.date !== today));
  renderHistory();
});

renderHistory();

// ===== Utilities =====
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
