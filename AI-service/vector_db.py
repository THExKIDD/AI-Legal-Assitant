import os
import chromadb
from document_reader import read_documents

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")

client = chromadb.PersistentClient(
    path=CHROMA_PATH
)

collection = client.get_or_create_collection(
    name="legal_documents"
)


def split_text(text, size=500):

    chunks = []

    for i in range(0, len(text), size):
        chunks.append(text[i:i + size])

    return chunks


def add_documents():

    documents = read_documents()

    ids = []
    texts = []
    metadatas = []

    for file_name in documents:

        content = documents[file_name]

        chunks = split_text(content)

        for i in range(len(chunks)):

            ids.append(file_name + "_" + str(i))

            texts.append(chunks[i])

            metadatas.append({
                "source": file_name
            })

    if ids:
        collection.upsert(
            ids=ids,
            documents=texts,
            metadatas=metadatas
        )


def search_document(question):

    result = collection.query(
        query_texts=[question],
        n_results=3
    )

    documents = result.get("documents", [[]])[0]
    metadatas = result.get("metadatas", [[]])[0]

    combined_text = "\n\n".join(documents) if documents else ""

    sources = []
    for meta in metadatas:
        if meta and "source" in meta:
            src = meta["source"]
            if src not in sources:
                sources.append(src)

    source = ", ".join(sources) if sources else ""

    return combined_text, source