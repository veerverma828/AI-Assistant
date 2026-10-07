import { useState } from "react";
import { reportUrl } from "../api";

const VISIBLE_ROWS = 5;
const SECTION_KEY = "querywise.sidebar.";

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="missing-x" width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-label="File missing">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function readOpen(id, fallback) {
  try {
    const saved = localStorage.getItem(SECTION_KEY + id);
    return saved === null ? fallback : saved === "1";
  } catch {
    return fallback;
  }
}

// A foldable sidebar section: "▸ Documents  3". The open/closed state is remembered.
function Section({ id, title, count, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(SECTION_KEY + id, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="side-section">
      <button className="side-head" onClick={toggle} aria-expanded={open}>
        <svg className={`chev ${open ? "open" : ""}`} width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
        <span>{title}</span>
        <span className="count">{count}</span>
        {badge}
      </button>
      {open && <div className="side-body">{children}</div>}
    </section>
  );
}

// Shows the first few rows, with "Show N more". `pinned` rows (e.g. the open chat) always show.
function Limited({ items, render, pinned = () => false, limit = VISIBLE_ROWS }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.filter((item, i) => i < limit || pinned(item));
  const hidden = items.length - shown.length;
  return (
    <>
      <ul className="list">{shown.map(render)}</ul>
      {(hidden > 0 || (expanded && items.length > limit)) && (
        <button className="show-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </>
  );
}

export default function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  docs,
  reports = [],
  onDeleteDoc,
  onDeleteReport,
  theme,
  onToggleTheme,
  open,
  onClose,
}) {
  const missing = docs.filter((d) => !d.file_on_disk).length;

  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <span className="logo">Q</span>
          <span className="brand-name">Querywise</span>
        </div>

        <button className="new-chat" onClick={onNew}>
          <span>+</span> New chat
        </button>

        <div className="side-scroll">
          <Section id="recent" title="Recent" count={chats.length} defaultOpen>
            {chats.length === 0 ? (
              <p className="empty-docs">No conversations yet.</p>
            ) : (
              <Limited
                items={chats}
                pinned={(c) => c.id === activeId}
                render={(c) => (
                  <li key={c.id} className={`row-item chat ${c.id === activeId ? "active" : ""}`}>
                    <button className="chat-item" onClick={() => onSelect(c.id)}>
                      {c.title}
                    </button>
                    <button className="chat-delete" title="Delete chat" onClick={() => onDelete(c.id)}>
                      ×
                    </button>
                  </li>
                )}
              />
            )}
          </Section>

          <Section
            id="documents"
            title="Documents"
            count={docs.length}
            badge={
              missing > 0 && (
                <span className="head-warn" title={`${missing} document(s) have no file, only chunks`}>
                  <XIcon />
                </span>
              )
            }
          >
            {docs.length === 0 ? (
              <p className="empty-docs">No documents yet. Use the attach icon to add one.</p>
            ) : (
              <Limited
                items={docs}
                render={(d) => (
                  <li
                    key={d.source}
                    className={`row-item ${d.file_on_disk ? "" : "missing"}`}
                    title={
                      d.file_on_disk
                        ? d.source
                        : `${d.source}: file not found in uploads, only its chunks remain`
                    }
                  >
                    <span className="doc-name">{d.source}</span>
                    {!d.file_on_disk && <XIcon />}
                    <span className="doc-meta">{d.chunks} chunks</span>
                    <button
                      className="doc-delete"
                      title={`Delete ${d.source}`}
                      aria-label={`Delete ${d.source}`}
                      onClick={() => onDeleteDoc(d.source)}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                )}
              />
            )}
          </Section>

          <Section id="reports" title="Reports" count={reports.length}>
            {reports.length === 0 ? (
              <p className="empty-docs">No saved reports.</p>
            ) : (
              <Limited
                items={reports}
                render={(r) => (
                  <li key={r} className="row-item" title={r}>
                    <a className="doc-name report-link" href={reportUrl(r)} target="_blank" rel="noreferrer">
                      {r.replace(/-\d{8}-\d{6}\.md$/, "")}
                    </a>
                    <button
                      className="doc-delete"
                      title={`Delete ${r}`}
                      aria-label={`Delete ${r}`}
                      onClick={() => onDeleteReport(r)}
                    >
                      <TrashIcon />
                    </button>
                  </li>
                )}
              />
            )}
          </Section>
        </div>

        <div className="side-footer">
          <button className="theme-btn" onClick={onToggleTheme}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>
    </>
  );
}
