import ApprovalCard from "./ApprovalCard";
import Markdown from "./Markdown";
import ToolTrace from "./ToolTrace";

export function Avatar() {
  return <span className="avatar">Q</span>;
}

// Older saved chats stored only tools; convert them to the new step shape.
function stepsOf(message) {
  if (message.steps) return message.steps;
  return (message.tools ?? []).map((t) => ({ kind: "tool", ...t }));
}

// Long, finished answers can be saved as a report with one click.
const MIN_REPORT_CHARS = 500;

export default function Message({ message, busy, onDecide, onSaveAsReport }) {
  if (message.role === "user") {
    return (
      <div className="row user">
        <div className="user-bubble">{message.text}</div>
      </div>
    );
  }

  const canSaveAsReport =
    message.text?.length >= MIN_REPORT_CHARS && !message.approval && !message.stopped && !message.error;

  return (
    <div className="row assistant">
      <Avatar />
      <div className="assistant-body">
        <ToolTrace steps={stepsOf(message)} secs={message.secs} />
        {message.text && <Markdown text={message.text} />}
        {canSaveAsReport && (
          <button className="save-report-btn" disabled={busy} onClick={onSaveAsReport}>
            Save as report
          </button>
        )}
        {message.approval && (
          <ApprovalCard approval={message.approval} busy={busy} onDecide={onDecide} />
        )}
        {message.stopped && <div className="stopped">Stopped</div>}
      </div>
    </div>
  );
}
