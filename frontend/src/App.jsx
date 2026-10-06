import { useState } from "react";
import { askQuestion, uploadFile } from "./api";
import "./App.css";

export default function App() {
  const [status, setStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setStatus(`Uploading ${file.name}...`);
    try {
      const data = await uploadFile(file);
      setStatus(`Stored ${data.chunks_stored} chunks from ${data.filename}`);
    } catch (err) {
      setStatus(err.message);
    }
  }

  async function handleAsk(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text: q }]);
    try {
      const data = await askQuestion(q);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err.message, sources: [] }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <h1>AI Research Agent</h1>

      <section className="upload">
        <input type="file" accept=".pdf,.txt" onChange={handleUpload} />
        <p>{status}</p>
      </section>

      <section className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <p>{m.text}</p>
            {m.sources?.length > 0 && (
              <details>
                <summary>Sources ({m.sources.length})</summary>
                {m.sources.map((s) => (
                  <div key={s.id} className="source">
                    <strong>
                      [{s.id}] {s.source}, p.{s.page}
                    </strong>
                    <small> distance {s.distance}</small>
                    <p>{s.text}</p>
                  </div>
                ))}
              </details>
            )}
          </div>
        ))}
        {loading && <p className="thinking">Thinking...</p>}
      </section>

      <form onSubmit={handleAsk} className="ask">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your documents..."
        />
        <button disabled={loading}>Ask</button>
      </form>
    </div>
  );
}
