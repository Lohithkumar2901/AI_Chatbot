# NOC Policy Chatbot

An internal AI-powered chat assistant that lets employees query company security policies and CIS benchmark controls in natural language. Built using a RAG (Retrieval-Augmented Generation) pipeline, secured with Azure AD SSO, and deployed as a floating widget that can be embedded in any internal web page.

---

## Features

- **Policy Q&A** — Ask questions about any of the company's security policy documents (DOCX)
- **CIS Benchmark Q&A** — Query CIS benchmark controls, levels, and implementation guidance directly
- **Policy vs CIS Comparison** — Compare company policies against CIS benchmark recommendations with structured gap analysis
- **Multi-turn Conversation** — Maintains last 4 turns of history per user session for natural follow-up questions
- **Learn Service** — Saves validated Q&A pairs and uses them as reference to improve future answers
- **Auto Document Ingestion** — File watcher auto-indexes new documents dropped into data folders without a server restart
- **Admin Sync API** — Trigger manual re-indexing via API endpoint
- **Abuse Protection** — Rate-limits users after repeated invalid queries (5 strikes → temporary lock)
- **Chat Logging** — All conversations logged per day to `/logs/chat-YYYY-MM-DD.log`
- **Document Download** — Users can download source policy files directly from the chat

---

## Technology Stack

### Frontend
| Technology | Purpose |
|---|---|
| HTML / CSS / JavaScript (Vanilla) | UI — floating chat widget |
| MSAL Browser (`msal-browser 2.30.0`) | Azure AD SSO login flow |
| marked.js | Render AI responses as formatted Markdown |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express 5 | API server |
| OpenAI SDK (`openai ^6`) | GPT-4.1 for answer generation, `text-embedding-3-small` for embeddings |
| LangChain | NLP utilities |
| `jsonwebtoken` + `jwks-rsa` | Verify Azure AD JWT tokens (RS256) |
| `mammoth` | Extract text from `.docx` policy files |
| `pdf-parse` | Extract text from `.pdf` CIS benchmark files |
| `mysql2` | Database connectivity |
| `fuse.js` | Fuzzy document title matching |
| `axios` | HTTP client |
| `dotenv` | Environment variable management |
| `nodemon` | Dev server with auto-restart |

### Data & Storage
| Component | Details |
|---|---|
| Vector Database | JSON file (`vector_db/embeddings.json`) — in-memory cosine similarity search |
| Policy Documents | `.docx` files in `data/policies/` (22 documents) |
| CIS Benchmarks | `.pdf` files in `data/CIS/` (17 documents) |
| Learned Q&A | `vector_db/learned_qa.json` — persisted past interactions |
| Chat Logs | `logs/chat-YYYY-MM-DD.log` — one file per day, JSONL format |

### Auth & Security
| Component | Details |
|---|---|
| Azure Active Directory | SSO via MSAL — all API calls require a valid Bearer token |
| JWKS Verification | Public keys fetched from Microsoft's JWKS endpoint at startup |
| Audience / Issuer | Validated against `api://<AZURE_CLIENT_ID>` and tenant issuer |
| In-memory Rate Limiter | Users locked after 5 invalid queries |

---

## Architecture Overview

```
User Browser
    │
    │  Azure AD login (MSAL)
    ▼
Frontend (HTML/CSS/JS)
    │
    │  POST /api/chat  { question, history }
    │  Bearer <Azure AD JWT>
    ▼
Express Server (server.js)
    │
    ├── verifyAzureToken (middleware)  ← validates JWT via JWKS
    │
    └── chatController
            │
            ├── detectPolicyIntent()     ← keyword match to find relevant policy
            ├── detectCisIntent()        ← detect CIS-only or comparison queries
            ├── generateEmbedding()      ← OpenAI text-embedding-3-small
            ├── searchVectorsByType()    ← cosine similarity over in-memory vectors
            ├── findSimilarQA()          ← lookup past learned answers
            │
            ├── generateAnswer()         ← GPT-4.1 (policy Q&A)
            ├── generateCisAnswer()      ← GPT-4.1 (CIS-only)
            └── generateComparison()     ← GPT-4.1 (policy vs CIS)
                        │
                        └── saveQA()     ← persist to learned_qa.json
```

