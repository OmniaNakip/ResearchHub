# Research Hub

An AI-powered academic research assistant that helps university students explore research topics, discover relevant academic papers, and generate evidence-aware research responses.

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Main Features](#2-main-features)
3. [Human-AI Interaction (HAI)](#3-human-ai-interaction-hai)
4. [Welcome Message and Fallback Handling](#4-welcome-message-and-fallback-handling)
5. [Technologies Used](#5-technologies-used)
6. [System Architecture](#6-system-architecture)
7. [API Endpoints](#7-api-endpoints)
8. [Setup and Running Instructions](#8-setup-and-running-instructions)
9. [Error Handling](#9-error-handling)
10. [Known Issues & Troubleshooting](#10-known-issues--troubleshooting)
11. [Security and API Key Protection](#11-security-and-api-key-protection)
12. [Data Sources](#12-data-sources)
13. [Project Focus](#13-project-focus)
14. [Disclaimer](#14-disclaimer)

## 1. Project Overview

Research Hub is an ASP.NET Core Web API application that supports students throughout the academic research process.

The backend integrates:

- **Google Gemini API** — AI-powered responses and Arabic-to-English research query translation.
- **OpenAlex API** — retrieval of academic publications and research metadata.

The system supports research questions in both English and Arabic. When a question is submitted in Arabic, it is translated into an English academic search query for OpenAlex, while the original Arabic question is preserved for AI response generation.

## 2. Main Features

### Chatbot Interaction

- Welcomes users when they begin interacting with the chatbot.
- Accepts academic research questions in English and Arabic.
- Provides AI-generated responses based on retrieved academic papers.
- Supports a guided, multi-stage research workflow.
- Returns structured responses containing claims and supporting evidence references.

### Academic Paper Discovery

- Retrieves relevant academic papers through OpenAlex.
- Provides available publication metadata: titles, authors, publication years, DOI links, and abstracts.
- Supports searching for papers using research-related queries.

### Arabic Language Support

- Detects Arabic research questions.
- Translates Arabic questions into English academic search queries.
- Preserves the original Arabic question when generating the response.

### Guided Research Workflow

| Stage | Description |
|---|---|
| 1. Onboarding | Introduces the assistant and the workflow |
| 2. Research Question | User submits or refines their research question |
| 3. Paper Discovery | Relevant papers are retrieved from OpenAlex |
| 4. Paper Analysis | Retrieved papers are analyzed for relevance |
| 5. Comparison and Research Gaps | Findings are compared and gaps identified |
| 6. Research Brief | A structured brief is generated |
| 7. Completed | Workflow finished |

Available workflow actions: `Start`, `Back`, `Discover`, `Analyze`, `Compare`, `GenerateBrief`, `Approve`.

### Evidence-Aware Responses

The chatbot organizes generated research responses into structured claims and associates each claim with supporting paper references, so users can inspect the academic sources behind the generated explanations.

## 3. Human-AI Interaction (HAI)

Research Hub follows a Human-AI Interaction approach that aims to keep the user involved and informed throughout the research process.

| Principle | What it means here |
|---|---|
| **Transparency** | Every generated claim is linked to the academic papers that support it. |
| **User Control** | Users drive the research process through explicit workflow actions. |
| **Explainability** | Responses are structured into claims and evidence, making sources easy to inspect. |
| **Responsible Use** | AI-generated content should be verified against the original publications, not treated as unquestionable fact. |

## 4. Welcome Message and Fallback Handling

### Welcome Message

The chatbot opens with a welcome message that introduces its role as an academic research assistant and explains how to interact with it — either by asking a research question directly or by starting the guided workflow.

### Fallback Mechanism

Fallback handling provides a controlled response whenever the chatbot cannot complete a request. Expected fallback scenarios include:

- Empty or invalid user input.
- Questions outside the supported academic research scope.
- No relevant academic papers retrieved.
- Missing or inaccessible paper abstracts.
- Invalid or unexpected AI-generated responses.
- External service failures or request timeouts.

In every case, the system returns a clear, user-facing message or error instead of exposing raw exceptions.

## 5. Technologies Used

| Technology | Purpose |
|---|---|
| C# | Backend programming language |
| ASP.NET Core Web API | REST API development |
| .NET 10 | Application framework |
| Google Gemini API | AI response generation and query translation |
| OpenAlex API | Academic paper retrieval |
| Swagger / OpenAPI | API documentation and testing |
| System.Text.Json | JSON serialization and deserialization |

## 6. System Architecture

The backend follows a service-based structure.

### Main Components

- **ChatController** — receives API requests, coordinates the research process, and returns structured responses.
- **AiService** — communicates with Google Gemini for AI response generation and Arabic-to-English query translation.
- **OpenAlexService** — retrieves academic publications.
- **Models** — define request objects, response objects, research papers, claims, and evidence.

### Research Request Flow

1. The client submits a research question.
2. The API validates the incoming request.
3. If the question is in Arabic, the AI service generates an English academic search query.
4. OpenAlex retrieves relevant academic papers.
5. The retrieved papers and the original research question are passed to Gemini.
6. Gemini generates a structured response.
7. The API parses the generated response and processes its claims and evidence references.
8. The API returns the structured result to the client.

## 7. API Endpoints

Base route: `/api/Chat`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/Chat/ask` | Submit a research question and receive an AI-generated response with claims and evidence references. |
| POST | `/api/Chat/workflow` | Start or continue the guided research workflow. |
| GET | `/api/Chat/search-papers` | Search for academic papers using a query. |
| GET | `/api/Chat/models` | Retrieve available Gemini model information. |

### Ask a Research Question

**Endpoint:** `POST /api/Chat/ask`

```json
{
  "UserMessage": "What are the applications of deep learning in brain tumor detection using MRI images?",
  "Language": "English"
}
```

Returns the generated answer and, where available, structured claims with associated evidence references.

### Research Workflow

**Endpoint:** `POST /api/Chat/workflow`

```json
{
  "CurrentStage": "PaperDiscovery",
  "Action": "Discover",
  "ResearchQuestion": "What are the applications of deep learning in brain tumor detection using MRI images?"
}
```

Returns the current workflow stage, the next stage, available actions, and any discovered research papers.

### Search Academic Papers

**Endpoint:** `GET /api/Chat/search-papers`

```http
GET /api/Chat/search-papers?query=deep%20learning
```

Returns academic papers retrieved from OpenAlex.

### Retrieve Available AI Models

**Endpoint:** `GET /api/Chat/models`

Returns the available Gemini model information provided by the configured AI service.

## 8. Setup and Running Instructions

### Prerequisites

- .NET 10 SDK
- Visual Studio 2022 or another compatible .NET development environment
- A Google Gemini API key
- Internet access for external API communication

### Step 1 — Clone the Repository

```bash
git clone YOUR_REPOSITORY_URL
```

### Step 2 — Open the Project

Open the solution or the `.csproj` file in Visual Studio, or navigate to the project directory in a terminal.

### Step 3 — Restore Dependencies

```bash
dotnet restore
```

### Step 4 — Configure Application Secrets

The application requires the following Gemini configuration values:

- `Gemini:ApiKey`
- `Gemini:Model`

Configure sensitive values with .NET User Secrets during local development:

```bash
dotnet user-secrets init
dotnet user-secrets set "Gemini:ApiKey" "YOUR_GEMINI_API_KEY"
dotnet user-secrets set "Gemini:Model" "YOUR_GEMINI_MODEL"
```

If an OpenAlex API key is used, set it the same way:

```bash
dotnet user-secrets set "OpenAlex:ApiKey" "YOUR_OPENALEX_API_KEY"
```

> Never commit real credentials to a README or source file — use placeholders only.

### Step 5 — Run the Backend

```bash
dotnet run
```

### Step 6 — Open Swagger

Open the Swagger UI at the local URL shown in the terminal, followed by `/swagger`, to inspect and test the available endpoints.

## 9. Error Handling

The backend handles common validation and external service failures, including:

- Empty or invalid research questions.
- No relevant papers found.
- Papers without accessible abstracts.
- Invalid AI-generated JSON responses.
- External API request failures.
- Request timeouts.
- Unexpected server errors.

The API returns appropriate HTTP status codes and error information for failed requests, rather than leaking internal exception details.

## 10. Known Issues & Troubleshooting

### Gemini API overload (`503`) errors

The Gemini API can intermittently return `503 UNAVAILABLE` ("model overloaded") responses, particularly under high load. This is a known behavior of the upstream service rather than a bug in the integration. Mitigations to consider in `AiService`:

- **Retry with exponential backoff** — retry a `503` a small number of times (e.g. 3 attempts) with increasing delay (e.g. 1s, 2s, 4s) before surfacing a failure.
- **Model fallback list** — configure a prioritized list of Gemini models (e.g. `Gemini:Model`, `Gemini:FallbackModel`) and fall through to the next one if the primary model is overloaded.
- **Circuit breaker** — if failures persist across retries, short-circuit further calls for a cooldown period and return the fallback message immediately rather than queuing up repeated failing requests.
- **User-facing fallback** — when all retries are exhausted, return a clear "the AI service is temporarily unavailable, please try again shortly" message instead of a raw error, consistent with the fallback mechanism in Section 4.

## 11. Security and API Key Protection

Sensitive credentials must never be committed to the public repository.

**Security checklist:**

- Store Gemini (and OpenAlex) API keys outside source code.
- Use .NET User Secrets for local development.
- Use environment variables or a secrets manager for deployment.
- Do not include real API keys in README examples.
- Check configuration files before committing.
- Ensure `.gitignore` excludes local secret files and generated build directories.
- Review staged and tracked files before pushing to GitHub.

Example `.gitignore` entries:

```gitignore
.vs/
bin/
obj/
*.user
*.suo
secrets.json
appsettings.Development.json
```

Only ignore `appsettings.Development.json` if it contains local secrets or machine-specific configuration that should not be committed.

> If a secret was ever committed, removing it from the latest commit or adding it to `.gitignore` is **not** sufficient. Rotate the exposed credential and remove it from the repository history as well.

## 12. Data Sources

### OpenAlex

Used to retrieve scholarly works and available publication metadata, including titles, authors, publication years, DOI links, and abstracts.

Website: https://openalex.org/

### Google Gemini

Used for AI-powered research response generation and Arabic-to-English research query translation.

Website: https://ai.google.dev/

## 13. Project Focus

Research Hub aims to make academic exploration more accessible while emphasizing transparency and responsible AI usage. By combining academic paper retrieval with structured AI-generated responses, the system helps students explore research topics and inspect the sources behind generated claims.

## 14. Disclaimer

AI-generated research responses should always be reviewed against the original academic publications. Research Hub is intended to assist academic exploration and literature discovery — it does not replace critical reading, academic judgment, or expert review.
