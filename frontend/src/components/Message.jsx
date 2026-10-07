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

export default function Message({ message }) {
  if (message.role === "user") {
    return (
      <div className="row user">
        <div className="user-bubble">{message.text}</div>
      </div>
    );
  }

  return (
    <div className="row assistant">
      <Avatar />
      <div className="assistant-body">
        <ToolTrace steps={stepsOf(message)} secs={message.secs} />
        <Markdown text={message.text} />
        {message.stopped && <div className="stopped">Stopped</div>}
      </div>
    </div>
  );
}
