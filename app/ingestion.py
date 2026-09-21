from app.pdf_reader import extract_text_from_pdf
from app.chunker import chunk_text
from app.embedder import create_embeddings
from app.vector_store import add_chunks


def ingest_pdf(file_path, document_id, filename):

    pages = extract_text_from_pdf(file_path)

    all_chunks = []

    for page in pages:

        chunks = chunk_text(page["text"])

        for chunk in chunks:

            all_chunks.append({
                "text": chunk,
                "page_number": page["page_number"]
            })


    texts = [chunk["text"] for chunk in all_chunks]

    embeddings = create_embeddings(texts)


    add_chunks(
        all_chunks,
        embeddings,
        document_id,
        filename
    )


    return all_chunks