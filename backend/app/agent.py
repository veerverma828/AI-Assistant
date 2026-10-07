import json

import ollama

from app.tools import fetch_page, get_chunks, list_documents, search_documents, web_search

AGENT_MODEL = "qwen2.5:7b"
MAX_STEPS = 5
MAX_TOOL_RESULT_CHARS = 4000

SYSTEM_PROMPT = (
    "You are a research assistant with tools. Read each tool's description and choose the right one yourself. "
    "If a tool reports no relevant result, try another tool that could help. "
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
            "description": (
                "Search the user's own uploaded files (resume, PDFs, notes, reports). "
                "Use for any question about the user, their background, skills, projects, or content "
                "that could be in their files, even if the question does not mention documents. "
                "Not for news, weather, or public facts. "
                "Returns the 2 closest passages: read them, ignore any that do not help, "
                "and use web_search if none answer the question."
            ),
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
            "description": (
                "Search the public web. Use for current events, weather, news, prices, versions, "
                "and general knowledge, or when the user's documents had no relevant answer. "
                "Returns titles, urls, snippets, and the text of the top pages."
            ),
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


def summarize(name: str, result) -> dict:
    """Short human summary of a tool result for the UI. The model still gets the full result."""
    if isinstance(result, str):
        if name == "fetch_page" and not result.startswith("Could not fetch"):
            return {"text": f"Read {len(result):,} characters", "items": []}
        return {"text": result[:140], "items": []}
    if result and isinstance(result[0], dict) and "info" in result[0]:
        return {"text": result[0]["info"], "items": []}
    if name in ("search_documents", "get_chunks"):
        verb = "Found" if name == "search_documents" else "Read"
        noun = "passages" if name == "search_documents" else "chunks"
        return {
            "text": f"{verb} {len(result)} {noun}",
            "items": [f"{r['source']} · p.{r['page']}" for r in result],
        }
    if name == "list_documents":
        return {
            "text": f"{len(result)} documents stored",
            "items": [f"{r['source']} · {r['chunks']} chunks" for r in result],
        }
    if name == "web_search":
        read = sum(1 for r in result if "content" in r)
        return {
            "text": f"{len(result)} results, read {read} pages",
            "items": [r["title"][:70] for r in result],
        }
    return {"text": f"{len(result)} results", "items": []}


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
        {"role": "system", "content": SYSTEM_PROMPT},
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
            yield {
                "type": "tool_result",
                "tool": name,
                "preview": result_text[:300],
                "summary": summarize(name, result),
            }
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
