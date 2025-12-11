from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from openai import AsyncOpenAI
import os
from fastapi.middleware.cors import CORSMiddleware
import base64
import requests
from datetime import datetime
import re

load_dotenv()

app = FastAPI()

origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_ENDPOINT = os.getenv("LLMFOUNDRY_API_ENDPOINT")
API_KEY = os.getenv("LLMFOUNDRY_API_KEY")

if not API_ENDPOINT or not API_KEY:
    raise ValueError("LLMFOUNDRY_API_ENDPOINT and LLMFOUNDRY_API_KEY must be set in .env")

# ================================================================
#   GITHUB CONFIG (FOR DEPLOYMENT)
# ================================================================
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME")
GITHUB_REPO = os.getenv("GITHUB_REPO")  # e.g. "ai-app-generator-output"
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")  # optional, defaults to main
GITHUB_PAGES_BASE_URL = os.getenv(
    "GITHUB_PAGES_BASE_URL",
    f"https://{GITHUB_USERNAME}.github.io/{GITHUB_REPO}",
)

if not GITHUB_TOKEN or not GITHUB_USERNAME or not GITHUB_REPO:
    raise ValueError(
        "GITHUB_TOKEN, GITHUB_USERNAME, and GITHUB_REPO must be set in .env"
    )

# ================================================================
#   INIT OPENAI CLIENT
# ================================================================
openai_client = AsyncOpenAI(
    api_key=API_KEY,
    base_url=API_ENDPOINT,
)


def convert_messages(messages: list) -> str:
    formatted = ""
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        formatted += f"{role.upper()}:\n{content}\n\n"
    return formatted.strip()


# ================================================================
#   REQUIREMENT EXTRACTION
# ================================================================
def extract_requirements(description: str):
    return {
        "task_description": description,
        "needs_llm_api": True if "summarizer" in description.lower() or "ai" in description.lower() else False,
        "output_type": "single_html",
        "must_follow_html_rules": True,
    }


# ================================================================
#   SYSTEM PROMPT BUILDER
# ================================================================
def build_system_prompt(requirements: dict) -> str:
    base_prompt = """
You are an expert web developer. Generate complete HTML files with embedded CSS and JS.

RULES:
1. Output ONLY pure HTML (no markdown, no
).
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
#   LLM CALL FUNCTION
# ================================================================
async def call_llm(description: str = "", messages=None):
    try:
        if messages is None:
            requirements = extract_requirements(description)
            system_prompt = build_system_prompt(requirements)

            msgs = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Create a complete HTML file for: {description}"},
            ]
        else:
            msgs = messages

        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=msgs,
        )

        return response.choices[0].message.content

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================================================================
#   CLEAN HTML
# ================================================================
def clean_html(raw_output: str) -> str:
    if "```html" in raw_output:
        raw_output = raw_output.replace("```html", "")
    if "```" in raw_output:
        raw_output = raw_output.replace("```", "")
    return raw_output.strip()


# ================================================================
#   FILENAME HELPERS FOR GITHUB DEPLOY
# ================================================================
def slugify(text: str) -> str:
    text = text.strip().lower()
    if not text:
        return "app"
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "app"


def generate_filename(description: str) -> str:
    slug = slugify(description)
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return f"{slug}-{ts}.html"


# ================================================================
#   DEPLOY TO GITHUB (NEW FILE, NOT INDEX.HTML)
# ================================================================
def deploy_to_github(html_code: str, description: str) -> dict:
    """
    Creates a NEW file in the repo under generated/<slug>-<timestamp>.html.
    Does NOT touch any existing index.html.
    """
    filename = generate_filename(description or "app")
    path = f"generated/{filename}"

    contents_url = f"https://api.github.com/repos/{GITHUB_USERNAME}/{GITHUB_REPO}/contents/{path}"

    # We always create new files with unique names → no need for SHA check.
    encoded_content = base64.b64encode(html_code.encode("utf-8")).decode("utf-8")

    payload = {
        "message": f"chore: deploy generated app {filename}",
        "content": encoded_content,
        "branch": GITHUB_BRANCH,
    }

    put_resp = requests.put(
        contents_url,
        headers={
            "Authorization": f"token {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json",
        },
        json=payload,
    )

    if put_resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=500,
            detail=f"Failed to deploy to GitHub: {put_resp.status_code} {put_resp.text}",
        )

    repo_url = f"https://github.com/{GITHUB_USERNAME}/{GITHUB_REPO}"
    # Link to that specific file on GitHub Pages (if enabled)
    pages_file_url = f"{GITHUB_PAGES_BASE_URL}/generated/{filename}"

    return {
        "repo_url": repo_url,
        "pages_url": pages_file_url,
        "filename": filename,
        "path": path,
    }


# ================================================================
#   ROUTES (NO templates / static)
# ================================================================
@app.get("/")
async def home():
    return FileResponse("github_index.html")


@app.get("/github-style.css")
async def github_style():
    return FileResponse("github_style.css")


# --------- GENERATE: ONLY GENERATES, DOES NOT DEPLOY ----------
@app.post("/generate")
async def generate(request: Request):
    body = await request.json()
    description = body.get("description")

    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    html_code_raw = await call_llm(description=description)
    html_code = clean_html(html_code_raw)

    # Only return code. NO GitHub deployment here.
    return {"code": html_code}


# --------- DEPLOY: DEPLOYS CURRENT CODE AS NEW FILE ----------
@app.post("/deploy")
async def deploy(request: Request):
    body = await request.json()
    html_code = body.get("code")
    description = body.get("description", "App")

    if not html_code:
        raise HTTPException(status_code=400, detail="Code is required to deploy")

    deployment = deploy_to_github(html_code, description)

    return {
        "repo_url": deployment["repo_url"],
        "pages_url": deployment["pages_url"],
        "filename": deployment["filename"],
        "path": deployment["path"],
    }


# --------- RECTIFY (UNCHANGED LOGIC) ----------
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
            "content": "You are an expert web developer. Improve the HTML based on the given feedback. Return ONLY full corrected HTML.",
        },
        {"role": "user", "content": "Original Code:\n" + original_code},
        {"role": "user", "content": "Feedback:\n" + feedback},
    ]

    updated_html_raw = await call_llm(messages=messages)
    updated_html = clean_html(updated_html_raw)

    # Not redeploying here – just returning improved code (same behavior).
    return {"code": updated_html}
