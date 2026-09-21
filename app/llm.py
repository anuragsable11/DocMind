import ollama


def generate_answer(prompt):
    response = ollama.chat(
        model="qwen3:4b",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    return response["message"]["content"]


if __name__ == "__main__":
    answer = generate_answer("Explain machine learning in one sentence.")

    print("\nAnswer:")
    print(answer)