#!/usr/bin/env ts-node
/**
 * Data Transformation Script
 * Converts existing JSON format to PRD-compliant format (Section 6.11)
 */

import * as fs from 'fs';
import * as path from 'path';

// ===== TYPE DEFINITIONS =====

interface OldFormat {
  text_name: string;
  structure_levels: Array<{
    key: string;
    scriptNames: {
      devanagari: string;
    };
  }>;
  content: Array<{
    type: string;
    number: number;
    text: string;
    commentary_text: string;
  }>;
}

interface NewFormat {
  grantha_id: string;
  canonical_title: string;
  aliases: Array<{
    alias: string;
    scope: string;
  }>;
  text_type: string;
  language: string;
  metadata: {
    source_url: string;
    source_commit: string;
    source_file: string;
    processing_pipeline: {
      processor: string;
      transformation_date: string;
      transformation_tool: string;
    };
    quality_notes: string;
    last_updated: string;
  };
  variants_available: string[];
  prefatory_material: Array<{
    ref: string;
    passage_type: string;
    label: string;
    content: {
      sanskrit: {
        devanagari: string;
      };
    };
  }>;
  passages: Array<{
    ref: string;
    passage_type: string;
    content: {
      sanskrit: {
        devanagari: string;
      };
    };
  }>;
  commentaries: Array<{
    commentary_id: string;
    commentary_title: string;
    commentator: string;
    commentary_source: string;
    metadata: {
      source_url: string;
      source_commit: string;
      last_updated: string;
    };
    passages: Array<{
      ref: string;
      content: {
        sanskrit: {
          devanagari: string;
        };
      };
    }>;
  }>;
}

// ===== HELPER FUNCTIONS =====

/**
 * Generate grantha_id from text_name
 * E.g., "ईशावास्योपनिषत्" → "isha_upanishad"
 */
function generateGranthaId(textName: string): string {
  // Mapping of Devanagari names to English IDs
  const nameMap: Record<string, string> = {
    'ईशावास्योपनिषत्': 'isha_upanishad',
    'केनोपनिषत्': 'kena_upanishad',
    'कठोपनिषत्': 'katha_upanishad',
    'मुण्डकोपनिषत्': 'mundaka_upanishad',
    'माण्डूक्योपनिषत्': 'mandukya_upanishad',
    'ऐतरेयोपनिषत्': 'aitareya_upanishad',
    'तैत्तिरीयोपनिषत्': 'taittiriya_upanishad',
    'छान्दोग्योपनिषत्': 'chandogya_upanishad',
    'बृहदारण्यकोपनिषत्': 'brihadaranyaka_upanishad',
    'श्वेताश्वतरोपनिषत्': 'svetasvatara_upanishad',
  };

  return nameMap[textName] || 'unknown_upanishad';
}

/**
 * Generate canonical English title from text_name
 */
function generateCanonicalTitle(textName: string): string {
  const titleMap: Record<string, string> = {
    'ईशावास्योपनिषत्': 'Isha Upanishad',
    'केनोपनिषत्': 'Kena Upanishad',
    'कठोपनिषत्': 'Katha Upanishad',
    'मुण्डकोपनिषत्': 'Mundaka Upanishad',
    'माण्डूक्योपनिषत्': 'Mandukya Upanishad',
    'ऐतरेयोपनिषत्': 'Aitareya Upanishad',
    'तैत्तिरीयोपनिषत्': 'Taittiriya Upanishad',
    'छान्दोग्योपनिषत्': 'Chandogya Upanishad',
    'बृहदारण्यकोपनिषत्': 'Brihad Aranyaka Upanishad',
    'श्वेताश्वतरोपनिषत्': 'Svetasvatara Upanishad',
  };

  return titleMap[textName] || textName;
}

/**
 * Detect commentator from commentary text
 * Looks for markdown headers or specific phrases
 */
function detectCommentator(commentaryText: string): {
  id: string;
  title: string;
  commentator: string;
} {
  // Check for specific patterns in the commentary text
  if (commentaryText.includes('श्रीवत्सनारायणमुनीन्द्र') || commentaryText.includes('ईशावास्यप्रकाशिका')) {
    return {
      id: 'srivatsa_narayana',
      title: 'Srivatsa Narayana Bhashya',
      commentator: 'Srivatsa Narayana Muni',
    };
  }

  // Default to unknown commentator
  return {
    id: 'vedanta_desika',
    title: 'Vedanta Desika Bhashya',
    commentator: 'Vedanta Desika',
  };
}

/**
 * Extract first ~50 characters for passage fragment
 */
function extractPassageFragment(text: string): string {
  // Remove newlines and extra spaces
  const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Take first 50 characters
  if (cleaned.length <= 50) {
    return cleaned;
  }

  return cleaned.substring(0, 50) + '...';
}

