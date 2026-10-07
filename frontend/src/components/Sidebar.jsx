import { useRef } from "react";

export default function Sidebar({
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  docs,
  onPickFile,
  theme,
  onToggleTheme,
  open,
  onClose,
}) {
  const fileRef = useRef(null);

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
          <h3>Recent</h3>
          <ul className="chat-list">
            {chats.map((c) => (
              <li key={c.id} className={c.id === activeId ? "active" : ""}>
                <button className="chat-item" onClick={() => onSelect(c.id)}>
                  {c.title}
                </button>
                <button
                  className="chat-delete"
                  title="Delete chat"
                  onClick={() => onDelete(c.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <h3>Documents</h3>
          {docs.length === 0 ? (
            <p className="empty-docs">No documents yet.</p>
          ) : (
            <ul className="doc-list">
              {docs.map((d) => (
                <li
                  key={d.source}
                  className={d.file_on_disk ? "" : "missing"}
                  title={
                    d.file_on_disk
                      ? d.source
                      : `${d.source}: file not found in uploads, only its chunks remain`
                  }
                >
                  <span className="doc-name">{d.source}</span>
                  <span className="doc-meta">
                    {!d.file_on_disk && (
                      <svg className="missing-x" width="12" height="12" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"
                        aria-label="File missing">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    )}
                    {d.chunks} chunks
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button className="upload-btn" onClick={() => fileRef.current.click()}>
            Upload document
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt"
            hidden
            onChange={(e) => {
              if (e.target.files[0]) onPickFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
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
