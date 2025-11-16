from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import os
import httpx  # For making asynchronous HTTP requests

load_dotenv()

app = FastAPI()

# Configure static files (CSS, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Configure templates (for serving HTML)
templates = Jinja2Templates(directory="templates")  # Assuming HTML is in the root

API_ENDPOINT = os.getenv("API_ENDPOINT")
API_KEY = os.getenv("API_KEY")

if not API_ENDPOINT or not API_KEY:
    raise ValueError("API_ENDPOINT and API_KEY must be set in the .env file.")


# ============= API Call =============
async def call_api(desc: str):
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Create a complete, working single HTML file for: {desc}"},
        ],
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                API_ENDPOINT,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
                json=payload,
            )
            response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
            data = response.json()

            if not data.get("choices") or not data["choices"][0].get("message") or not data["choices"][0]["message"].get("content"):
                raise HTTPException(status_code=500, detail="Invalid response from API: Missing content")

            code = data["choices"][0]["message"]["content"].replace("```html", "").replace("```", "").strip()
            return code
    except httpx.HTTPStatusError as e:
        print(f"HTTP Error: {e}")
        raise HTTPException(status_code=e.response.status_code, detail=f"API Error: {e.response.text}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


# ============= Prompt =============
SYSTEM_PROMPT = """
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

Strictly adhere to the following html structure
# HTML response structure
```
<!DOCTYPE html>
<html lang=en>
<head> 
<meta charset=UTF-8> </meta>
<!-- other meta and css and script(cdns) tags   -->
</head>
<body>
</body>
<script>
</script>
</html>

```

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
2. We don;t need API key in the generated code. use .env file where ever you require 
"""


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/generate")
async def generate_endpoint(request: Request):
    try:
        data = await request.json()
        description = data.get("description")
        if not description:
            raise HTTPException(status_code=400, detail="Description is required")

        code = await call_api(description)
        return {"code": code}

    except HTTPException as e:
        print(f"HTTPException: {e.detail}")
        return JSONResponse(status_code=e.status_code, content={"error": e.detail})
    except Exception as e:
        print(f"Unexpected error in generate_endpoint: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/rectify")
async def rectify_endpoint(request: Request):
    try:
        data = await request.json()
        original_code = data.get("code")
        feedback = data.get("feedback")

        if not original_code or not feedback:
            raise HTTPException(status_code=400, detail="Code and feedback are required")

        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert web developer. Based on the user's feedback, refine or fix the provided HTML code. Return only the full improved HTML."
                },
                { "role": "user", "content": f"Existing code:\n{original_code}" },
                { "role": "user", "content": f"Human feedback:\n{feedback}" }
            ],
            "temperature": 0.6
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                API_ENDPOINT,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

            code = data["choices"][0]["message"]["content"].strip()
            cleaned_code = clean_code(code)
            return {"code": cleaned_code}

    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"error": e.detail})
    except Exception as e:
        print(f"Unexpected error in rectify_endpoint: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


def clean_code(code: str) -> str:

    if '```html' in code:
        code = code[8:-3]
        return code
    else:
        return code
    

# 1. refine and create requremtns 
# 2. create system mesaage ,inputs and responses from llm structues in json aslo functions 
# 3. create code. 
# 4. dispay.

