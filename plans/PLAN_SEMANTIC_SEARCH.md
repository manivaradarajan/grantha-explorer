# PLAN_SEMANTIC_SEARCH.md

## 1. Project Goal & Core Principles

**Objective:** To build a web application with a high-performance, conceptually-aware search engine for a corpus of Vedānta texts. The search must understand the semantic relationships between philosophical concepts, not just keyword matches.

**Core Principles:**

- **Sanskrit-Centric, English-Augmented:** The system will treat the original Sanskrit as the source of truth, while leveraging English translations and commentaries to power the AI's semantic understanding.
- **Lean & Cost-Effective Runtime:** The architecture will be designed to minimize ongoing operational costs and ensure a fast user experience by pushing all heavy computation to an offline, one-time process.
- **Deeply Functional:** The system will support not only a main search box but also contextual search on arbitrary phrases selected by the user, transforming it from a simple search engine into a powerful study tool.

## 2. Technology Stack & Key Decisions

- **Corpus Processing LLM:** **Google Gemini Pro** (via API) for its advanced reasoning and multilingual capabilities in parsing the source markdown into a structured format.
- **Embedding Model:** **OpenAI `text-embedding-3-small`** (via API). This is the definitive choice due to its state-of-the-art performance combined with an exceptionally low cost structure, making it ideal for both the initial bulk embedding and ongoing user queries.
- **Vector Database:** **Pinecone** (managed service). Chosen for its ease of use, excellent performance, and generous free tier, which simplifies infrastructure management. (Alternatives like Weaviate or ChromaDB are also viable).
- **Backend API:** **Python** with **FastAPI** framework, for its speed and modern tooling.
- **Orchestration Scripts:** Python scripts for the offline pipeline.

## 3. System Architecture: Offline vs. Online

The project is split into two phases to ensure a cost-effective and performant final product.

### 3.1. OFFLINE PIPELINE (Build-Time, One-Time Cost)

This is the foundational data preparation stage. It is executed once for the initial corpus and can be re-run to add new texts.

**Goal:** Transform raw markdown files into a fully indexed, searchable vector database.

### 3.2. ONLINE API (Runtime, Low Ongoing Cost)

This is the live backend that powers the web application. It is designed to be stateless, fast, and extremely cheap to operate.

**Goal:** Accept a user query, get a vector, and retrieve relevant documents from the vector database in milliseconds.

## 4. Detailed Implementation Plan: The Offline Pipeline

### Step 4.1: Corpus Structuring (`process_corpus.py`)

**Objective:** Convert all `.md` text files into a single, clean `corpus.json` file.

1.  **Setup:**
    - Create a Python project with `google-generativeai`, `markdown-it-py`, and `pydantic`.
    - Securely store your Google API key.
2.  **Pre-Chunking Logic:**
    - The script will scan a `corpus/` directory for markdown files.
    - For each file, it will perform a rule-based split into coarse chunks (e.g., splitting the text by `## Verse X.Y.Z` headings). This makes the task manageable for the LLM.
3.  **LLM Processing Loop:**
    - The script will iterate through each coarse chunk.
    - It will inject the chunk into a carefully engineered "master prompt" (see Appendix A) that instructs Gemini on the exact JSON structure, IAST transliteration, and data extraction rules.
    - It will call the Gemini API.
4.  **Validation & Error Handling:**
    - The script will receive the text response from Gemini and attempt to parse it as JSON.
    - **On Failure:** The raw chunk and the failed response will be logged to `failed_chunks.log` for manual inspection. The script will then continue.
    - **On Success:** The parsed JSON will be validated against a Pydantic model to enforce the schema (correct field names, data types, etc.). This step is critical for data integrity.
5.  **Output:** All validated JSON objects will be aggregated into a list and saved as `corpus.json`.

### Step 4.2: Embedding Generation (`generate_embeddings.py`)

**Objective:** Create vector embeddings for every chunk in `corpus.json`.

1.  **Setup:**
    - Install the `openai` Python library. Securely store your OpenAI API key.
2.  **Batch Processing:**
    - Load `corpus.json`.
    - Group the `text_for_embedding` fields into batches of a reasonable size (e.g., 100-200).
    - For each batch, make a single API call to the OpenAI Embeddings endpoint with `model='text-embedding-3-small'`.
3.  **Data Structuring:**
    - Associate each returned vector with its original chunk `id` and `metadata`.
4.  **Output:** A file like `corpus_with_vectors.jsonl` (JSON Lines format is good for large datasets) containing objects of the form `{ "id": "...", "vector": [...], "metadata": {...} }`.

### Step 4.3: Vector Indexing (`index_vectors.py`)

**Objective:** Populate the Pinecone vector database.

