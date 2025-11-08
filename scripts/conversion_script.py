import json
import os
from datetime import datetime

SOURCE_DIR = '../../simple/data/'
TARGET_DIR = '../public/data/'

def convert_file(filename):
    source_path = os.path.join(SOURCE_DIR, filename)

    base_name = os.path.splitext(filename)[0]
    grantha_id = f"{base_name}-upanishad"
    target_filename = f"{grantha_id}.json"
    target_path = os.path.join(TARGET_DIR, target_filename)

    with open(source_path, 'r', encoding='utf-8') as f:
        source_data = json.load(f)

    target_data = {
        'grantha_id': grantha_id,
        'canonical_title': source_data.get('text_name'),
        'aliases': [],
        'text_type': 'upanishad',
        'language': 'sanskrit',
        'metadata': {
            'source_file': source_path,
            'processing_pipeline': {
                'llm_model': 'n/a',
                'llm_prompt_version': 'n/a',
                'llm_date': '2025-01-01',
                'processor': 'conversion_script.py'
            },
            'quality_notes': 'Converted from simple format.',
            'last_updated': datetime.utcnow().isoformat() + 'Z'
        },
        'structure_levels': source_data.get('structure_levels', []),
        'variants_available': [],
        'prefatory_material': [],
        'passages': [],
        'concluding_material': [],
        'commentaries': []
    }

    for khanda in source_data.get('content', []):
        khanda_number = khanda.get('number')
        for mantra in khanda.get('children', []):
            mantra_number = mantra.get('number')
            ref = f"{khanda_number}.{mantra_number}"

            passage = {
                'ref': ref,
                'passage_type': 'main',
                'content': {
                    'sanskrit': {
                        'devanagari': mantra.get('text') or '',
                        'roman': None,
                        'kannada': None
                    },
                    'english_translation': None
                }
            }

            if mantra_number == 0:
                passage['passage_type'] = 'prefatory'
                passage['label'] = {'devanagari': 'शान्तिः'}
                target_data['prefatory_material'].append(passage)
            else:
                target_data['passages'].append(passage)

    # Simple check for concluding material (shanti mantra)
    if source_data.get('content'):
        last_khanda = source_data.get('content', [])[-1]
        last_mantra = last_khanda.get('children', [])[-1]
        if 'शान्तिः' in last_mantra.get('text', ''):
            ref = f"{last_khanda.get('number')}.{last_mantra.get('number')}"
            passage = {
                    'ref': ref,
                    'passage_type': 'concluding',
                    'label': {'devanagari': 'शान्तिः'},
                    'content': {
                        'sanskrit': {
                            'devanagari': last_mantra.get('text'),
                            'roman': None,
                            'kannada': None
                        },
                        'english_translation': None
                    }
                }
            target_data['concluding_material'].append(passage)
            # Remove from main passages if it was added there
            target_data['passages'] = [p for p in target_data['passages'] if p['ref'] != ref]

    # Commentaries
    commentary_passages = []
    commentary_title = 'Rangaramanuja Bhashya' # Default

    # Try to extract title from the first commentary passage
    try:
        first_commentary_text = source_data['content'][0]['children'][0]['commentary_text']
        if first_commentary_text:
            lines = first_commentary_text.split('\n')
            for line in lines:
                if '####' in line and 'प्रकाशिका' in line:
                    commentary_title = 'प्रकाशिका'
                    break
    except (IndexError, KeyError, TypeError):
        pass # Keep default title

    for khanda in source_data.get('content', []):
        for mantra in khanda.get('children', []):
            if mantra.get('commentary_text'):
                ref = f"{khanda.get('number')}.{mantra.get('number')}"
                commentary_passages.append({
                    'ref': ref,
                    'content': {
                        'sanskrit': {
                            'devanagari': mantra.get('commentary_text'),
                            'roman': None,
                            'kannada': None
                        },
                        'english': ''
                    }
                })

    if commentary_passages:
        target_data['commentaries'] = [
            {
                'commentary_id': 'rangaramanuja',
                'commentary_title': commentary_title,
                'commentator': {
                    'devanagari': 'रङ्गरामानुजमुनिः'
                },
                'passages': commentary_passages
            }
        ]

    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)

    print(f'Converted {filename} to {target_filename}')

if __name__ == '__main__':
    files_to_convert = [
        'aitareya.json',
        'katha.json',
        'mandukya-rangaramanuja.json',
        'mundaka.json',
        'taittiriya.json'
    ]
    for f in files_to_convert:
        convert_file(f)
