// ========================================
// 🔧 HUMAN-IN-THE-LOOP (RECTIFY FEATURE) — TypeScript Version
// ========================================

// --- Declare global variables & helper functions from script.js ---
declare let generatedCode: string;
declare const API_ENDPOINT: string;
declare function showError(message: string): void;
declare function showLoading(show: boolean): void;
declare function hideError(): void;
declare function displayCode(code: string): void;
declare function updatePreview(code: string): void;

// --- Types for the Foundry API ---
interface LLMMessage {
  role: 'system' | 'user';
  content: string;
}

interface LLMResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

// --- Show the HITL section button ---
export function showRectifyButton(): void {
  const section = document.getElementById("rectifySection") as HTMLElement | null;
  if (section) section.style.display = "block";
}

// --- Open the feedback popup ---
export function rectifyCode(): void {
  if (!generatedCode) {
    showError("No code available to improve.");
    return;
  }
  const popup = document.getElementById("rectifyPopup") as HTMLElement | null;
  if (popup) popup.style.display = "flex";
}

// --- Submit human feedback and call API ---
export async function submitRectification(): Promise<void> {
  const inputEl = document.getElementById("rectifyInput") as HTMLTextAreaElement | null;
  if (!inputEl) return;

  const feedback = inputEl.value.trim();
  if (!feedback) {
    showError("Please describe what to fix.");
    return;
  }

  const popup = document.getElementById("rectifyPopup") as HTMLElement | null;
  if (popup) popup.style.display = "none";

  showLoading(true);
  hideError();

  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert web developer. Based on the user's feedback, refine or fix the provided HTML code. Return only the full improved HTML."
        },
        { role: "user", content: `Existing code:\n${generatedCode}` },
        { role: "user", content: `Human feedback:\n${feedback}` }
      ] as LLMMessage[],
      temperature: 0.6
    };

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data: LLMResponse = await response.json();

    const code = data.choices?.[0]?.message?.content?.trim();
    if (!code) throw new Error("No improved code received.");

    // 🧹 Clean up the returned code safely
    let cleanedCode = code
      .replace(/```html\n?/gi, '')     // remove markdown fences
      .replace(/```/g, '')             // remove closing fences
      .replace(/^\s*html\s*$/gi, '')   // remove isolated 'html' lines
      .trim();

    // --- START OF NEW/MODIFIED CLEANUP LOGIC ---

    // 1. Fix malformed DOCTYPE declarations that contain 'lang="en"' or similar
    //    This targets `<!DOCTYPE < lang="en">` and replaces it with `<!DOCTYPE html>`
    cleanedCode = cleanedCode.replace(/<!DOCTYPE\s*<?\s*lang="en"[^>]*>/gi, '<!DOCTYPE html>');

    // 2. Remove any stray 'lang="en"' attributes that are not part of a proper <html> tag
    //    This targets the "```<lang="en">" in the preview if it's not a full tag,
    //    and any ` lang="en"` that might appear incorrectly elsewhere.
    cleanedCode = cleanedCode.replace(/(?<!<html[^>]*)\s+lang="en"/gi, '');

    // 3. Remove any remaining stray <lang...> or </lang> tags
    cleanedCode = cleanedCode
        .replace(/<\s*lang[^>]*>/gi, '') // Remove any <lang...> tags (e.g., <lang>)
        .replace(/<\/\s*lang\s*>/gi, ''); // Remove any </lang> tags

    // 4. Ensure <!DOCTYPE html> is at the very beginning.
    //    If it's missing or malformed after previous steps, prepend the correct one.
    if (!cleanedCode.toLowerCase().startsWith('<!doctype html>')) {
        cleanedCode = cleanedCode.replace(/<!DOCTYPE[^>]*>/i, '').trim(); // Remove any existing DOCTYPE
        cleanedCode = '<!DOCTYPE html>\n' + cleanedCode;
    }

    // 5. Ensure <html lang="en"> is the first tag after DOCTYPE.
    const htmlTagRegex = /<html(\s*[^>]*)?>/i;
    const match = cleanedCode.match(htmlTagRegex);

    if (match) {
        const existingHtmlTag = match[0];
        // If no lang attribute or a different one, ensure lang="en"
        if (!existingHtmlTag.toLowerCase().includes('lang="en"')) {
            const newHtmlTag = existingHtmlTag.replace(/lang="[^"]*"/i, 'lang="en"').replace(/<html(\s*[^>]*)?>/i, (m, attrs) => {
                if (attrs && attrs.toLowerCase().includes('lang=')) {
                    return m; // Already handled by replace above if a lang attribute existed
                } else {
                    return `<html lang="en"${attrs || ''}>`; // Add lang="en" if no lang attribute was present
                }
            });
            cleanedCode = cleanedCode.replace(existingHtmlTag, newHtmlTag);
        }
    } else {
        // If <html> tag is completely missing, add it after DOCTYPE
        cleanedCode = cleanedCode.replace(/(<!DOCTYPE html>\n?)/i, '$1<html lang="en">\n');
    }

    // 6. Ensure the closing </html> tag is present.
    if (!cleanedCode.toLowerCase().includes('</html>')) {
        cleanedCode += '\n</html>';
    }

    cleanedCode = cleanedCode.trim(); // Final trim after all modifications

    // --- END OF NEW/MODIFIED CLEANUP LOGIC ---

    // ✅ Validate structure before preview
    if (!cleanedCode.includes('<html') || !cleanedCode.includes('</html>')) {
      showError("⚠️ Generated code may be incomplete or malformed.");
      return;
    }

    generatedCode = cleanedCode;

    displayCode(cleanedCode);
    updatePreview(cleanedCode);
    showError("✅ Code improved based on your feedback!");
  } catch (err: any) {
    showError("Failed to refine code: " + err.message);
  } finally {
    showLoading(false);
  }
}

// --- Close feedback popup ---
export function closeRectifyPopup(): void {
  const popup = document.getElementById("rectifyPopup") as HTMLElement | null;
  if (popup) popup.style.display = "none";
}