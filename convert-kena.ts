import * as fs from 'fs';
import * as path from 'path';

interface SourceMantra {
  type: 'Mantra';
  number: number;
  text: string;
  commentary_text?: string;
}

interface SourceKhanda {
  type: 'Khanda';
  name: string;
  number: number;
  children: SourceMantra[];
}

interface SourceData {
  text_name: string;
  structure_levels: Array<{
    key: string;
    scriptNames: {
      devanagari: string;
    };
  }>;
  content: SourceKhanda[];
}

interface TargetPassage {
  ref: string;
  passage_type: 'main';
  content: {
    sanskrit: {
      devanagari: string;
    };
    english_translation: string;
  };
}

interface CommentaryPrefatoryItem {
  type: string;
  label: string;
  content: {
    sanskrit: {
      devanagari: string;
    };
    english: string;
  };
}

interface CommentaryPassage {
  ref: string;
  prefatory_material?: CommentaryPrefatoryItem[];
  content: {
    sanskrit: {
      devanagari: string;
    };
    english: string;
  };
}

interface TargetData {
  grantha_id: string;
  canonical_title: string;
  aliases: Array<{
    alias: string;
    scope: string;
  }>;
  text_type: string;
  language: string;
  metadata: {
    source_url: null;
    source_commit: null;
    source_file: string;
    processing_pipeline: {
      llm_model: string;
      llm_prompt_version: string;
      llm_date: string;
      processor: string;
    };
    quality_notes: string;
    last_updated: string;
  };
  structure_levels: Array<{
    key: string;
    scriptNames: {
      devanagari: string;
    };
  }>;
  prefatory_material: any[];
  passages: TargetPassage[];
  concluding_material: any[];
  commentaries: Array<{
    commentary_id: string;
    commentary_title: string;
    commentator: {
      devanagari: string;
      latin: string;
    };
    metadata: {
      source_file: string;
    };
    passages: CommentaryPassage[];
  }>;
}

interface ConversionStats {
  totalMantras: number;
  processedMantras: number;
  mantrasWithCommentary: number;
  mantrasWithoutCommentary: number;
  totalCommentaryLength: number;
  totalVerseLength: number;
}

function parseCommentaryText(commentaryText: string): {
  prefatory: CommentaryPrefatoryItem[];
  main: string;
} {
  const prefatory: CommentaryPrefatoryItem[] = [];
  const lines = commentaryText.split('\n');
  let currentSection: CommentaryPrefatoryItem | null = null;
  const sections: Array<{label: string; content: string}> = [];
  let currentLabel: string | null = null;
  let currentContent: string[] = [];

  // First pass: collect all sections
  for (const line of lines) {
    const headingMatch = line.match(/^####\s*(.+)$/);

    if (headingMatch) {
      // Save previous section if exists
      if (currentLabel !== null && currentContent.length > 0) {
        sections.push({
          label: currentLabel,
          content: currentContent.join('\n')
        });
      }

      // Start new section
      currentLabel = headingMatch[1].trim();
      currentContent = [];
    } else if (currentLabel !== null) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentLabel !== null && currentContent.length > 0) {
    sections.push({
      label: currentLabel,
      content: currentContent.join('\n')
    });
  }

  // Second pass: determine which sections are prefatory vs main
  let mainContent: string[] = [];

  for (const section of sections) {
    const trimmedContent = section.content.trim();

    // Check if this section contains actual verse commentary (has bold markers **)
    const hasBoldMarkers = trimmedContent.includes('**');

    if (hasBoldMarkers) {
      // This is main commentary - add heading as comment and content
      if (mainContent.length > 0) {
        mainContent.push(''); // Add blank line between sections
      }
      mainContent.push(`#### ${section.label}`);
      mainContent.push(trimmedContent);
    } else if (trimmedContent) {
      // This is prefatory material
      prefatory.push({
        type: 'commentary_section',
        label: section.label,
        content: {
          sanskrit: {
            devanagari: trimmedContent
          },
          english: ''
        }
      });
    }
  }

  return {
    prefatory,
    main: mainContent.join('\n').trim()
  };
}

function convertKenaUpanishad(sourcePath: string, targetPath: string): ConversionStats {
  // Read source file
  const sourceData: SourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));

  const stats: ConversionStats = {
    totalMantras: 0,
    processedMantras: 0,
    mantrasWithCommentary: 0,
    mantrasWithoutCommentary: 0,
    totalCommentaryLength: 0,
    totalVerseLength: 0
  };

  // Initialize target structure
  const targetData: TargetData = {
    grantha_id: 'kena-upanishad',
    canonical_title: sourceData.text_name,
    aliases: [
      {
        alias: 'Kenopanishad',
        scope: 'full_text'
      },
      {
        alias: 'Kena Upanishad',
        scope: 'full_text'
      },
      {
        alias: 'Talavakara Upanishad',
        scope: 'full_text'
      }
    ],
    text_type: 'upanishad',
    language: 'sanskrit',
    metadata: {
      source_url: null,
      source_commit: null,
      source_file: 'kena.json',
      processing_pipeline: {
        llm_model: 'claude-sonnet-4-5-20250929',
        llm_prompt_version: '1.0',
        llm_date: new Date().toISOString().split('T')[0],
        processor: 'Claude Code Conversion Script'
      },
      quality_notes: 'Converted from hierarchical format. Commentaries by Rangamanuja Muni. Headings converted to sections.',
      last_updated: new Date().toISOString()
    },
    structure_levels: sourceData.structure_levels,
    prefatory_material: [],
    passages: [],
    concluding_material: [],
    commentaries: [{
      commentary_id: 'rangaramanuja',
      commentary_title: 'केनोपनिषद्भाष्यम्',
      commentator: {
        devanagari: 'रङ्गरामानुजमुनिः',
        latin: 'Rangaramanuja Muni'
      },
      metadata: {
        source_file: 'kena.json'
      },
      passages: []
    }]
  };

  // Process each Khanda and Mantra
  for (const khanda of sourceData.content) {
    for (const mantra of khanda.children) {
      stats.totalMantras++;

      // Create reference: Khanda.Mantra format
      const ref = `${khanda.number}.${mantra.number}`;

      // Add verse to passages
      targetData.passages.push({
        ref,
        passage_type: 'main',
        content: {
          sanskrit: {
            devanagari: mantra.text
          },
          english_translation: ''
        }
      });

      stats.totalVerseLength += mantra.text.length;
      stats.processedMantras++;

      // Process commentary if exists
      if (mantra.commentary_text && mantra.commentary_text.trim()) {
        const { prefatory, main } = parseCommentaryText(mantra.commentary_text);

        const commentaryPassage: CommentaryPassage = {
          ref,
          content: {
            sanskrit: {
              devanagari: main
            },
            english: ''
          }
        };

        if (prefatory.length > 0) {
          commentaryPassage.prefatory_material = prefatory;
        }

        targetData.commentaries[0].passages.push(commentaryPassage);

        stats.mantrasWithCommentary++;
        stats.totalCommentaryLength += mantra.commentary_text.length;
      } else {
        stats.mantrasWithoutCommentary++;
      }
    }
  }

  // Write target file
  fs.writeFileSync(targetPath, JSON.stringify(targetData, null, 2), 'utf-8');

  return stats;
}

