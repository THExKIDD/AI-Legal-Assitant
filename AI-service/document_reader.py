import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Check local directory first, then parent directory, then custom env
candidate_paths = [
    os.getenv("DOCUMENTS_FOLDER"),
    os.path.join(BASE_DIR, "legal-documents"),
    os.path.abspath(os.path.join(BASE_DIR, "..", "legal-documents")),
]

DOCUMENTS_FOLDER = next(
    (p for p in candidate_paths if p and os.path.exists(p)),
    os.path.abspath(os.path.join(BASE_DIR, "..", "legal-documents"))
)


def read_documents():
    documents = {}

    if not os.path.exists(DOCUMENTS_FOLDER):
        print(f"Warning: Legal documents folder not found at {DOCUMENTS_FOLDER}")
        return documents

    for file in os.listdir(DOCUMENTS_FOLDER):
        if file.endswith(".txt"):
            path = os.path.join(DOCUMENTS_FOLDER, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                documents[file] = content

    return documents
