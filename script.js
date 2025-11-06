// let generatedCode = '';

// // YOUR API CONFIGURATION - Replace these with your actual values
// const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJhbGdhbS50cml2aWtyYW1hQHN0cmFpdmUuY29tIn0.W4PdAoqvbXuIVpJ7Nva3iiacvfIi5xECFEYaLTc-878';
// const API_ENDPOINT = 'https://llmfoundry.straive.com/azure/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-05-01-preview'; // Your LLM Foundry endpoint

let generatedCode = '';

// ✅ OpenAI-style Foundry Configuration
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJhbGdhbS50cml2aWtyYW1hQHN0cmFpdmUuY29tIn0.W4PdAoqvbXuIVpJ7Nva3iiacvfIi5xECFEYaLTc-878'; // 🔐 Replace with actual bearer token
const API_ENDPOINT = 'https://llmfoundry.straive.com/openai/v1/chat/completions';

// 🔧 Example templates
const examples = {
  todo: 'Create a todo list app where users can add tasks, mark them complete with checkboxes, and delete tasks. Store tasks in localStorage.',
  calculator: 'Build a calculator app with buttons for numbers 0-9 and operations +, -, *, /. Include equals button and clear button.',
  weather: 'Create a weather app that shows temperature, humidity, and weather condition for a city. Use a weather API.',
  timer: 'Build a timer/stopwatch app with start, stop, reset buttons. Display time in minutes and seconds.',
  pdf: 'Create a PDF summarizer that allows users to upload a PDF file and generates a concise summary of its content.'
};

function setExample(type) {
  document.getElementById('appDescription').value = examples[type];
}

async function generateApp() {
  const description = document.getElementById('appDescription').value.trim();
  if (!description) return showError('Please enter an app description!');

  showLoading(true);
  hideError();

  try {
    let code = await callAPI(description);
    code = injectAPIConfig(code);
    generatedCode = code;
    displayCode(code);
    updatePreview(code);
  } catch (error) {
    showError('Failed to generate app: ' + error.message);
    console.error('Error details:', error);
  } finally {
    showLoading(false);
  }
}

function injectAPIConfig(code) {
  const keyReplacements = [
    'YOUR_API_KEY',
    'YOUR_OPENAI_API_KEY',
    'YOUR_API_KEY_HERE',
    'YOUR_OPENAI_API_KEY_HERE',
    'sk-your-api-key-here',
    'your-api-key-here',
    'Bearer YOUR_API_KEY_HERE'
  ];

  let modifiedCode = code;

  keyReplacements.forEach(placeholder => {
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    modifiedCode = modifiedCode.replace(new RegExp(escaped, 'g'), API_KEY);
  });

  const endpointReplacements = [
    'https://api.openai.com/v1/chat/completions',
    'https://api.openai.com/v1/engines/davinci-codex/completions',
    'https://api.openai.com/v1/completions'
  ];

  endpointReplacements.forEach(endpoint => {
    const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    modifiedCode = modifiedCode.replace(new RegExp(escaped, 'g'), API_ENDPOINT);
  });

  return modifiedCode;
}

async function callAPI(description) {
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    throw new Error('Please set your API key in script.js file (line 4)');
  }

  const payload = {
    model: 'gpt-4o-mini-2024-07-18',
    messages: [
      {
        role: 'system',
        content: 'You are an expert web developer. Generate complete, working HTML files with embedded CSS and JavaScript. Always include functional API integrations where needed.'
      },
      {
        role: 'user',
        content: `Create a complete, working single HTML file for: ${description}

CRITICAL REQUIREMENTS:
1. Return ONLY pure HTML code - no markdown, no explanations, no code blocks
2. Complete HTML structure with <!DOCTYPE html>
3. All CSS must be in <style> tags in the <head>
4. All JavaScript must be in <script> tags at the end of <body>
5. Must be fully functional and interactive
6. Modern, clean design with good UX
7. If the app needs an API (like PDF summarizer, weather app, etc.):
   - Use this EXACT API configuration:
     * API Endpoint: const API_ENDPOINT = 'API_ENDPOINT_PLACEHOLDER';
     * API Key: const API_KEY = 'YOUR_API_KEY_HERE';
   - Include full working API integration code
   - For PDF: Use PDF.js from CDN: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
   - For PDF: Extract text and send to API for real summarization
8. Include proper error handling and loading states
9. No external dependencies except CDN libraries where necessary

Start directly with <!DOCTYPE html> and end with </html>`
      }
    ],
    temperature: 0.7
  };

  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log('🔍 API Response:', data);

  if (!response.ok || !data.choices || !data.choices[0]?.message?.content) {
    throw new Error(data.error?.message || 'Invalid response from API');
  }

  let code = data.choices[0].message.content;

  code = code.replace(/```html\n?/g, '')
             .replace(/```\n?/g, '')
             .replace(/^html\n/g, '')
             .trim();

  if (!code.startsWith('<!DOCTYPE')) {
    const doctypeIndex = code.indexOf('<!DOCTYPE');
    if (doctypeIndex > 0) {
      code = code.substring(doctypeIndex);
    }
  }

  code = code.replace(/API_ENDPOINT_PLACEHOLDER/g, API_ENDPOINT);
  return code;
}

function displayCode(code) {
  document.getElementById('codeDisplay').textContent = code;
}

function updatePreview(code) {
  const iframe = document.getElementById('previewFrame');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(code);
  doc.close();
  iframe.style.display = 'block';
}

function copyCode() {
  if (!generatedCode) {
    showError('No code generated yet!');
    return;
  }

  navigator.clipboard.writeText(generatedCode).then(() => {
    alert('✓ Code copied to clipboard!');
  }).catch(err => {
    showError('Failed to copy code: ' + err.message);
  });
}

function openInNewTab() {
  if (!generatedCode) {
    showError('No code generated yet!');
    return;
  }
  const newWindow = window.open();
  if (newWindow) {
    newWindow.document.write(generatedCode);
    newWindow.document.close();
  } else {
    showError('Please allow pop-ups to open preview in new tab');
  }
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.toggle('active', show);
  }
}

function showError(message) {
  const error = document.getElementById('error');
  if (error) {
    error.textContent = message;
    error.classList.add('active');
    setTimeout(hideError, 8000);
  }
}

function hideError() {
  const error = document.getElementById('error');
  if (error) error.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ AI App Generator loaded');
  console.log('🔗 Using endpoint:', API_ENDPOINT);

  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    showError('⚠️ Please add your API key in script.js');
  }
});
