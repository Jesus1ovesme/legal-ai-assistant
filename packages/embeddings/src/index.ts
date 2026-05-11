/**
 * @legal-ai-assistant/embeddings — провайдер эмбеддингов и chunker для RAG.
 *
 * **Реализация Phase 4** (см. ROADMAP.md). MVP-провайдер: `intfloat/multilingual-e5-large`
 * локально через @huggingface/transformers (1024 dim, ~2.5 GB RAM CPU). Адаптер позволяет
 * переключиться на OpenAI / YandexGPT через env `EMBEDDING_PROVIDER`.
 *
 * Pipeline: file → MIME → OCR → chunker (recursive split, 800 tokens, overlap 100) →
 * batch embed (16 чанков за раз) → upsert pgvector.
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  /** kind управляет префиксом для e5-моделей: passage: для индексации, query: для поиска. */
  embed(texts: string[], kind: "passage" | "query"): Promise<number[][]>;
}

export const DEFAULT_DIM = 1024;
export const DEFAULT_CHUNK_TOKENS = 800;
export const DEFAULT_CHUNK_OVERLAP = 100;
