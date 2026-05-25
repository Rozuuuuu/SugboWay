import os
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

load_dotenv()

models_to_test = [
    "models/embedding-001",
    "models/text-embedding-004",
    "models/gemini-embedding-001",
    "models/gemini-embedding-2"
]

for model in models_to_test:
    print(f"\nTesting {model}...")
    try:
        e = GoogleGenerativeAIEmbeddings(model=model, google_api_key=os.getenv("GEMINI_API_KEY"))
        result = e.embed_query("hi")
        print(f"Success! Dimension: {len(result)}")
    except Exception as ex:
        print(f"Error: {ex}")