// ===== MAIN TRANSFORMATION FUNCTION =====

function transformData(oldData: OldFormat): NewFormat {
  const granthaId = generateGranthaId(oldData.text_name);
  const canonicalTitle = generateCanonicalTitle(oldData.text_name);
  const currentDate = new Date().toISOString();

  // Separate prefatory material (number === 0) from main passages
  const prefatoryItems = oldData.content.filter(item => item.number === 0);
  const mainPassages = oldData.content.filter(item => item.number > 0);

  // Transform prefatory material
  const prefatoryMaterial = prefatoryItems.map((item, index) => ({
    ref: `0.${index}`,
    passage_type: 'prefatory' as const,
    label: index === 0 ? 'Shanti Mantra' : `Prefatory Material ${index}`,
    content: {
      sanskrit: {
        devanagari: item.text,
      },
    },
  }));

  // Transform main passages
  const passages = mainPassages.map(item => ({
    ref: item.number.toString(),
    passage_type: 'main' as const,
    content: {
      sanskrit: {
        devanagari: item.text,
      },
    },
  }));

  // Extract and organize commentaries
  // Group all commentary passages by commentator
  const commentaryMap = new Map<string, Array<{
    ref: string;
    content: { sanskrit: { devanagari: string } };
  }>>();

  oldData.content.forEach(item => {
    if (item.commentary_text && item.commentary_text.trim()) {
      const commentatorInfo = detectCommentator(item.commentary_text);

      if (!commentaryMap.has(commentatorInfo.id)) {
        commentaryMap.set(commentatorInfo.id, []);
      }

      const ref = item.number === 0 ? `0.0` : item.number.toString();

      commentaryMap.get(commentatorInfo.id)!.push({
        ref,
        content: {
          sanskrit: {
            devanagari: item.commentary_text,
          },
        },
      });
    }
  });

  // Build commentaries array
  const commentaries = Array.from(commentaryMap.entries()).map(([id, passages]) => {
    const firstPassage = oldData.content.find(item =>
      item.commentary_text && item.commentary_text.trim()
    );
    const commentatorInfo = firstPassage
      ? detectCommentator(firstPassage.commentary_text)
      : { id: 'unknown', title: 'Unknown Commentary', commentator: 'Unknown' };

    return {
      commentary_id: commentatorInfo.id,
      commentary_title: commentatorInfo.title,
      commentator: commentatorInfo.commentator,
      commentary_source: 'Source to be determined',
      metadata: {
        source_url: 'https://github.com/user/repo',
        source_commit: 'To be determined',
        last_updated: currentDate,
      },
      passages,
    };
  });

  // Build the new format
  const newData: NewFormat = {
    grantha_id: granthaId,
    canonical_title: canonicalTitle,
    aliases: [
      {
        alias: oldData.text_name,
        scope: 'full_text',
      },
    ],
    text_type: 'upanishad',
    language: 'sanskrit',
    metadata: {
      source_url: 'https://github.com/mani/upanishad-explorer',
      source_commit: 'To be determined',
      source_file: `website/data/${path.basename(oldData.text_name || 'unknown')}.json`,
      processing_pipeline: {
        processor: 'Claude Code Transformation Script',
        transformation_date: currentDate,
        transformation_tool: 'transform-data.ts v1.0',
      },
      quality_notes: 'Transformed from existing JSON format. Needs review and validation.',
      last_updated: currentDate,
    },
    variants_available: ['canonical'],
    prefatory_material: prefatoryMaterial,
    passages,
    commentaries,
  };

  return newData;
}

// ===== CLI EXECUTION =====

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: ts-node transform-data.ts <input-file> <output-file>');
    console.error('Example: ts-node transform-data.ts ../website/data/isavasya.json ./public/data/isha_upanishad.json');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile = args[1];

  try {
    // Read input file
    console.log(`Reading input file: ${inputFile}`);
    const inputData = fs.readFileSync(inputFile, 'utf-8');
    const oldFormat: OldFormat = JSON.parse(inputData);

    // Transform
    console.log('Transforming data...');
    const newFormat = transformData(oldFormat);

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output file
    console.log(`Writing output file: ${outputFile}`);
    fs.writeFileSync(outputFile, JSON.stringify(newFormat, null, 2), 'utf-8');

    console.log('✅ Transformation complete!');
    console.log(`   Grantha ID: ${newFormat.grantha_id}`);
    console.log(`   Title: ${newFormat.canonical_title}`);
    console.log(`   Prefatory passages: ${newFormat.prefatory_material.length}`);
    console.log(`   Main passages: ${newFormat.passages.length}`);
    console.log(`   Commentaries: ${newFormat.commentaries.length}`);

  } catch (error) {
    console.error('❌ Error during transformation:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { transformData, OldFormat, NewFormat };
