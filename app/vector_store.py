import chromadb


client = chromadb.PersistentClient(path="./chroma_db")

collection = client.get_or_create_collection(
    name="documents",
    metadata={
        "hnsw:space": "cosine"
    }
)


def add_chunks(chunks, embeddings, document_id, filename):

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):

        chunk_id = f"{document_id}_chunk_{i}"

        collection.add(
            ids=[chunk_id],

            documents=[chunk["text"]],

            embeddings=[embedding.tolist()],

            metadatas=[{
                "document_id": document_id,
                "filename": filename,
                "page": chunk["page_number"]
            }]
        )


def search_chunks(query_embedding, top_k=3, document_id=None):

    query = {
        "query_embeddings": [query_embedding.tolist()],
        "n_results": top_k
    }

    if document_id:
        query["where"] = {
            "document_id": document_id
        }

    results = collection.query(**query)

    return results