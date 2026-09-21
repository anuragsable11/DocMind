from app.embedder import create_embeddings
from app.vector_store import search_chunks
from app.context_builder import build_context
from app.llm import generate_answer


def answer_question(question,document_id):
    # 1. Convert question into an embedding
    question_embedding = create_embeddings([question])[0]

    # 2. Retrieve relevant chunks
    results = search_chunks(
    question_embedding,
    top_k=3,
    document_id=document_id
)
    distances = results["distances"][0]

    if distances[0] > 0.5:
        return {
            "answer": "I couldn't find the answer in the document.",
            "sources": []
        }

    # 3. Build context
    context = build_context(results)

    # 4. Create RAG prompt
    prompt = f"""
You are a helpful assistant answering questions about a document.

Use ONLY the context provided below to answer the question.

If the answer cannot be found in the context, say:
"I couldn't find the answer in the document."

Context:
{context}

Question:
{question}

Answer:
"""

    # 5. Generate answer
    answer = generate_answer(prompt)

    # 6. Get source pages
    pages = results["metadatas"][0]

    source_pages = sorted(
        set(metadata["page"] for metadata in pages)
    )

    return {
        "answer": answer,
        "sources": source_pages
    }


if __name__ == "__main__":
    question = "What is Mactyg?"

    result = answer_question(question)

    print("\n========== ANSWER ==========\n")
    print(result["answer"])

    print("\n========== SOURCES ==========\n")
    for page in result["sources"]:
        print(f"Page {page}")