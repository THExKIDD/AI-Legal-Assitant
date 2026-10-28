import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCUMENTS_FOLDER = os.path.abspath(os.path.join(BASE_DIR, "..", "legal-documents"))


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