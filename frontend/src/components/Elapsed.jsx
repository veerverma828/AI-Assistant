import { useEffect, useState } from "react";

// Counts seconds since `since`, so waiting never looks frozen.
export default function Elapsed({ since }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="elapsed">{Math.floor((now - since) / 1000)}s</span>;
}
