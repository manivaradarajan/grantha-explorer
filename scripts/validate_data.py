import json
import os
from jsonschema import validate

def main():
    schema_path = os.path.join(os.path.dirname(__file__), '..', 'schemas', 'grantha.schema.json')
    with open(schema_path, 'r') as f:
        schema = json.load(f)

    data_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
    data_files = [f for f in os.listdir(data_dir) if f.endswith('.json')]

    all_valid = True

    for file in data_files:
        file_path = os.path.join(data_dir, file)
        with open(file_path, 'r') as f:
            data = json.load(f)

        try:
            validate(instance=data, schema=schema)
        except Exception as e:
            print(f'Validation failed for {file}:')
            print(e)
            all_valid = False

    if all_valid:
        print('All data files are valid!')

if __name__ == '__main__':
    main()
