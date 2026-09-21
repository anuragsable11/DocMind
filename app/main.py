import os
import uuid

from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.rag import answer_question
from app.ingestion import ingest_pdf


app = FastAPI()


class ChatRequest(BaseModel):
    question: str
    document_id: str


app.mount(
    "/static",
    StaticFiles(directory="frontend"),
    name="static"
)


@app.get("/")
def home():
    return FileResponse("frontend/index.html")


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):

    if file.content_type != "application/pdf":
        return {
            "error": "Only PDF files are allowed."
        }

    document_id = str(uuid.uuid4())

    os.makedirs("documents", exist_ok=True)

    file_path = f"documents/{document_id}.pdf"

    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())

    chunks = ingest_pdf(
        file_path,
        document_id,
        file.filename
    )

    return {
        "message": "PDF uploaded successfully.",
        "document_id": document_id,
        "filename": file.filename,
        "chunks": len(chunks)
    }


@app.post("/chat")
def chat(request: ChatRequest):

    result = answer_question(
    request.question,
    request.document_id
)

    return result