import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@notionhq/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Clients ---
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Models to try in order (fallback chain)
const GEMINI_MODELS = [
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemma-3-4b-it'
];

function buildPrompt(text, currentDate) {
  return `Du bist ein intelligenter Produktivitäts-Assistent. Deine Aufgabe ist es, unstrukturierten Text (oft per Spracheingabe diktiert) zu analysieren und in einen strukturierten Aufgaben-Eintrag umzuwandeln.

Das heutige Datum ist: ${currentDate}

Analysiere den folgenden Text und extrahiere die Informationen für diese Datenbankfelder:

1. **Aufgaben Name**: Ein kurzer, prägnanter Titel (max. 5-7 Wörter)
2. **Fälligkeitsdatum**: Erkenne relative Zeitangaben (morgen, nächsten Dienstag, etc.) und wandle sie in ISO 8601 Format um (YYYY-MM-DDTHH:MM:SS). Falls keine Uhrzeit erkannt wird, gib nur das Datum (YYYY-MM-DD). Falls kein Datum erkennbar ist, setze null.
3. **Beschreibung**: Formuliere den gesamten Inhalt als sauberen, professionellen Fließtext um. Behebe Grammatikfehler, fülle logische Lücken sinnvoll auf.
4. **Priorität**: Bewerte die Dringlichkeit. Erlaubte Werte: "Hoch", "Mittel", "Niedrig". Falls nicht klar, setze "Mittel".
5. **Aufwand**: Schätze den Zeitaufwand. Erlaubte Werte: "Wenig", "Mittel", "Hoch". Falls nicht klar, setze "Mittel".
6. **Aufgaben Typ**: Wähle 1-2 passende Kategorien. Erlaubte Werte: "Arbeit", "Fitness", "Allgemein", "Studium", "Praktikum". Falls nicht klar, setze ["Allgemein"].

Antworte NUR mit validem JSON in diesem exakten Format (keine Markdown-Codeblöcke, kein anderer Text):
{
  "aufgabenName": "string",
  "faelligkeitsdatum": "string oder null",
  "beschreibung": "string",
  "prioritaet": "Hoch|Mittel|Niedrig",
  "aufwand": "Wenig|Mittel|Hoch",
  "aufgabenTyp": ["string"]
}

Eingabetext: "${text.replace(/"/g, '\\"')}"`;
}

// Try multiple Gemini models with fallback
async function callGemini(prompt) {
  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(`Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = result.response;
      console.log(`Success with model: ${modelName}`);
      return response.text().trim();
    } catch (err) {
      console.log(`Model ${modelName} failed: ${err.status || err.message}`);
      lastError = err;
      // Only try next model on rate limit / quota errors
      if (err.status !== 429 && err.status !== 503 && err.status !== 404) {
        throw err;
      }
    }
  }

  throw lastError;
}

// --- Gemini AI: Process raw text into structured entry ---
app.post('/api/process', async (req, res) => {
  try {
    const { text, currentDate } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text darf nicht leer sein.' });
    }

    const prompt = buildPrompt(text, currentDate);
    let responseText = await callGemini(prompt);

    // Strip markdown code fences if present
    responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let structured;
    try {
      structured = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Gemini response parse error:', responseText);
      return res.status(500).json({ error: 'AI-Antwort konnte nicht verarbeitet werden.', raw: responseText });
    }

    // Validate required fields
    const validated = {
      aufgabenName: structured.aufgabenName || 'Neue Aufgabe',
      faelligkeitsdatum: structured.faelligkeitsdatum || null,
      beschreibung: structured.beschreibung || '',
      prioritaet: ['Hoch', 'Mittel', 'Niedrig'].includes(structured.prioritaet) ? structured.prioritaet : 'Mittel',
      aufwand: ['Wenig', 'Mittel', 'Hoch'].includes(structured.aufwand) ? structured.aufwand : 'Mittel',
      aufgabenTyp: Array.isArray(structured.aufgabenTyp) ? structured.aufgabenTyp.filter(t =>
        ['Arbeit', 'Fitness', 'Allgemein', 'Studium', 'Praktikum'].includes(t)
      ) : ['Allgemein']
    };

    if (validated.aufgabenTyp.length === 0) validated.aufgabenTyp = ['Allgemein'];

    res.json({ success: true, entry: validated });

  } catch (err) {
    console.error('Process error:', err.message);

    if (err.status === 429) {
      return res.status(429).json({
        error: 'Gemini API Kontingent erschöpft. Bitte warte eine Minute und versuche es erneut, oder überprüfe dein API-Kontingent auf ai.google.dev.'
      });
    }

    res.status(500).json({ error: 'Verarbeitung fehlgeschlagen: ' + err.message });
  }
});

// --- Notion: Create page in Aufgaben database ---
app.post('/api/notion/create', async (req, res) => {
  try {
    const { entry } = req.body;

    if (!entry) {
      return res.status(400).json({ error: 'Kein Eintrag übergeben.' });
    }

    const properties = {
      'Aufgaben Name': {
        title: [{ text: { content: entry.aufgabenName } }]
      },
      'Beschreibung': {
        rich_text: [{ text: { content: entry.beschreibung || '' } }]
      },
      'Priorität': {
        select: { name: entry.prioritaet || 'Mittel' }
      },
      'Status': {
        status: { name: 'Ausstehend' }
      },
      'Aufwand': {
        select: { name: entry.aufwand || 'Mittel' }
      },
      'Aufgaben Typ': {
        multi_select: (entry.aufgabenTyp || ['Allgemein']).map(t => ({ name: t }))
      }
    };

    // Add date if present
    if (entry.faelligkeitsdatum) {
      properties['Fälligkeitsdatum'] = {
        date: { start: entry.faelligkeitsdatum }
      };
    }

    const notionResponse = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties
    });

    res.json({
      success: true,
      notionUrl: notionResponse.url,
      pageId: notionResponse.id
    });

  } catch (err) {
    console.error('Notion create error:', err.message);
    res.status(500).json({ error: 'Notion-Eintrag fehlgeschlagen: ' + err.message });
  }
});

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Serve Vite-built frontend in production ---
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA catch-all: serve index.html for any non-API route
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`✅ Backend server running on http://localhost:${PORT}`);
  console.log(`   Models: ${GEMINI_MODELS.join(' → ')}`);
});
