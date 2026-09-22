# DocMind

Chat with your PDFs. Upload a document, ask questions in plain language, and get answers grounded in the document itself — with page numbers cited for every answer, so you can check the source.

DocMind is a retrieval-augmented generation (RAG) app. It does **not** send your whole PDF to a language model and hope for the best. It embeds the document locally, retrieves only the passages relevant to your question, and asks Gemini to answer using those passages alone. If the answer isn't in the document, DocMind says so instead of inventing one.

---

## How it works

**Ingestion** — runs once per uploaded PDF:

```
PDF ──> extract text ──> split into chunks ──> embed locally ──> store in ChromaDB
        (PyMuPDF)        (100 words,          (all-MiniLM-L6-v2)  (with page numbers)
                          20-word overlap)
```

**Answering** — runs on every question:

```
question ──> embed ──> search chunks ──> build context ──> Gemini ──> answer + pages
             (local)   (cosine, top 3)   (page-tagged)
```

Two details worth knowing:

- **Embeddings are computed on your machine**, by a small sentence-transformers model. Only the final prompt goes to Gemini — one API call per question, none at upload time. A 200-page PDF costs zero API calls to ingest.
- **Retrieval has a confidence floor.** If the closest chunk has a cosine distance above `0.5`, DocMind returns "I couldn't find the answer in the document" without calling the model at all. This is what stops it from confidently answering questions the document never addresses.

## Stack

| Layer | Choice |
|---|---|
| API | FastAPI + Uvicorn |
| PDF parsing | PyMuPDF (`fitz`) |
| Embeddings | sentence-transformers, `all-MiniLM-L6-v2` (local, CPU) |
| Vector store | ChromaDB, persisted to `./chroma_db` |
| Generation | Google Gemini via `google-genai` |
| Frontend | Vanilla HTML/CSS/JS — no build step |

---

## Quick start

**Prerequisites:** Python 3.12 and a Gemini API key (free — get one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey); no billing account required).

```bash
git clone <your-repo-url>
cd DocMind

python -m venv myenv
myenv\Scripts\activate          # Windows
# source myenv/bin/activate     # macOS / Linux

pip install -r requirements.txt
```

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_key_here
```

Then start the server:

```bash
uvicorn app.main:app --reload
```

Open <http://127.0.0.1:8000>, upload a PDF, and ask away.

> **First run is slow.** sentence-transformers downloads the embedding model (~90 MB) on first import. Subsequent starts are fast — it's cached.

---

## Configuration

Both variables go in `.env`.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `GEMINI_API_KEY` | yes | — | Your API key from Google AI Studio. |
| `GEMINI_MODELS` | no | `gemini-3.8-flash,gemini-3.6-flash,gemini-2.5-flash` | Comma-separated fallback chain, tried left to right. |

### About the model chain

Google's free tier serves requests at lower priority than paid traffic, so the newest and most popular models return `503 UNAVAILABLE` under load. DocMind handles this rather than failing the request:

1. Retries the current model **3 times** with exponential backoff and jitter (~1s, then ~2s), since these spikes usually last seconds.
2. If it's still busy, falls through to the **next model in the chain**.
3. Only when every model is exhausted does `/chat` return `503` with a readable message.

`429` (free-tier quota exhausted) is treated the same way, so hitting a daily cap on one model rolls over to the next instead of breaking the app. Genuine errors — bad key, malformed request — are raised immediately and never retried.

If you see frequent stalls, put an older model first:

```
GEMINI_MODELS=gemini-2.5-flash,gemini-3.6-flash
```

Older flash models are far less contended and, for document Q&A, you're unlikely to notice a quality difference.

---

## API

### `POST /upload`

Multipart form upload. Field name: `file`. PDFs only.

```bash
curl -F "file=@document.pdf" http://127.0.0.1:8000/upload
```

```json
{
  "message": "PDF uploaded successfully.",
  "document_id": "3f9a...",
  "filename": "document.pdf",
  "chunks": 128
}
```

Keep the `document_id` — it scopes every subsequent question to that document.

### `POST /chat`

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"What are the payment terms?\", \"document_id\": \"3f9a...\"}"
```

```json
{
  "answer": "Payment is due within 30 days of invoice.",
  "sources": [4, 5]
}
```

`sources` lists the 1-indexed PDF pages the answer drew from. Returns `503` with a `detail` message if every Gemini model is busy.

### `GET /health`

```json
{ "status": "healthy" }
```

---

## Project structure

```
app/
  main.py             FastAPI routes: /, /health, /upload, /chat
  ingestion.py        Upload pipeline — orchestrates the four steps below
  pdf_reader.py       PyMuPDF text extraction, page by page
  chunker.py          Word-window splitter with overlap
  embedder.py         sentence-transformers wrapper
  vector_store.py     ChromaDB collection, add + query
  rag.py              Retrieval, prompt assembly, confidence floor
  context_builder.py  Formats retrieved chunks with [Page N] tags
  llm.py              Gemini client, retry + model fallback
frontend/
  index.html          App shell
  style.css           Light/dark theming
  script.js           Upload, chat, and UI state
documents/            Uploaded PDFs, named by document_id (git-ignored)
chroma_db/            Persisted vector store (git-ignored)
```

`app/search.py` and `app/similarity.py` are scratch scripts kept for manual experimentation; they aren't imported by the app.

---

## Tuning

The defaults are reasonable, but these are the knobs that matter most:

| Knob | Where | Default | Effect |
|---|---|---|---|
| Chunk size | `chunker.py` | 100 words | Smaller = sharper retrieval, less surrounding context. |
| Chunk overlap | `chunker.py` | 20 words | Stops answers being cut in half at chunk boundaries. |
| Chunks retrieved | `rag.py` | 3 | More context, longer prompts, slower answers. |
| Distance threshold | `rag.py` | 0.5 | Lower = stricter, more "not in the document" replies. |

---

## Troubleshooting

**`ImportError: cannot import name 'genai' from 'google'`**
`google-genai` isn't installed in the active environment. `google` is a namespace package, so a partial install produces this confusing message rather than a plain "module not found". Fix with `pip install google-genai`, and check your venv is actually activated.

**`503 UNAVAILABLE — this model is experiencing high demand`**
Google's capacity, not your code, and not a billing problem. DocMind already retries and falls back automatically; if it still surfaces, reorder `GEMINI_MODELS` to put an older model first.

**`429 RESOURCE_EXHAUSTED`**
You've hit a free-tier rate or daily limit. Current limits are documented at [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits).

**Answers say "I couldn't find the answer in the document"**
Either the document genuinely doesn't cover it, or retrieval is too strict. Raise the `0.5` distance threshold in `rag.py`. Scanned PDFs with no text layer extract as empty — those need OCR before DocMind can read them.

**Stale or duplicated answers after re-uploading**
Each upload gets a fresh `document_id`, and old vectors stay in ChromaDB. Delete `chroma_db/` to start clean; it rebuilds on the next upload.

---

## Notes on privacy

Document text is stored unencrypted in `chroma_db/`, and the original PDFs sit in `documents/`. Both are git-ignored. Retrieved passages are sent to Google as part of each prompt — on the free tier, Google may use that content to improve their products, which is worth weighing before pointing this at anything confidential. The paid tier excludes prompts from training.
