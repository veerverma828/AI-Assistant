import chromadb
import ollama

EMBED_MODEL = "nomic-embed-text"
BATCH_SIZE = 32

client = chromadb.PersistentClient(path="data/chroma")
collection = client.get_or_create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"},
)


def embed(texts: list[str]) -> list[list[float]]:
    """Turn texts into vectors with the local Ollama embedding model."""
    return ollama.embed(model=EMBED_MODEL, input=texts).embeddings


def add_chunks(chunks: list[dict]) -> int:
    """Embed chunks and store them. Same file re-uploaded overwrites, no duplicates."""
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        vectors = embed([f"search_document: {c['text']}" for c in batch])
        collection.upsert(
            ids=[f"{c['source']}-p{c['page']}-c{c['chunk_index']}" for c in batch],
            documents=[c["text"] for c in batch],
            embeddings=vectors,
            metadatas=[
                {"source": c["source"], "page": c["page"], "chunk_index": c["chunk_index"]}
                for c in batch
            ],
        )
    return len(chunks)


def search(query: str, k: int = 4) -> list[dict]:
    """Return the k chunks closest in meaning to the query."""
    vector = embed([f"search_query: {query}"])
    result = collection.query(query_embeddings=vector, n_results=k)
    return [
        {
            "text": text,
            "source": meta["source"],
            "page": meta["page"],
            "distance": round(dist, 4),
        }
        for text, meta, dist in zip(
            result["documents"][0], result["metadatas"][0], result["distances"][0]
        )
    ]
