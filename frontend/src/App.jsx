import { useEffect, useRef, useState } from "react";
import { askAgentStream, listDocuments, uploadFile } from "./api";
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

function loadChats() {
  try {
    const data = JSON.parse(localStorage.getItem(CHATS_KEY));
    if (Array.isArray(data) && data.length) return data;
  } catch {
    /* storage blocked or corrupt: start fresh */
  }
  return [makeChat()];
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

function Elapsed({ since }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="elapsed">{Math.floor((now - since) / 1000)}s</span>;
}

export default function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => loadChats()[0].id);
  const [theme, setTheme] = useState(loadTheme);
  const [docs, setDocs] = useState([]);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [liveTools, setLiveTools] = useState([]);
  const [draft, setDraft] = useState("");
  const [lastEventAt, setLastEventAt] = useState(0);

  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const active = chats.find((c) => c.id === activeId) ?? chats[0];

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
  }, [active.messages, draft, liveTools]);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(""), 4000);
  }

  function updateChat(id, fn) {
    setChats((all) => all.map((c) => (c.id === id ? fn(c) : c)));
  }

  function newChat() {
    if (loading) return;
    if (active.messages.length === 0) return;
    const chat = makeChat();
    setChats((all) => [chat, ...all]);
    setActiveId(chat.id);
    setSidebarOpen(false);
  }

  function deleteChat(id) {
    if (loading) return;
    const rest = chats.filter((c) => c.id !== id);
    if (rest.length === 0) {
      const chat = makeChat();
      setChats([chat]);
      setActiveId(chat.id);
    } else {
      setChats(rest);
      if (id === activeId) setActiveId(rest[0].id);
    }
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

  async function ask(text) {
    const q = text.trim();
    if (!q || loading) return;
    const chatId = active.id;
    const startedAt = nowMs();

    updateChat(chatId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? q.slice(0, 40) : c.title,
      messages: [...c.messages, { role: "user", text: q }],
    }));
    setLoading(true);
    setLiveTools([]);
    setDraft("");
    setLastEventAt(startedAt);

    const controller = new AbortController();
    abortRef.current = controller;
    const tools = [];
    let answer = "";
    let draftText = "";
    const secs = () => Math.round((Date.now() - startedAt) / 1000);
    const finish = (message) =>
      updateChat(chatId, (c) => ({ ...c, messages: [...c.messages, message] }));

    try {
      await askAgentStream(
        q,
        (event) => {
          setLastEventAt(Date.now());
          if (event.type === "token") {
            draftText += event.text;
            setDraft(draftText);
          } else if (event.type === "answer") {
            answer = event.text;
          } else if (event.type === "tool_call") {
            draftText = ""; // model chose a tool: discard text it wrote before
            setDraft("");
            tools.push({ tool: event.tool, arg: firstArg(event.args), status: "running" });
            setLiveTools([...tools]);
          } else if (event.type === "tool_result") {
            const t = [...tools].reverse().find((x) => x.tool === event.tool && x.status === "running");
            if (t) {
              t.status = "done";
              t.preview = event.preview;
            }
            setLiveTools([...tools]);
          }
        },
        controller.signal,
      );
      finish({ role: "assistant", text: answer, tools, secs: secs() });
    } catch (err) {
      if (err.name === "AbortError") {
        finish({ role: "assistant", text: draftText || "Stopped.", tools, secs: secs(), stopped: true });
      } else {
        finish({ role: "assistant", text: `Something went wrong: ${err.message}`, tools, secs: secs() });
      }
    } finally {
      setLoading(false);
      setLiveTools([]);
      setDraft("");
      abortRef.current = null;
    }
  }

  const running = liveTools.find((t) => t.status === "running");
  const statusLabel = draft ? "Writing answer" : running ? "Working" : "Thinking";
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
                      <ToolTrace tools={liveTools} live />
                      {draft && <Markdown text={draft} />}
                      <div className="working">
                        <span className="dot" /> {statusLabel}{" "}
                        <Elapsed key={lastEventAt} since={lastEventAt} />
                      </div>
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
