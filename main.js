/**
 * Speak to Notes — Main Application (v2: Notion + Gemini AI)
 */

import './index.css';
import { SpeechRecognizer } from './src/speechRecognition.js';

// ---- State ----
let currentMode = 'voice';
let transcriptBuffer = '';
let currentEntries = [];

// ---- DOM Elements ----
const btnVoiceMode = document.getElementById('btn-voice-mode');
const btnTextMode = document.getElementById('btn-text-mode');
const voiceInputArea = document.getElementById('voice-input-area');
const textInputArea = document.getElementById('text-input-area');
const textInput = document.getElementById('text-input');

const micBtn = document.getElementById('mic-btn');
const micRipple = document.getElementById('mic-ripple');
const micLabel = document.getElementById('mic-label');
const transcriptPreview = document.getElementById('transcript-preview');
const transcriptText = document.getElementById('transcript-text');

const processBtn = document.getElementById('process-btn');
const processBtnText = processBtn.querySelector('.process-btn__text');
const processBtnIcon = processBtn.querySelector('.process-btn__icon');

const inputSection = document.getElementById('input-section');
const outputSection = document.getElementById('output-section');
const successSection = document.getElementById('success-section');

const outputTasks = document.getElementById('output-tasks');
const taskCountBadge = document.getElementById('task-count-badge');

const btnSendNotion = document.getElementById('btn-send-notion');
const sendBtnText = document.getElementById('send-btn-text');
const btnNewEntry = document.getElementById('btn-new-entry');
const btnNewEntrySuccess = document.getElementById('btn-new-entry-success');

const successTitle = document.getElementById('success-title');
const successLinks = document.getElementById('success-links');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// ---- Speech Recognition ----
const recognizer = new SpeechRecognizer({
  lang: 'de-DE',
  onResult: (text) => {
    transcriptBuffer += (transcriptBuffer ? ' ' : '') + text;
    transcriptText.textContent = transcriptBuffer;
    transcriptPreview.classList.add('visible');
    updateProcessButton();
  },
  onInterim: (text) => {
    transcriptText.textContent = transcriptBuffer + (transcriptBuffer ? ' ' : '') + text;
    transcriptPreview.classList.add('visible');
  },
  onEnd: () => {
    setRecordingUI(false);
    updateProcessButton();
  },
  onError: (error) => {
    setRecordingUI(false);
    if (error === 'not-supported') {
      micLabel.textContent = 'Spracherkennung nicht unterstützt';
      micBtn.disabled = true;
    } else if (error === 'not-allowed') {
      micLabel.textContent = 'Mikrofon-Zugriff verweigert';
    } else {
      micLabel.textContent = 'Fehler bei der Spracherkennung';
    }
  }
});

// ---- Mode Toggle ----
btnVoiceMode.addEventListener('click', () => switchMode('voice'));
btnTextMode.addEventListener('click', () => switchMode('text'));

function switchMode(mode) {
  currentMode = mode;
  btnVoiceMode.classList.toggle('input-toggle__btn--active', mode === 'voice');
  btnTextMode.classList.toggle('input-toggle__btn--active', mode === 'text');
  voiceInputArea.classList.toggle('hidden', mode !== 'voice');
  textInputArea.classList.toggle('hidden', mode !== 'text');
  updateProcessButton();
}

// ---- Microphone Button ----
micBtn.addEventListener('click', () => {
  if (recognizer.isRecording) {
    recognizer.stop();
    setRecordingUI(false);
  } else {
    transcriptBuffer = '';
    transcriptText.textContent = '';
    transcriptPreview.classList.remove('visible');
    const started = recognizer.start();
    if (started) setRecordingUI(true);
  }
});

function setRecordingUI(recording) {
  micBtn.classList.toggle('recording', recording);
  micRipple.classList.toggle('active', recording);
  micLabel.classList.toggle('recording', recording);
  micLabel.textContent = recording ? 'Aufnahme läuft… Tippe zum Stoppen' : 'Klicke zum Aufnehmen';
}

