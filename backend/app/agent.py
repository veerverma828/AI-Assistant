import json
from pathlib import Path

import ollama

from app.tools import fetch_page, get_chunks, list_documents, search_documents, web_search

AGENT_MODEL = "qwen2.5:7b"
UPLOAD_DIR = Path("data/uploads")
MAX_STEPS = 5
MAX_TOOL_RESULT_CHARS = 4000

SYSTEM_PROMPT = (
    "You are a research assistant with tools. "
    "Use search_documents first for questions about the user's uploaded files. "
    "Use web_search for current events, facts not in the documents, or when documents have no answer. "
    "Search snippets are short and rarely contain the answer. "
    "If the question needs a specific value (temperature, price, score, version, date), "
    "you MUST call fetch_page on the most relevant url before answering. "
    "Never tell the user to visit a website themselves: read it yourself. "
    "Call one tool at a time. Never invent facts. "
    "Always keep names from the user's question (cities, people, products) in your search queries. "
    "If a tool returns an error or empty result, retry once with different wording before giving up. "
    "When you have enough information, reply with a short final answer and name your sources "
    "(file name and page, or url)."
)

# Schemas: what the model reads to know a tool exists and how to call it.
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_documents",
            "description": "Search the user's uploaded documents. Use for questions about their files.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "What to look for"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_documents",
            "description": "List which documents are stored, with chunk count and pages for each. Use when asked what documents or files are stored or uploaded.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_chunks",
            "description": "Show the stored text chunks of one document, in order. Use when asked to show or inspect a document's chunks.",
            "parameters": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "description": "Exact file name, e.g. report.pdf"},
                    "limit": {"type": "integer", "description": "How many chunks to show (default 3)"},
                },
                "required": ["source"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Returns titles, urls, snippets, and the text content of the top pages.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Search query"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_page",
            "description": "Download a web page and return its text. Use on a url from web_search.",
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string", "description": "Full page url"}},
                "required": ["url"],
            },
        },
    },
]

# Registry: tool name -> real Python function.
REGISTRY = {
    "search_documents": search_documents,
    "list_documents": list_documents,
    "get_chunks": get_chunks,
    "web_search": web_search,
    "fetch_page": fetch_page,
}


def build_system_prompt() -> str:
    """Base rules plus the list of uploaded files, so the model knows documents exist."""
    files = sorted(p.name for p in UPLOAD_DIR.glob("*") if p.is_file())
    if not files:
        return SYSTEM_PROMPT + " The user has not uploaded any documents."
    return (
        SYSTEM_PROMPT
        + " The user has uploaded these documents: "
        + ", ".join(files)
        + ". Questions about people, projects, skills, or anything that could be in these files: "
        "call search_documents FIRST, even if the user does not mention the documents. "
        "Use web_search only if the documents have no answer or the question is about the outside world."
    )


def run_tool(name: str, args: dict):
    func = REGISTRY.get(name)
    if func is None:
        return f"Unknown tool: {name}"
    try:
        return func(**args)
    except Exception as e:  # model may send wrong arguments; tell it, don't crash
        return f"Tool error: {e}"


def run_agent_stream(question: str):
    """Generator: yields one event dict per step so the UI can show live progress."""
    messages = [
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": question},
    ]

    for step in range(1, MAX_STEPS + 1):
        yield {"type": "thinking", "step": step}
        content = ""
        tool_calls = []
        for chunk in ollama.chat(
            model=AGENT_MODEL,
            messages=messages,
            tools=TOOLS,
            options={"temperature": 0.1},
            stream=True,
        ):
            piece = chunk.message
            if piece.content:
                content += piece.content
                yield {"type": "token", "text": piece.content}
            if piece.tool_calls:
                tool_calls.extend(piece.tool_calls)

        messages.append({"role": "assistant", "content": content, "tool_calls": tool_calls})

        if not tool_calls:
            yield {"type": "answer", "text": content}
            return

        for call in tool_calls:
            name = call.function.name
            args = dict(call.function.arguments)
            yield {"type": "tool_call", "tool": name, "args": args}
            result = run_tool(name, args)
            result_text = json.dumps(result, ensure_ascii=False)[:MAX_TOOL_RESULT_CHARS]
            yield {"type": "tool_result", "tool": name, "preview": result_text[:300]}
            messages.append({"role": "tool", "content": result_text, "tool_name": name})

    yield {"type": "answer", "text": "Stopped: reached the step limit before finishing."}


def run_agent(question: str) -> dict:
    """Non-streaming version: collect all events, return answer + trace."""
    trace, answer = [], ""
    for event in run_agent_stream(question):
        if event["type"] == "tool_call":
            trace.append({"tool": event["tool"], "args": event["args"]})
        elif event["type"] == "tool_result":
            trace[-1]["result_preview"] = event["preview"]
        elif event["type"] == "answer":
            answer = event["text"]
    return {"answer": answer, "trace": trace}
