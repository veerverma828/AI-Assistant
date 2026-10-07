import { useState } from "react";
import ReactMarkdown from "react-markdown";

function extractText(node) {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node?.props) return extractText(node.props.children);
  return "";
}

// Code block with a copy button.
function Pre({ children }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(extractText(children));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: ignore */
    }
  }

  return (
    <div className="codeblock">
      <button className="copy-btn" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>{children}</pre>
    </div>
  );
}

// Renders Markdown (bold, lists, links, code) like a real chat. Links open in a new tab.
export default function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: Pre,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