// ---- Text Input Listener ----
textInput.addEventListener('input', updateProcessButton);

function updateProcessButton() {
  const hasContent = currentMode === 'voice'
    ? transcriptBuffer.trim().length > 0
    : textInput.value.trim().length > 0;
  processBtn.disabled = !hasContent;
}

// ---- Process Button: Send to Gemini AI ----
processBtn.addEventListener('click', async () => {
  const rawText = currentMode === 'voice' ? transcriptBuffer : textInput.value;
  if (!rawText.trim()) return;

  // Stop recording if active
  if (recognizer.isRecording) {
    recognizer.stop();
    setRecordingUI(false);
  }

  // Processing state
  processBtn.classList.add('processing');
  processBtn.disabled = true;
  processBtnText.textContent = 'KI verarbeitet…';

  try {
    const response = await fetch('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: rawText,
        currentDate: new Date().toISOString().split('T')[0]
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Unbekannter Fehler');
    }

    currentEntries = data.entries;
    renderAllEntries(currentEntries);

    // Show output section
    outputSection.classList.remove('hidden');
    outputSection.style.animation = 'none';
    outputSection.offsetHeight;
    outputSection.style.animation = '';
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    showToast('Fehler: ' + err.message, 'error');
  } finally {
    processBtn.classList.remove('processing');
    processBtn.disabled = false;
    processBtnText.textContent = 'Mit KI verarbeiten';
  }
});

// ---- Render Output ----
function renderAllEntries(entries) {
  outputTasks.innerHTML = '';

  // Show/hide task count badge
  if (entries.length > 1) {
    taskCountBadge.textContent = `${entries.length} Aufgaben erkannt`;
    taskCountBadge.classList.remove('hidden');
    sendBtnText.textContent = `Alle ${entries.length} an Notion senden`;
  } else {
    taskCountBadge.classList.add('hidden');
    sendBtnText.textContent = 'An Notion senden';
  }

  entries.forEach((entry, index) => {
    const card = document.createElement('div');
    card.className = 'output-task-card';
    if (entries.length > 1) card.style.animationDelay = `${index * 100}ms`;

    // Build tags HTML
    let tagsHtml = '';
    if (entry.aufgabenTyp && entry.aufgabenTyp.length > 0) {
      tagsHtml = entry.aufgabenTyp
        .map(tag => `<span class="tag tag--${tag.toLowerCase()}">${tag}</span>`)
        .join('');
    } else {
      tagsHtml = '<span class="output-field__not-specified">Keine Tags</span>';
    }

    // Build date HTML
    let dateHtml;
    if (entry.faelligkeitsdatum) {
      dateHtml = formatDateDisplay(entry.faelligkeitsdatum);
    } else {
      dateHtml = '<span class="output-field__not-specified">Nicht angegeben</span>';
    }

    card.innerHTML = `
      ${entries.length > 1 ? `<div class="output-task-card__number">${index + 1}</div>` : ''}
      <div class="output-content">
        <div class="output-field">
          <label class="output-field__label">Aufgaben Name</label>
          <div class="output-field__value output-field__value--title">${entry.aufgabenName || 'Neue Aufgabe'}</div>
        </div>
        <div class="output-field">
          <label class="output-field__label">Fälligkeitsdatum</label>
          <div class="output-field__value">${dateHtml}</div>
        </div>
        <div class="output-field">
          <label class="output-field__label">Beschreibung</label>
          <div class="output-field__value output-field__value--desc">${entry.beschreibung || 'Keine Beschreibung.'}</div>
        </div>
        <div class="output-row">
          <div class="output-field output-field--half">
            <label class="output-field__label">Priorität</label>
            <div class="output-field__value"><span class="badge badge--${entry.prioritaet.toLowerCase()}">${entry.prioritaet}</span></div>
          </div>
          <div class="output-field output-field--half">
            <label class="output-field__label">Aufwand</label>
            <div class="output-field__value"><span class="badge badge--${entry.aufwand.toLowerCase()}">${entry.aufwand}</span></div>
          </div>
        </div>
        <div class="output-field">
          <label class="output-field__label">Aufgaben Typ</label>
          <div class="output-field__value output-field__value--tags">${tagsHtml}</div>
        </div>
      </div>
    `;

    outputTasks.appendChild(card);
  });
}

