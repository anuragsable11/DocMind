def build_context(results):
    context_parts = []

    documents = results["documents"][0]
    metadatas = results["metadatas"][0]

    for document, metadata in zip(documents, metadatas):

        context_parts.append(
            f"[Page {metadata['page']}]\n{document}"
        )

    return "\n\n".join(context_parts)