1.  **Setup:**
    - Sign up for a Pinecone account and get an API key.
    - Create a new "index" in the Pinecone dashboard. Specify the correct vector dimension (1536 for `text-embedding-3-small`).
    - Install the `pinecone-client` library.
2.  **Upserting Data:**
    - The script will connect to your Pinecone index.
    - It will read `corpus_with_vectors.jsonl`.
    - In batches (e.g., 100), it will "upsert" the data into Pinecone. The `upsert` operation requires:
      - `id`: The unique chunk ID.
      - `values`: The embedding vector.
      - `metadata`: The full metadata object, including `display_content`. **Storing this directly in the index is the key to a fast runtime API.**

## 5. Detailed Implementation Plan: The Online API

### Step 5.1: Backend Server Setup (`main.py`)

**Objective:** Create a single API endpoint to handle all semantic search requests.

1.  **Setup:**
    - Use FastAPI to create the web server.
    - Initialize clients for OpenAI and Pinecone at startup.
2.  **Endpoint: `POST /api/semantic_search`**
    - **Request Model (Pydantic):**
      ```python
      class SearchRequest(BaseModel):
          text: str
          top_k: int = 10
      ```
    - **Logic:**
      1.  Receive the `SearchRequest`.
      2.  Call the OpenAI API to embed `request.text` using `text-embedding-3-small`. This is the only OpenAI call at runtime.
      3.  Call the Pinecone index's `query` method with the resulting vector, `top_k`, and `include_metadata=True`. This is the only database call at runtime.
      4.  The Pinecone response will contain the most similar vectors and their associated metadata.
      5.  Format this response into a clean JSON array and return it directly to the client. The API does **no** additional data processing or lookups.

## 6. Frontend Integration

- The frontend application will make calls to the `/api/semantic_search` endpoint.
- A search bar will send the user's typed query.
- A JavaScript event listener on the text display area will capture highlighted text, show a context menu ("Find similar concepts"), and send the selected text to the same endpoint.
- The results will be displayed using the rich `display_content` object returned by the API, showing original Devanagari, IAST, and English commentary.

---

## Appendix A: Master Prompt for Gemini (`master_prompt.txt`)

```prompt
You are an expert Sanskritist and a data processing specialist. Your task is to parse a segment of a Vedānta text and transform it into a specific JSON format. Follow these rules with absolute precision.

**RULES:**
1.  **TRANSLITERATION:** Convert all Devanagari Sanskrit text to IAST with diacritics (e.g., ā, ī, ṛ, ṃ, ḥ, ś, ṣ).
2.  **JSON STRUCTURE:** The final output MUST be a single, valid JSON object without any surrounding text or code blocks.
3.  **METADATA EXTRACTION:** Accurately extract the source work, chapter, verse, and commentator. If commentator is not clear, use "Unknown".
4.  **`text_for_embedding` FIELD:** Concatenate the IAST transliteration of the source verse(s) and the full English translation/commentary into a single, coherent string. This text is for an AI model.
5.  **`display_content` OBJECT:** Keep the original Devanagari, IAST, and English parts separate here for user display.
6.  **ID & URL GENERATION:** Create a unique `id` (e.g., "bg_4.8_sankara") and a `url` slug from the metadata.
7.  **ERROR HANDLING:** If the text is unparsable, your entire output must be: `{"error": "Could not parse the provided text segment."}`

**EXAMPLE JSON OUTPUT FORMAT:**
{
  "id": "isa_1_sankara",
  "source_file": "Isha_Upanishad_Sankara_Bhasya.md",
  "metadata": {
    "work": "Īśa Upaniṣad",
    "commentator": "Ādi Śaṅkara",
    "chapter": 1,
    "verse": 1,
    "url": "/texts/isa-upanishad/sankara/1/1"
  },
  "text_for_embedding": "īśāvāsyam idam sarvam yat kiñca jagatyāṃ jagat | tena tyaktena bhuñjīthā mā gṛdhaḥ kasyasvid dhanam || All this, whatever moves in this moving world, is enveloped by the Lord. By renouncing this, find your enjoyment. Do not covet the wealth of anyone. Śaṅkara explains that 'īśā' refers to the supreme Self, the Paramātman, who is the inner ruler of all...",
  "display_content": {
    "sanskrit_devanagari": "ईशावास्यमिदं सर्वं यत्किञ्च जगत्यां जगत्...",
    "sanskrit_iast": "īśāvāsyam idam sarvam yat kiñca jagatyāṃ jagat...",
    "english_translation": "All this, whatever moves in this moving world, is enveloped by the Lord.",
    "english_commentary": "Śaṅkara explains that 'īśā' refers to the supreme Self, the Paramātman, who is the inner ruler of all..."
  }
}
---
**TEXT TO PROCESS:**

[// The Python script will insert the raw markdown chunk here //]
```
