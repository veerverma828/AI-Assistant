import json
from pathlib import Path

import ollama
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.ingest import build_chunks
from pydantic import BaseModel

from app.agent import run_agent, run_agent_stream
from app.rag import answer_question
from app.tools import web_search
from app.vectorstore import add_chunks, list_documents, search

app = FastAPI(title="AI Research Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    k: int = 2


@app.post("/ask")
def ask(body: AskRequest):
    return answer_question(body.question, body.k)


class AgentRequest(BaseModel):
    question: str


@app.post("/agent")
def agent(body: AgentRequest):
    return run_agent(body.question)


@app.post("/agent/stream")
def agent_stream(body: AgentRequest):
    def event_source():
        for event in run_agent_stream(body.question):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


@app.get("/documents")
def documents():
    return {"documents": list_documents()}


@app.get("/web-search")
def web_search_endpoint(q: str, n: int = 3):
    return {"query": q, "results": web_search(q, n)}


@app.get("/search")
def search_docs(q: str, k: int = 2):
    return {"query": q, "results": search(q, k)}
