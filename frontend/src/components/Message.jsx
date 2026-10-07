import Markdown from "./Markdown";
import ToolTrace from "./ToolTrace";

export function Avatar() {
  return <span className="avatar">Q</span>;
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
        <ToolTrace tools={message.tools} secs={message.secs} />
        <Markdown text={message.text} />
        {message.stopped && <div className="stopped">Stopped</div>}
      </div>
    </div>
  );
}