---

## Project Structure

```
NOC-CHATBOT/
├── backend/
│   ├── server.js                  # Express app entry point
│   ├── package.json
│   ├── config/
│   │   └── config.js              # Env var aliases
│   ├── controllers/
│   │   └── chatController.js      # Main chat logic, intent detection, logging
│   ├── middleware/
│   │   └── verifyAzureToken.js    # Azure AD JWT verification
│   ├── routes/
│   │   └── chatRoutes.js
│   ├── services/
│   │   ├── aiService.js           # OpenAI GPT-4.1 answer generation (3 modes)
│   │   ├── embeddingService.js    # OpenAI text-embedding-3-small
│   │   ├── vectorService.js       # In-memory vector store + cosine similarity
│   │   ├── ingestService.js       # Document parsing + embedding pipeline
│   │   ├── documentService.js     # DOCX / PDF text extraction
│   │   ├── watcherService.js      # File system watcher for auto-ingestion
│   │   └── learnService.js        # Save and retrieve past Q&A pairs
│   └── utils/
│       ├── textChunker.js         # Splits document text into chunks
│       └── securityManager.js     # Per-user rate limiting / lock logic
├── frontend/
│   ├── index.html                 # Floating chat widget UI
│   ├── style.css
│   ├── auth.js                    # MSAL login flow
│   └── chat.js                    # Chat logic, API calls, message rendering
├── data/
│   ├── policies/                  # Company policy .docx files (22 documents)
│   └── CIS/                       # CIS benchmark .pdf files (17 documents)
├── vector_db/
│   ├── embeddings.json            # Pre-computed vector embeddings (all documents)
│   └── learned_qa.json            # Persisted learned Q&A pairs
└── logs/
    └── chat-YYYY-MM-DD.log        # Daily chat logs (JSONL)
```

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=3000
OPENAI_API_KEY=sk-...
AZURE_TENANT_ID=<your-azure-tenant-id>
AZURE_CLIENT_ID=<your-azure-app-client-id>
MYSQL_HOST=<your-mysql-host>
```

---

## Getting Started

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Add policy documents
Drop `.docx` policy files into `data/policies/` and `.pdf` CIS benchmarks into `data/CIS/`.

### 3. Ingest documents (first run)
On first startup the server automatically ingests all documents and builds `vector_db/embeddings.json`. This can take several minutes depending on the number of files.

### 4. Start the server
```bash
# Development
cd backend
npx nodemon server.js

# Production
node server.js
```

The server serves the frontend statically at `/` and exposes the API at `/api/chat`.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat` | Azure AD JWT | Send a question, receive an AI answer |
| `GET` | `/api/user` | Azure AD JWT | Returns the logged-in user's name |
| `POST` | `/api/admin/sync` | Azure AD JWT | Manually trigger document re-indexing |
| `GET` | `/documents/policies/:name` | — | Download a policy file by filename |
| `GET` | `/health` | — | Health check |

### POST `/api/chat` — Request Body
```json
{
  "question": "What is the password policy?",
  "history": [
    { "question": "previous question", "answer": "previous answer" }
  ]
}
```

---

## Adding New Documents

Simply drop files into the appropriate folder:

- **Company policies** → `data/policies/` (`.docx` format)
- **CIS benchmarks** → `data/CIS/` (`.pdf` format)

The file watcher (`watcherService.js`) detects the new file and automatically ingests and embeds it within seconds — no server restart required. Alternatively use the admin sync endpoint to trigger manually.

---

## Deployment

- The app is deployed at `https://wil-chatbot.wheelsindia.com`
- CORS is restricted to that origin
- Azure AD app registration must have `api://<CLIENT_ID>` set as the Application ID URI
- The frontend MSAL config (`auth.js`) must match the Azure app registration's Client ID and Tenant ID
