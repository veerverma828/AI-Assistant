import { useEffect, useRef, useState } from "react";
import { askAgentStream, deleteDocument, listDocuments, uploadFile } from "./api";
import Composer from "./components/Composer";
import Markdown from "./components/Markdown";
import Message, { Avatar } from "./components/Message";
import Sidebar from "./components/Sidebar";
import ToolTrace from "./components/ToolTrace";
import "./App.css";

const CHATS_KEY = "querywise.chats";
const THEME_KEY = "querywise.theme";

const STARTERS = [
  "What documents are stored?",
  "Summarize my uploaded document",
  "What skills are listed in my resume?",
  "What is the latest news about AI agents?",
];

function makeChat() {
  return { id: `c${Date.now()}${Math.floor(Math.random() * 1e6)}`, title: "New chat", messages: [] };
}

// Only chats with at least one message are ever saved or listed.
function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(CHATS_KEY));
    if (Array.isArray(data)) return data.filter((c) => c.messages?.length > 0);
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return [];
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "dark";
  } catch {
    return "dark";
  }
}

const nowMs = () => Date.now();

const firstArg = (args) => String(Object.values(args)[0] ?? "");

export default function App() {
  // `chats` = saved conversations (the Recent list). `draftChat` = the blank temporary
  // chat shown when activeId is null; it joins `chats` only after the first message.
  const [chats, setChats] = useState(loadChats);
  const [draftChat, setDraftChat] = useState(makeChat);
  const [activeId, setActiveId] = useState(null);
  const [theme, setTheme] = useState(loadTheme);
  const [docs, setDocs] = useState([]);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  const [draft, setDraft] = useState("");
  const [runStart, setRunStart] = useState(0);

  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const active = chats.find((c) => c.id === activeId) ?? draftChat;

  useEffect(() => {
    try {
      localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    } catch {
      /* ignore */
    }
  }, [chats]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    listDocuments()
      .then((d) => !cancelled && setDocs(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active.messages, draft, liveSteps]);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 4000);
  }

  function updateChat(id, fn) {
    setChats((all) => all.map((c) => (c.id === id ? fn(c) : c)));
  }

  // Opens the blank temporary chat. Nothing is added to Recent until a message is sent.
  function newChat() {
    if (loading) return;
    setActiveId(null);
    setSidebarOpen(false);
  }

  function deleteChat(id) {
    if (loading) return;
    setChats((all) => all.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  }

  async function handleUpload(file) {
    showToast(`Uploading ${file.name}...`);
    try {
      const data = await uploadFile(file);
      showToast(`Stored ${data.chunks_stored} chunks from ${data.filename}`);
      setDocs(await listDocuments());
    } catch (err) {
      showToast(err.message);
    }
  }

  async function handleDeleteDoc(name) {
    if (!window.confirm(`Delete "${name}" and all its chunks? This cannot be undone.`)) return;
    try {
      const r = await deleteDocument(name);
      showToast(`Deleted ${r.deleted} (${r.chunks_removed} chunks)`);
      setDocs(await listDocuments());
    } catch (err) {
      showToast(err.message);
    }
  }

  async function ask(text) {
    const q = text.trim();
    if (!q || loading) return;
    const chatId = active.id;
    const startedAt = nowMs();

    const userMessage = { role: "user", text: q };
    if (chats.some((c) => c.id === chatId)) {
      updateChat(chatId, (c) => ({ ...c, messages: [...c.messages, userMessage] }));
    } else {
      // first message of the blank chat: only now does it enter Recent
      setChats((all) => [{ ...active, title: q.slice(0, 40), messages: [userMessage] }, ...all]);
      setActiveId(chatId);
      setDraftChat(makeChat());
    }
    setLoading(true);
    setLiveSteps([]);
    setDraft("");
    setRunStart(startedAt);

    const controller = new AbortController();
    abortRef.current = controller;
    // Activity log shown in the dropdown: thinking steps, tool calls, writing.
    const steps = [];
    let writing = false;
    let answer = "";
    let draftText = "";
    const secs = () => Math.round((Date.now() - startedAt) / 1000);
    const sync = () => setLiveSteps(steps.map((s) => ({ ...s })));
    const closeRunning = (match, status = "done") =>
      steps.forEach((s) => {
        if (s.status === "running" && match(s)) s.status = status;
      });
    const snapshot = (status) => {
      closeRunning(() => true, status);
      return steps.map((s) => ({ ...s }));
    };
    const finish = (message) =>
      updateChat(chatId, (c) => ({ ...c, messages: [...c.messages, message] }));

    try {
      await askAgentStream(
        q,
        (event) => {
          if (event.type === "thinking") {
            closeRunning((s) => s.kind === "thinking");
            steps.push({ kind: "thinking", step: event.step, status: "running" });
            sync();
          } else if (event.type === "token") {
            if (!writing) {
              writing = true;
              closeRunning((s) => s.kind === "thinking");
              steps.push({ kind: "writing", status: "running" });
              sync();
            }
            draftText += event.text;
            setDraft(draftText);
          } else if (event.type === "answer") {
            answer = event.text;
          } else if (event.type === "tool_call") {
            // model chose a tool: discard any text it wrote before
            const plan = draftText.trim();
            draftText = "";
            setDraft("");
            writing = false;
            // text before a tool call was the model's plan, not the answer:
            // swap the "writing" step for a visible "Plan" note
            const planIdx = steps.findLastIndex((s) => s.kind === "writing");
            if (planIdx !== -1) steps.splice(planIdx, 1);
            closeRunning((s) => s.kind === "thinking");
            if (plan) steps.push({ kind: "note", preview: plan, status: "done" });
            steps.push({ kind: "tool", tool: event.tool, arg: firstArg(event.args), status: "running" });
            sync();
          } else if (event.type === "tool_result") {
            const t = [...steps].reverse().find((x) => x.kind === "tool" && x.tool === event.tool && x.status === "running");
            if (t) {
              t.status = "done";
              t.preview = event.preview;
              t.summary = event.summary;
            }
            sync();
          }
        },
        controller.signal,
      );
      finish({ role: "assistant", text: answer, steps: snapshot("done"), secs: secs() });
    } catch (err) {
      if (err.name === "AbortError") {
        finish({ role: "assistant", text: draftText || "Stopped.", steps: snapshot("stopped"), secs: secs(), stopped: true });
      } else {
        finish({ role: "assistant", text: `Something went wrong: ${err.message}`, steps: snapshot("stopped"), secs: secs() });
      }
    } finally {
      setLoading(false);
      setLiveSteps([]);
      setDraft("");
      abortRef.current = null;
    }
  }

  const empty = active.messages.length === 0 && !loading;

  return (
    <div className="shell">
      <Sidebar
        chats={chats}
        activeId={active.id}
        onSelect={(id) => {
          if (!loading) {
            setActiveId(id);
            setSidebarOpen(false);
          }
        }}
        onNew={newChat}
        onDelete={deleteChat}
        docs={docs}
        onPickFile={handleUpload}
        onDeleteDoc={handleDeleteDoc}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="topbar-title">{empty ? "Querywise" : active.title}</span>
        </header>

        <div className="scroll">
          <div className="column">
            {empty ? (
              <div className="empty">
                <span className="logo big">Q</span>
                <h1>What would you like to research?</h1>
                <p>Ask about your documents, or let me search the web.</p>
                <div className="starters">
                  {STARTERS.map((s) => (
                    <button key={s} className="starter" onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {active.messages.map((m, i) => (
                  <Message key={i} message={m} />
                ))}

                {loading && (
                  <div className="row assistant">
                    <Avatar />
                    <div className="assistant-body">
                      <ToolTrace steps={liveSteps} live runStart={runStart} />
                      {draft && <Markdown text={draft} />}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}

        <Composer
          onSend={ask}
          onStop={() => abortRef.current?.abort()}
          loading={loading}
          onPickFile={handleUpload}
        />
      </main>
    </div>
  );
}
