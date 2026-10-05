from pathlib import Path

import ollama
from fastapi import FastAPI, File, UploadFile

from app.ingest import build_chunks
from pydantic import BaseModel

from app.rag import answer_question
from app.vectorstore import add_chunks, search

app = FastAPI(title="AI Research Agent")

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ollama-check")
def ollama_check():
    response = ollama.list()
    return {"models": [m.model for m in response.models]}


@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    path = UPLOAD_DIR / Path(file.filename).name
    path.write_bytes(await file.read())
    chunks = build_chunks(path)
    stored = add_chunks(chunks)
    return {"filename": path.name, "chunks_stored": stored}


class AskRequest(BaseModel):
    question: str
    k: int = 4


@app.post("/ask")
def ask(body: AskRequest):
    return answer_question(body.question, body.k)


@app.get("/search")
def search_docs(q: str, k: int = 4):
    return {"query": q, "results": search(q, k)}