function formatDateDisplay(datetime) {
  if (!datetime) return '';

  try {
    // Handle both date-only and datetime strings
    let d;
    let hasTime = false;

    if (datetime.includes('T')) {
      d = new Date(datetime);
      hasTime = true;
    } else {
      const [year, month, day] = datetime.split('-').map(Number);
      d = new Date(year, month - 1, day);
    }

    if (isNaN(d.getTime())) return datetime;

    const dayName = d.toLocaleDateString('de-DE', { weekday: 'long' });
    const formatted = d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
    let display = `<span style="font-weight:600">${dayName}</span>, ${formatted}`;

    if (hasTime) {
      const timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      display += ` <span style="opacity:0.5">·</span> <span style="font-weight:600">${timeStr} Uhr</span>`;
    }

    display += `<br/><span style="font-size:0.7rem; opacity:0.35; font-family:monospace">${datetime}</span>`;
    return display;
  } catch {
    return datetime;
  }
}

// ---- Send to Notion ----
btnSendNotion.addEventListener('click', async () => {
  if (!currentEntries.length) return;

  btnSendNotion.disabled = true;
  btnSendNotion.classList.add('sending');
  sendBtnText.textContent = 'Wird gesendet…';

  try {
    const response = await fetch('/api/notion/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: currentEntries })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Notion-Fehler');
    }

    // Show success
    outputSection.classList.add('hidden');
    successSection.classList.remove('hidden');
    successSection.style.animation = 'none';
    successSection.offsetHeight;
    successSection.style.animation = '';

    const count = data.results.length;
    successTitle.textContent = count > 1
      ? `${count} Aufgaben erstellt! ✨`
      : 'Aufgabe erstellt! ✨';
    document.getElementById('success-message').textContent = count > 1
      ? `${count} Einträge wurden erfolgreich in Notion gespeichert.`
      : 'Dein Eintrag wurde erfolgreich in Notion gespeichert.';

    // Render links
    successLinks.innerHTML = '';
    data.results.forEach(result => {
      if (result.notionUrl) {
        const link = document.createElement('a');
        link.className = 'success-link';
        link.href = result.notionUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          ${result.aufgabenName}
        `;
        successLinks.appendChild(link);
      }
    });

    successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(count > 1 ? `${count} Aufgaben in Notion erstellt! ✨` : 'Aufgabe in Notion erstellt! ✨', 'success');

  } catch (err) {
    showToast('Fehler: ' + err.message, 'error');
  } finally {
    btnSendNotion.disabled = false;
    btnSendNotion.classList.remove('sending');
    sendBtnText.textContent = currentEntries.length > 1
      ? `Alle ${currentEntries.length} an Notion senden`
      : 'An Notion senden';
  }
});

// ---- New Entry ----
function resetAll() {
  currentEntries = [];
  transcriptBuffer = '';
  transcriptText.textContent = '';
  transcriptPreview.classList.remove('visible');
  textInput.value = '';
  outputSection.classList.add('hidden');
  successSection.classList.add('hidden');
  processBtn.disabled = true;
  inputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

btnNewEntry.addEventListener('click', resetAll);
btnNewEntrySuccess.addEventListener('click', resetAll);

// ---- Toast ----
function showToast(message, type = 'success') {
  toast.className = `toast toast--${type} visible`;
  toastMessage.textContent = message;
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.className = 'toast hidden', 300);
  }, 3000);
}
