const API = "http://127.0.0.1:8000";

export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return res.json();
}

export async function listDocuments() {
  const res = await fetch(`${API}/documents`);
  if (!res.ok) throw new Error(`Could not load documents (${res.status})`);
  return (await res.json()).documents;
}

export async function deleteDocument(name) {
  const res = await fetch(`${API}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  return res.json();
}

// Calls the streaming agent endpoint and runs onEvent(event) for every step.
// `signal` lets the caller cancel the request (Stop button).
export async function askAgentStream(question, onEvent, signal) {
  const res = await fetch(`${API}/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok) throw new Error(`Agent failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop(); // last piece may be incomplete
    for (const part of parts) {
      if (part.startsWith("data: ")) onEvent(JSON.parse(part.slice(6)));
    }
  }
}

// Plain RAG endpoint (no agent). Kept for evaluation later.
export async function askQuestion(question) {
  const res = await fetch(`${API}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`Ask failed (${res.status})`);
  return res.json();
}
