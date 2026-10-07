const LABELS = {
  search_documents: "Searched documents",
  list_documents: "Listed documents",
  get_chunks: "Read document chunks",
  web_search: "Searched the web",
  fetch_page: "Read a web page",
};

function Icon({ tool }) {
  const web = tool === "web_search" || tool === "fetch_page";
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {web ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      ) : (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </>
      )}
    </svg>
  );
}

function Item({ t }) {
  return (
    <li className={`trace-item ${t.status}`}>
      <span className="trace-icon"><Icon tool={t.tool} /></span>
      <div className="trace-body">
        <div className="trace-title">
          {LABELS[t.tool] ?? t.tool}
          {t.arg && <span className="trace-arg"> · {t.arg}</span>}
        </div>
        {t.preview && <div className="trace-preview">{t.preview}</div>}
      </div>
      <span className="trace-state">
        {t.status === "running" ? <span className="dot" /> : <span className="check">✓</span>}
      </span>
    </li>
  );
}

// live: always open list while the agent works. Finished: collapsible summary.
export default function ToolTrace({ tools, live = false, secs }) {
  if (!tools?.length) return null;
  const list = (
    <ul className="trace-list">
      {tools.map((t, i) => <Item key={i} t={t} />)}
    </ul>
  );
  if (live) return <div className="trace">{list}</div>;

  return (
    <details className="trace">
      <summary>
        Used {tools.length} {tools.length === 1 ? "tool" : "tools"}
        {secs != null && ` · ${secs}s`}
      </summary>
      {list}
    </details>
  );
}
