from pathlib import Path

from pypdf import PdfReader

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


def extract_pages(path: Path) -> list[dict]:
    """Return [{"page": 1, "text": "..."}, ...] for a PDF or TXT file."""
    if path.suffix.lower() == ".pdf":
        reader = PdfReader(path)
        return [
            {"page": i + 1, "text": page.extract_text() or ""}
            for i, page in enumerate(reader.pages)
        ]
    return [{"page": 1, "text": path.read_text(encoding="utf-8", errors="ignore")}]


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Slide a window over text. Each chunk repeats the last `overlap` chars of the previous one."""
    text = text.strip()
    if not text:
        return []
    step = size - overlap
    return [text[start : start + size] for start in range(0, len(text), step)]


def build_chunks(path: Path) -> list[dict]:
    """Chunk every page, keep filename + page number as metadata for citations."""
    chunks = []
    for page in extract_pages(path):
        for i, piece in enumerate(chunk_text(page["text"])):
            chunks.append(
                {
                    "source": path.name,
                    "page": page["page"],
                    "chunk_index": i,
                    "text": piece,
                }
            )
    return chunks
