from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from openai import AsyncOpenAI
import os
from fastapi.middleware.cors import CORSMiddleware


load_dotenv()

app = FastAPI()

origins = ["*"]

app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],  # Allows all standard HTTP methods (GET, POST, PUT, DELETE, etc.)
        allow_headers=["*"],  # Allows all HTTP headers
    )
# Serve static and template files
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

API_ENDPOINT = os.getenv("LLMFOUNDRY_API_ENDPOINT")
API_KEY = os.getenv("LLMFOUNDRY_API_KEY")

if not API_ENDPOINT or not API_KEY:
    raise ValueError("API_ENDPOINT and API_KEY must be set in .env")


# ================================================================
#  INIT OPENAI CLIENT (NEW)
# ================================================================
openai_client = AsyncOpenAI(
    api_key=os.getenv("LLMFOUNDRY_API_KEY"),      # from your config
    base_url=os.getenv("LLMFOUNDRY_API_ENDPOINT")      # from your config
)


# Convert ChatGPT-style messages → plain input string for responses.create
def convert_messages(messages: list) -> str:
    formatted = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        formatted += f"{role.upper()}:\n{content}\n\n"
    return formatted.strip()


# ================================================================
# REQUIREMENT EXTRACTION
# ================================================================
def extract_requirements(description: str):
    return {
        "task_description": description,
        "needs_llm_api": True if "summarizer" in description.lower() or "ai" in description.lower() else False,
        "output_type": "single_html",
        "must_follow_html_rules": True,
    }


# ================================================================
#  SYSTEM PROMPT BUILDER
# ================================================================
def build_system_prompt(requirements: dict) -> str:
    base_prompt = """
You are an expert web developer. Generate complete HTML files with embedded CSS and JS.

RULES:
1. Output ONLY pure HTML (no markdown, no ```).
2. Must include <!DOCTYPE html>.
3. CSS must be inside <style> in <head>.
4. JS must be inside <script> before </body>.
5. Must be fully functional, modern UI, clean UX.
6. Include API integrations if required.
7. If the app needs an API (like PDF summarizer, weather app, etc.):
   - Include full working API integration code
   - For PDF: Use PDF.js from CDN: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
   - For PDF: Extract text and send to API for real summarization
8. Follow this exact structure:

<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"></meta>
<!-- meta, css, cdns -->
</head>
<body>
</body>
<script>
</script>
</html>
"""

    if requirements["needs_llm_api"]:
        base_prompt += """
LLM Integration Rules:
- Use the LLM Foundry API exactly as shown:
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

## Instructions:
1. Use only the provided LLM Foundry fetch API to call code in the generated code if the application requires llm.
2. We don;t need API key in the generated code. use .env file where ever you require 
"""

    return base_prompt


# ================================================================
#   LLM CALL FUNCTION  (REWRITTEN)
# ================================================================
async def call_llm(description:str="",messages=None):
    try:
        # prompt = convert_messages(messages)
        requirements = extract_requirements(description)
        system_prompt = build_system_prompt(requirements)

        msgs = [
                {"role":"system","content":system_prompt},
                {"role": "user", "content": f"Create a complete HTML file for: {description}"}
            ]

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages= msgs if messages is None else messages
        )

        return response.choices[0].message.content

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================================================
#  CLEAN HTML
# ================================================================
def clean_html(raw_output: str) -> str:
    if "```html" in raw_output:
        raw_output = raw_output.replace("```html", "")
    if "```" in raw_output:
        raw_output = raw_output.replace("```", "")
    return raw_output.strip()


# ================================================================
#   ROUTES
# ================================================================

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/generate")
async def generate(request: Request):
    body = await request.json()
    description = body.get("description")

    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    html_code = await call_llm(description=description)
    return {"code": clean_html(html_code)}


@app.post("/rectify")
async def rectify(request: Request):
    body = await request.json()
    original_code = body.get("code")
    feedback = body.get("feedback")

    if not original_code or not feedback:
        raise HTTPException(status_code=400, detail="Code and feedback are required")

    messages = [
        {
            "role": "system",
            "content": "You are an expert web developer. Improve the HTML based on the given feedback. Return ONLY full corrected HTML."
        },
        {"role": "user", "content": "Original Code:\n" + original_code},
        {"role": "user", "content": "Feedback:\n" + feedback},
    ]

    # messages = convert_messages(messages)

    updated_html = await call_llm(messages=messages)
    return {"code": clean_html(updated_html)}