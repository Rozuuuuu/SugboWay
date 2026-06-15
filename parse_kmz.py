import os
import zipfile
import xml.etree.ElementTree as ET

filepath = r"C:\Users\Lloyd\.gemini\antigravity-ide\brain\4fa8ba7f-f651-494c-9fe4-46d15117f7e0\.system_generated\steps\80\content.md"

print("File size:", os.path.getsize(filepath))

try:
    with zipfile.ZipFile(filepath, 'r') as zip_ref:
        print("Zip contents:", zip_ref.namelist())
        zip_ref.extractall("extracted_kml")
        print("Extracted successfully!")
except Exception as e:
    print("Not a zip/kmz or failed to extract:", e)
    # Read as text
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            print("First 500 chars:")
            print(f.read(500))
    except Exception as e2:
        print("Failed to read as text:", e2)
