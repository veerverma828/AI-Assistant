import { useState } from "react";
import Markdown from "./Markdown";

// Shown when the agent wants to run a gated action (saving a report) and waits for the user.
export default function ApprovalCard({ approval, busy, onDecide }) {
  const { status, args } = approval;
  const pending = status === "pending";

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(args.title ?? "");
  const [content, setContent] = useState(args.content ?? "");

  function decide(approved) {
    // send edits only when the user actually changed something
    const edits = {};
    if (title !== (args.title ?? "")) edits.title = title;
    if (content !== (args.content ?? "")) edits.content = content;
    onDecide(approved, edits);
  }

  return (
    <div className={`approval ${status}`}>
      <div className="approval-head">
        <span className="approval-label">{pending ? "Approval needed" : "Report"}</span>
        <span className="approval-sub">
          {approval.manual ? (
            "Save the answer above as a report"
          ) : (
            <>The agent wants to save a report <code className="tool-pill">{approval.tool}</code></>
          )}
        </span>
        {!pending && (
          <span className={`approval-status ${status}`}>
            {status === "approved" ? (approval.savedAs ? `Saved · ${approval.savedAs}` : "Approved") : "Rejected"}
          </span>
        )}
      </div>

      {editing && pending ? (
        <div className="approval-edit">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} />
        </div>
      ) : approval.manual ? (
        // the content is the answer right above, so only the title is repeated here
        <div className="approval-preview">
          <div className="approval-title">{title}</div>
          <div className="approval-sub">{content.length.toLocaleString()} characters</div>
        </div>
      ) : (
        <div className="approval-preview">
          <div className="approval-title">{args.title}</div>
          <Markdown text={args.content ?? ""} />
        </div>
      )}

      {pending && (
        <div className="approval-actions">
          <button className="btn primary" disabled={busy} onClick={() => decide(true)}>
            Approve and save
          </button>
          <button className="btn" disabled={busy} onClick={() => setEditing((e) => !e)}>
            {editing ? "Preview" : "Edit"}
          </button>
          <button className="btn danger" disabled={busy} onClick={() => decide(false)}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
