from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


model = SentenceTransformer("all-MiniLM-L6-v2")


sentences = [
    "I love programming.",
    "I enjoy writing code.",
    "I like eating pizza."
]

question = "I like coding."


sentence_embeddings = model.encode(sentences)
question_embedding = model.encode([question])


similarities = cosine_similarity(
    question_embedding,
    sentence_embeddings
)


for sentence, score in zip(sentences, similarities[0]):
    print(f"{score:.4f} → {sentence}")