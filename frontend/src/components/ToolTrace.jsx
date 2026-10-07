import Elapsed from "./Elapsed";

const SVG = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

function Icon({ step }) {
  if (step.kind === "note") {
    return (
      <svg {...SVG}>
        <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
      </svg>
    );
  }
  if (step.tool === "web_search" || step.tool === "fetch_page") {
    return (
      <svg {...SVG}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
    );
  }
  return (
    <svg {...SVG}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}

function ToolBody({ step, running }) {
  const s = step.summary;
  return (
    <>
      <div className="trace-title">
        {running ? "Using" : "Used"} <code className="tool-pill">{step.tool}</code> tool
      </div>
      {step.arg && <div className="trace-query">{step.arg}</div>}
      {s ? (
        <>
          <div className="trace-result">{s.text}</div>
          {s.items?.length > 0 && (
            <div className="chips">
              {s.items.map((it, i) => <span key={i} className="chip">{it}</span>)}
            </div>
          )}
        </>
      ) : (
        step.preview && <div className="trace-preview">{step.preview}</div>
      )}
    </>
  );
}

function Item({ step }) {
  return (
    <li className="trace-item">
      <span className="trace-icon"><Icon step={step} /></span>
      <div className="trace-body">
        {step.kind === "tool" ? (
          <ToolBody step={step} running={false} />
        ) : (
          <>
            <div className="trace-title">Plan</div>
            <div className="trace-preview note">{step.preview}</div>
          </>
        )}
      </div>
    </li>
  );
}

// Short present-tense line for whatever the agent is doing right now.
function LiveLabel({ step }) {
  if (!step || step.kind === "thinking") {
    return <>{step && step.step > 1 ? "Reviewing results" : "Analyzing"}…</>;
  }
  if (step.kind === "writing") return <>Writing…</>;
  if (step.kind === "tool") {
    return (
      <>
        Using <code className="tool-pill">{step.tool}</code> tool
        {step.arg && <span className="live-arg"> · {step.arg}</span>}…
      </>
    );
  }
  return <>Working…</>;
}

// Only steps worth keeping: tool calls and plan notes. Thinking/writing steps are transient.
const keep = (s) => s.kind === "tool" || s.kind === "note";

function summaryText(list, secs) {
  const tools = list.filter((s) => s.kind === "tool").length;
  const base = tools ? `Used ${tools} ${tools === 1 ? "tool" : "tools"}` : "Plan";
  return secs != null ? `${base} · ${secs}s` : base;
}

// live: one status line for the current step, finished steps listed above it.
// finished: a collapsed "Used N tools" summary (nothing at all if no tool was used).
export default function ToolTrace({ steps, live = false, secs, runStart }) {
  const list = (steps ?? []).filter(keep);

  if (live) {
    const done = list.filter((s) => s.status !== "running");
    const current = (steps ?? []).find((s) => s.status === "running");
    return (
      <div className="trace-live">
        {done.length > 0 && (
          <details className="trace" open>
            <summary>{summaryText(done)}</summary>
            <ul className="trace-list">
              {done.map((s, i) => <Item key={i} step={s} />)}
            </ul>
          </details>
        )}
        <div className="working">
          <span className="dot" />
          <span><LiveLabel step={current} /></span>
          <Elapsed since={runStart} />
        </div>
      </div>
    );
  }

  if (list.length === 0) return null;
  return (
    <details className="trace">
      <summary>{summaryText(list, secs)}</summary>
      <ul className="trace-list">
        {list.map((s, i) => <Item key={i} step={s} />)}
      </ul>
    </details>
  );
}
