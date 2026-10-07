import { useRef, useState } from "react";

export default function Composer({ onSend, onStop, loading, onPickFile }) {
  const [value, setValue] = useState("");
  const textRef = useRef(null);
  const fileRef = useRef(null);

  function resize() {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submit() {
    if (!value.trim() || loading) return;
    onSend(value);
    setValue("");
    if (textRef.current) textRef.current.style.height = "auto";
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <button
          type="button"
          className="icon-btn"
          title="Upload a document"
          onClick={() => fileRef.current.click()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3" />
          </svg>
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
        <textarea
          ref={textRef}
          rows={1}
          value={value}
          placeholder="Ask about your documents or the web..."
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
        />
        {loading ? (
          <button type="button" className="send stop" title="Stop" onClick={onStop}>
            <span className="stop-square" />
          </button>
        ) : (
          <button
            type="button"
            className="send"
            title="Send"
            disabled={!value.trim()}
            onClick={submit}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        )}
      </div>
      <p className="hint">Querywise runs locally with Ollama. Answers can be wrong: check sources.</p>
    </div>
  );
}
