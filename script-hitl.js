import { showRectifyButton } from './hitl.js';

// Global source of truth
window.generatedCode = window.generatedCode || '';

const API_ENDPOINT = 'https://llmfoundry.straive.com/openai/v1/chat/completions';
let API_KEY = ''; // not used (Foundry handles auth)

// Example prompts
const examples = {
  todo: 'Create a todo list app where users can add, complete, and delete tasks.',
  calculator: 'Build a calculator app with basic arithmetic operations.',
  weather: 'Create a weather app showing temperature and humidity for a city.',
  timer: 'Build a timer/stopwatch app with start, stop, and reset.',
  pdf: 'Create a PDF summarizer app that uploads a PDF, extracts text, and summarizes it using the LLM Foundry API.'
};

// ============= Main Logic =============
export function setExample(type) {
  document.getElementById('appDescription').value = examples[type];
}

export async function generateApp() {
  const desc = document.getElementById('appDescription').value.trim();
  if (!desc) return showError('Please enter an app description!');

  showLoading(true);
  hideError();

  try {
    let code = await callAPI(desc);
    code = injectAPIConfig(code);
    window.generatedCode = code;
    displayCode(code);
    updatePreview(code);
    showRectifyButton();
  } catch (e) {
    showError('Failed to generate app: ' + (e?.message || e));
    console.error(e);
  } finally {
    showLoading(false);
  }
}

// ============= Helpers =============
function injectAPIConfig(code) {
  const endpoints = [
    'https://api.openai.com/v1/chat/completions',
    'https://api.openai.com/v1/completions',
    'https://api.openai.com/v1/engines/davinci-codex/completions',
    'http://localhost:8010/openai/v1/chat/completions'
  ];

  let modified = code;
  endpoints.forEach(ep => {
    const esc = ep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    modified = modified.replace(new RegExp(esc, 'g'), API_ENDPOINT);
  });
  return modified;
}

// ============= Prompt =============
const SYSTEM_PROMPT = `

You are an expert web developer. Generate complete, working HTML files with embedded CSS and JavaScript. Always include functional API integrations where needed.


CRITICAL REQUIREMENTS:
1. Return ONLY pure HTML code - no markdown, no explanations, no code blocks
2. Complete HTML structure with <!DOCTYPE html>
3. All CSS must be in <style> tags in the <head>
4. All JavaScript must be in <script> tags at the end of <body>
5. Must be fully functional and interactive
6. Modern, clean design with good UX
7. If the app needs an API (like PDF summarizer, weather app, etc.):
   - Include full working API integration code
   - For PDF: Use PDF.js from CDN: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
   - For PDF: Extract text and send to API for real summarization
8. Include proper error handling and loading states
9. No external dependencies except CDN libraries where necessary
Start directly with <!DOCTYPE html> and end with </html>

LLM Foundry API Details:

# Following a sample llm call using when if the application is requires llm.
'''js
const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "What is 2 + 2" }],
  }),
});
await response.json()
'''
## Instructions: 
1. Use only the provided LLM Foundry fetch API to call code in the generated code if the application requires llm.
2. We don;t need API key in the generated code. use Credentials: "include" in the headers so it will automatically use the token from logged in user

`

// ============= API Call =============
async function callAPI(desc) {
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Create a complete, working single HTML file for: ${desc}` }
    ],
    temperature: 0.7
  };

  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok || !data.choices?.[0]?.message?.content)
    throw new Error(data.error?.message || 'Invalid response from API');

  // ✅ FIXED — keep formatting, remove only markdown fences
  return data.choices[0].message.content
    .replace(/^```html|```$/g, '')
    .trim();
}

// ============= UI Helpers =============
export function copyCode() {
  if (!window.generatedCode) return showError('No code generated yet!');
  navigator.clipboard.writeText(window.generatedCode)
    .then(() => alert('✓ Code copied!'))
    .catch(e => showError('Copy failed: ' + e.message));
}

export function openInNewTab() {
  if (!window.generatedCode) return showError('No code generated yet!');
  const w = window.open();
  w.document.write(window.generatedCode);
  w.document.close();
}

function displayCode(code) {
  const el = document.getElementById('codeDisplay');
  if (el) el.textContent = code;
}

function updatePreview(code) {
  const iframe = document.getElementById('previewFrame');
  if (!iframe) return;
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(code);
  doc.close();
}

function showLoading(show) {
  const l = document.getElementById('loading');
  if (l) l.classList.toggle('active', show);
}

function showError(msg) {
  const e = document.getElementById('error');
  if (e) {
    e.textContent = msg;
    e.classList.add('active');
    setTimeout(() => e.classList.remove('active'), 6000);
  } else console.warn(msg);
}

function hideError() {
  const e = document.getElementById('error');
  if (e) e.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => console.log('✅ AI App Generator ready → ', API_ENDPOINT));

// expose for HITL
Object.assign(window, { showError, showLoading, hideError, displayCode, updatePreview, API_ENDPOINT });