// Verification function
function verifyConversion(sourcePath: string, targetPath: string, stats: ConversionStats): boolean {
  console.log('\n=== CONVERSION VERIFICATION ===\n');

  const sourceData: SourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
  const targetData: TargetData = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));

  // Count source mantras
  let sourceMantraCount = 0;
  let sourceCommentaryCount = 0;
  let sourceTotalVerseLength = 0;
  let sourceTotalCommentaryLength = 0;

  for (const khanda of sourceData.content) {
    for (const mantra of khanda.children) {
      sourceMantraCount++;
      sourceTotalVerseLength += mantra.text.length;
      if (mantra.commentary_text && mantra.commentary_text.trim()) {
        sourceCommentaryCount++;
        sourceTotalCommentaryLength += mantra.commentary_text.length;
      }
    }
  }

  // Verify counts
  const passageCountMatch = targetData.passages.length === sourceMantraCount;
  const commentaryCountMatch = targetData.commentaries[0].passages.length === sourceCommentaryCount;
  const verseLengthMatch = stats.totalVerseLength === sourceTotalVerseLength;
  const commentaryLengthMatch = stats.totalCommentaryLength === sourceTotalCommentaryLength;

  console.log(`Source Mantras: ${sourceMantraCount}`);
  console.log(`Target Passages: ${targetData.passages.length}`);
  console.log(`✓ Passage count matches: ${passageCountMatch}\n`);

  console.log(`Source Commentaries: ${sourceCommentaryCount}`);
  console.log(`Target Commentary Passages: ${targetData.commentaries[0].passages.length}`);
  console.log(`✓ Commentary count matches: ${commentaryCountMatch}\n`);

  console.log(`Source Total Verse Length: ${sourceTotalVerseLength} chars`);
  console.log(`Target Total Verse Length: ${stats.totalVerseLength} chars`);
  console.log(`✓ Verse length matches: ${verseLengthMatch}\n`);

  console.log(`Source Total Commentary Length: ${sourceTotalCommentaryLength} chars`);
  console.log(`Target Total Commentary Length: ${stats.totalCommentaryLength} chars`);
  console.log(`✓ Commentary length matches: ${commentaryLengthMatch}\n`);

  console.log(`Mantras without commentary: ${stats.mantrasWithoutCommentary}`);
  console.log(`Mantras with commentary: ${stats.mantrasWithCommentary}\n`);

  const allChecksPass = passageCountMatch && commentaryCountMatch && verseLengthMatch && commentaryLengthMatch;

  if (allChecksPass) {
    console.log('✅ ALL VERIFICATION CHECKS PASSED - No content lost!\n');
  } else {
    console.log('❌ VERIFICATION FAILED - Content may be lost!\n');
  }

  return allChecksPass;
}

// Main execution
const sourcePath = '/Users/mani/github/aistudio/ai-workflow/upanishad-explorer/simple/data/kena.json';
const targetPath = '/Users/mani/github/aistudio/ai-workflow/upanishad-explorer/claude-designed/public/data/kena-upanishad.json';

console.log('Converting Kena Upanishad...\n');
const stats = convertKenaUpanishad(sourcePath, targetPath);

const verified = verifyConversion(sourcePath, targetPath, stats);

if (verified) {
  console.log(`✅ Conversion complete! Output written to: ${targetPath}`);
  process.exit(0);
} else {
  console.log(`❌ Conversion completed with errors. Please review: ${targetPath}`);
  process.exit(1);
}
