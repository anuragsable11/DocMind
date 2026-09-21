import fitz


def extract_text_from_pdf(file_path):
    document = fitz.open(file_path)

    pages = []

    for page_number, page in enumerate(document):
        text = page.get_text()

        pages.append({
            "page_number": page_number + 1,
            "text": text
        })

    document.close()

    return pages

if __name__ == "__main__":
    pages = extract_text_from_pdf("documents/ARSResume.pdf")

    for page in pages:
        print(f"\n--- Page {page['page_number']} ---")
        print(page["text"])