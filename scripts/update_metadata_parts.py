import os
import json
import re

def update_metadata_json(library_dir):
    """
    Updates all metadata.json files in the specified library directory
    to replace 'adhyayas' with 'id' in the 'parts' array.
    """
    for root, _, files in os.walk(library_dir):
        for file in files:
            if file == "metadata.json":
                filepath = os.path.join(root, file);
                print(f"Processing {filepath}...")
                with open(filepath, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)

                if "parts" in metadata and isinstance(metadata["parts"], list):
                    updated_parts = []
                    for part in metadata["parts"]:
                        if "file" in part:
                            part_filename = part["file"]
                            # Extract part ID from filename (e.g., "part1.json" -> "part1")
                            part_id = part_filename.replace(".json", "")
                            updated_parts.append({"file": part_filename, "id": part_id})
                        else:
                            updated_parts.append(part) # Keep as is if no file key
                    metadata["parts"] = updated_parts

                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(metadata, f, ensure_ascii=False, indent=2)
                    print(f"Updated {filepath}")

if __name__ == "__main__":
    library_path = "public/data/library"
    update_metadata_json(library_path)
