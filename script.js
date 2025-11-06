// async function generateApp() {
//   const prompt = document.getElementById('userPrompt').value;
//   const codeOutput = document.getElementById('codeOutput');
//   codeOutput.textContent = 'Generating...';

//   // Replace with your OpenAI API key
//   const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJhbGdhbS50cml2aWtyYW1hQHN0cmFpdmUuY29tIn0.W4PdAoqvbXuIVpJ7Nva3iiacvfIi5xECFEYaLTc-878';

//   const response = await fetch('https://llmfoundry.straive.com/azure/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-05-01-preview', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': `Bearer ${apiKey}`
//     },
//     body: JSON.stringify({
//       model: 'gpt-4o-mini',
//       messages: [
//         { role: 'system', content: 'You are a helpful assistant that generates HTML apps based on user descriptions.' },
//         { role: 'user', content: `Create a simple HTML app for: ${prompt}` }
//       ],
//       temperature: 0.5
//     })
//   });

//   const data = await response.json();
//   const htmlCode = data.choices?.[0]?.message?.content || 'No code generated.';
//   codeOutput.textContent = htmlCode;
// }

// function previewApp() {
//   const htmlCode = document.getElementById('codeOutput').textContent;
//   const previewFrame = document.getElementById('previewFrame');
//   const blob = new Blob([htmlCode], { type: 'text/html' });
//   const url = URL.createObjectURL(blob);
//   previewFrame.src = url;
//   previewFrame.style.display = 'block';
// }

let generatedCode = '';

// Example templates
const examples = {
  todo: 'Create a todo list app where users can add tasks, mark them complete with checkboxes, and delete tasks. Store tasks in localStorage.',
  calculator: 'Build a calculator app with buttons for numbers 0-9 and operations +, -, *, /. Include equals button and clear button.',
  weather: 'Create a weather app that shows temperature, humidity, and weather condition for a city. Use a weather API.',
  timer: 'Build a timer/stopwatch app with start, stop, reset buttons. Display time in minutes and seconds.'
};

// Set example description
function setExample(type) {
  document.getElementById('appDescription').value = examples[type];
}

// Main function to generate app
async function generateApp() {
  const description = document.getElementById('appDescription').value.trim();
  if (!description) return showError('Please enter an app description!');

  showLoading(true);
  hideError();

  try {
    let code = await callOpenAI(description);
    code = injectLocalSummarizer(code); // Replace placeholder fetch with local call
    generatedCode = code;
    displayCode(code);
    updatePreview(code);
  } catch (error) {
    showError('Failed to generate app: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// Call OpenAI API directly
async function callOpenAI(text) {
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJhbGdhbS50cml2aWtyYW1hQHN0cmFpdmUuY29tIn0.W4PdAoqvbXuIVpJ7Nva3iiacvfIi5xECFEYaLTc-878'; // Replace with your actual key

  const prompt = `
Generate a complete HTML app based on this description:
"${text}"

Include:
- Full HTML structure
- Inline CSS for layout and styling
- JavaScript for functionality
- No external libraries
- Make it runnable in a browser
`;

  const response = await fetch('https://llmfoundry.straive.com/azure/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-05-01-preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that generates complete HTML apps based on user descriptions.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5
    })
  });

  if (!response.ok) throw new Error('OpenAI API request failed');
  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'No code generated.';
}

// Inject local summarizer into generated code
function injectLocalSummarizer(code) {
  const summarizerFunction = `
<script>
  async function summarizeText(text) {
    const response = await fetch('https://llmfoundry.straive.com/azure/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-05-01-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImJhbGdhbS50cml2aWtyYW1hQHN0cmFpdmUuY29tIn0.W4PdAoqvbXuIVpJ7Nva3iiacvfIi5xECFEYaLTc-878' // Replace with your actual key
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes text.' },
          { role: 'user', content: 'Summarize this:\\n' + text }
        ],
        temperature: 0.5
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No summary generated.';
  }
</script>
`;

  // Inject before closing </body> tag
  return code.replace('</body>', summarizerFunction + '\n</body>');
}

// Display code in code panel
function displayCode(code) {
  document.getElementById('codeDisplay').textContent = code;
}

// Update preview iframe
function updatePreview(code) {
  const iframe = document.getElementById('previewFrame');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(code);
  doc.close();
  iframe.style.display = 'block';
}

// Copy code to clipboard
function copyCode() {
  navigator.clipboard.writeText(generatedCode).then(() => {
    alert('Code copied to clipboard!');
  });
}

// Open preview in new tab
function openInNewTab() {
  const newWindow = window.open();
  newWindow.document.write(generatedCode);
  newWindow.document.close();
}

// Show loading state
function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// Show error message
function showError(message) {
  const error = document.getElementById('error');
  error.textContent = message;
  error.style.display = 'block';
}

// Hide error message
function hideError() {
  document.getElementById('error').style.display = 'none';
}
