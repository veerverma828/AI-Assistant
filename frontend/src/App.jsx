import { useEffect, useRef, useState } from "react";
import {
  approveAction,
  askAgentStream,
  deleteDocument,
  deleteReport,
  listDocuments,
  listReports,
  saveReportDirect,
  uploadFile,
} from "./api";
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

// What the agent sees of earlier turns: plain text only (no tool steps), errors left out.
const HISTORY_MESSAGES = 6;
function toHistory(messages) {
  return messages
    .filter((m) => !m.error)
    .map((m) => ({
      role: m.role,
      content:
        m.text ||
        (m.approval
          ? `Drafted report "${m.approval.args.title}" (${m.approval.status}):\n${m.approval.args.content}`
          : ""),
    }))
    .filter((m) => m.content)
    .slice(-HISTORY_MESSAGES);
}

// Title for a report made from an answer: its first Markdown heading, else the question.
function deriveTitle(text, question) {
  const heading = text.match(/^#{1,3}\s+(.+)$/m)?.[1];
  return (heading || question || "Report").trim().slice(0, 60);
}

export default function App() {
  // `chats` = saved conversations (the Recent list). `draftChat` = the blank temporary
  // chat shown when activeId is null; it joins `chats` only after the first message.
  const [chats, setChats] = useState(loadChats);
  const [draftChat, setDraftChat] = useState(makeChat);
  const [activeId, setActiveId] = useState(null);
  const [theme, setTheme] = useState(loadTheme);
  const [docs, setDocs] = useState([]);
  const [reports, setReports] = useState([]);
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
    listReports()
      .then((r) => !cancelled && setReports(r))
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

  async function handleDeleteReport(name) {
    if (!window.confirm(`Delete report "${name}"? This cannot be undone.`)) return;
    try {
      await deleteReport(name);
      showToast(`Deleted ${name}`);
      setReports(await listReports());
    } catch (err) {
      showToast(err.message);
    }
  }

  // Runs one agent turn. `startStream(onEvent, signal)` opens either a new question
  // or the resume-after-approval stream; both send the same kinds of events.
  async function runAgent(chatId, startStream) {
    const startedAt = nowMs();
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
    let approval = null;
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

    // Text streamed before a tool call was the model's plan, not the answer:
    // swap the "writing" step for a visible "Plan" note.
    const takePlan = () => {
      const plan = draftText.trim();
      draftText = "";
      setDraft("");
      writing = false;
      const planIdx = steps.findLastIndex((s) => s.kind === "writing");
      if (planIdx !== -1) steps.splice(planIdx, 1);
      closeRunning((s) => s.kind === "thinking");
      if (plan) steps.push({ kind: "note", preview: plan, status: "done" });
    };

    try {
      await startStream((event) => {
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
        } else if (event.type === "discard_text") {
          // the server asked the model to retry: drop the text shown so far
          draftText = "";
          setDraft("");
          writing = false;
          const idx = steps.findLastIndex((s) => s.kind === "writing");
          if (idx !== -1) steps.splice(idx, 1);
          sync();
        } else if (event.type === "answer") {
          answer = event.text;
        } else if (event.type === "tool_call") {
          takePlan();
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
        } else if (event.type === "approval_required") {
          // the agent stopped and waits for the user: the card is shown in the final message
          takePlan();
          approval = { id: event.id, tool: event.tool, args: event.args, status: "pending" };
          sync();
        }
      }, controller.signal);
      finish({ role: "assistant", text: answer, steps: snapshot("done"), secs: secs(), approval });
    } catch (err) {
      if (err.name === "AbortError") {
        finish({ role: "assistant", text: draftText || "Stopped.", steps: snapshot("stopped"), secs: secs(), stopped: true });
      } else {
        finish({ role: "assistant", text: `Something went wrong: ${err.message}`, steps: snapshot("stopped"), secs: secs(), error: true });
      }
    } finally {
      setLoading(false);
      setLiveSteps([]);
      setDraft("");
      abortRef.current = null;
      listReports().then(setReports).catch(() => {});
    }
  }

  async function ask(text) {
    const q = text.trim();
    if (!q || loading) return;
    const chatId = active.id;

    const userMessage = { role: "user", text: q };
    if (chats.some((c) => c.id === chatId)) {
      updateChat(chatId, (c) => ({ ...c, messages: [...c.messages, userMessage] }));
    } else {
      // first message of the blank chat: only now does it enter Recent
      setChats((all) => [{ ...active, title: q.slice(0, 40), messages: [userMessage] }, ...all]);
      setActiveId(chatId);
      setDraftChat(makeChat());
    }
    const history = toHistory(active.messages); // messages before this question
    await runAgent(chatId, (onEvent, signal) => askAgentStream(q, onEvent, signal, history));
  }

  // The user clicked Approve or Reject on an approval card.
  function patchApproval(chatId, messageIndex, patch) {
    updateChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m, i) =>
        i === messageIndex ? { ...m, approval: { ...m.approval, ...patch } } : m,
      ),
    }));
  }

  async function decide(messageIndex, approved, edits) {
    if (loading) return;
    const chatId = active.id;
    const { id, manual, args } = active.messages[messageIndex].approval;
    const finalArgs = { ...args, ...edits };
    patchApproval(chatId, messageIndex, { status: approved ? "approved" : "rejected", args: finalArgs });

    if (!manual) {
      await runAgent(chatId, (onEvent, signal) => approveAction(id, approved, edits, onEvent, signal));
      return;
    }
    // "Save as report": the same card, but saving goes straight to the API (no agent)
    if (!approved) return;
    try {
      const saved = await saveReportDirect(finalArgs.title, finalArgs.content);
      patchApproval(chatId, messageIndex, { savedAs: saved.saved });
      showToast(`Saved ${saved.saved}`);
      setReports(await listReports());
    } catch (err) {
      patchApproval(chatId, messageIndex, { status: "pending" });
      showToast(err.message);
    }
  }

  // "Save as report" button under an answer: opens the approval card for that answer.
  function startManualReport(messageIndex) {
    if (loading) return;
    const message = active.messages[messageIndex];
    const question = active.messages.slice(0, messageIndex).findLast((m) => m.role === "user")?.text;
    patchApproval(active.id, messageIndex, {
      manual: true,
      tool: "save_report",
      status: "pending",
      args: { title: deriveTitle(message.text, question), content: message.text },
    });
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
        reports={reports}
        onDeleteDoc={handleDeleteDoc}
        onDeleteReport={handleDeleteReport}
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
                  <Message
                    key={i}
                    message={m}
                    busy={loading}
                    onDecide={(approved, edits) => decide(i, approved, edits)}
                    onSaveAsReport={() => startManualReport(i)}
                  />
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
