from app.embedder import create_embeddings
from app.vector_store import search_chunks

question = "What is the capital of France?"

question_embedding = create_embeddings([question])[0]

results = search_chunks(question_embedding, top_k=3)

for i in range(len(results["documents"][0])):
    print(f"\n--- Result {i + 1} ---")
    print("Page:", results["metadatas"][0][i]["page"])
    print("Distance:", results["distances"][0][i])
    print("Text:", results["documents"][0][i])