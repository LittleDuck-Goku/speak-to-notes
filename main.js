/**
 * Speak to Notes — Main Application (v2: Notion + Gemini AI)
 */

import './index.css';
import { SpeechRecognizer } from './src/speechRecognition.js';

// ---- State ----
let currentMode = 'voice';
let transcriptBuffer = '';
let currentEntry = null;

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

const outputTitle = document.getElementById('output-title');
const outputDatetime = document.getElementById('output-datetime');
const outputDescription = document.getElementById('output-description');
const outputPriority = document.getElementById('output-priority');
const outputEffort = document.getElementById('output-effort');
const outputTags = document.getElementById('output-tags');

const btnSendNotion = document.getElementById('btn-send-notion');
const sendBtnText = document.getElementById('send-btn-text');
const btnNewEntry = document.getElementById('btn-new-entry');
const btnNewEntrySuccess = document.getElementById('btn-new-entry-success');

const successLink = document.getElementById('success-link');
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

    currentEntry = data.entry;
    renderOutput(currentEntry);

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
function renderOutput(entry) {
  // Title
  outputTitle.textContent = entry.aufgabenName || 'Neue Aufgabe';

  // Date
  if (entry.faelligkeitsdatum) {
    outputDatetime.innerHTML = formatDateDisplay(entry.faelligkeitsdatum);
    outputDatetime.classList.remove('output-field__not-specified');
  } else {
    outputDatetime.textContent = 'Nicht angegeben';
    outputDatetime.classList.add('output-field__not-specified');
  }

  // Description
  outputDescription.textContent = entry.beschreibung || 'Keine Beschreibung.';

  // Priority
  outputPriority.innerHTML = `<span class="badge badge--${entry.prioritaet.toLowerCase()}">${entry.prioritaet}</span>`;

  // Effort
  outputEffort.innerHTML = `<span class="badge badge--${entry.aufwand.toLowerCase()}">${entry.aufwand}</span>`;

  // Tags
  outputTags.innerHTML = '';
  if (entry.aufgabenTyp && entry.aufgabenTyp.length > 0) {
    entry.aufgabenTyp.forEach(tag => {
      const el = document.createElement('span');
      el.className = `tag tag--${tag.toLowerCase()}`;
      el.textContent = tag;
      outputTags.appendChild(el);
    });
  } else {
    outputTags.innerHTML = '<span class="output-field__not-specified">Keine Tags</span>';
  }
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
  if (!currentEntry) return;

  btnSendNotion.disabled = true;
  btnSendNotion.classList.add('sending');
  sendBtnText.textContent = 'Wird gesendet…';

  try {
    const response = await fetch('/api/notion/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: currentEntry })
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

    if (data.notionUrl) {
      successLink.href = data.notionUrl;
      successLink.style.display = '';
    } else {
      successLink.style.display = 'none';
    }

    successSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Aufgabe in Notion erstellt! ✨', 'success');

  } catch (err) {
    showToast('Fehler: ' + err.message, 'error');
  } finally {
    btnSendNotion.disabled = false;
    btnSendNotion.classList.remove('sending');
    sendBtnText.textContent = 'An Notion senden';
  }
});

// ---- New Entry ----
function resetAll() {
  currentEntry = null;
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
