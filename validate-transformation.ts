#!/usr/bin/env ts-node
/**
 * Validation Script
 * Verifies that the transformation from old format to new format is complete and accurate
 */

import * as fs from 'fs';
import * as path from 'path';

// ===== TYPE DEFINITIONS =====

interface OldFormatItem {
  type: string;
  number: number;
  text: string;
  commentary_text: string;
}

interface OldFormat {
  text_name: string;
  content: OldFormatItem[];
}

interface NewFormatPassage {
  ref: string;
  passage_type: string;
  label?: string;
  content: {
    sanskrit: {
      devanagari: string;
    };
  };
}

interface NewFormatCommentaryPassage {
  ref: string;
  content: {
    sanskrit: {
      devanagari: string;
    };
  };
}

interface NewFormatCommentary {
  commentary_id: string;
  commentary_title: string;
  passages: NewFormatCommentaryPassage[];
}

interface NewFormat {
  grantha_id: string;
  canonical_title: string;
  prefatory_material: NewFormatPassage[];
  passages: NewFormatPassage[];
  commentaries: NewFormatCommentary[];
}

// ===== VALIDATION FUNCTIONS =====

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    originalCount: number;
    transformedCount: number;
    prefatoryCount: number;
    mainPassagesCount: number;
    commentariesCount: number;
    totalCommentaryPassages: number;
  };
}

function validateTransformation(
  oldFilePath: string,
  newFilePath: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Read files
  console.log('📖 Reading original file:', oldFilePath);
  const oldData: OldFormat = JSON.parse(fs.readFileSync(oldFilePath, 'utf-8'));

  console.log('📖 Reading transformed file:', newFilePath);
  const newData: NewFormat = JSON.parse(fs.readFileSync(newFilePath, 'utf-8'));

  // Count items in original
  const originalItems = oldData.content;
  const originalPrefatory = originalItems.filter(item => item.number === 0);
  const originalMain = originalItems.filter(item => item.number > 0);

  console.log('\n📊 Original File Statistics:');
  console.log(`   Total items: ${originalItems.length}`);
  console.log(`   Prefatory (number=0): ${originalPrefatory.length}`);
  console.log(`   Main passages (number>0): ${originalMain.length}`);

  // Count items in transformed
  const transformedPrefatory = newData.prefatory_material;
  const transformedMain = newData.passages;
  const totalTransformed = transformedPrefatory.length + transformedMain.length;

  console.log('\n📊 Transformed File Statistics:');
  console.log(`   Total passages: ${totalTransformed}`);
  console.log(`   Prefatory material: ${transformedPrefatory.length}`);
  console.log(`   Main passages: ${transformedMain.length}`);
  console.log(`   Commentaries: ${newData.commentaries.length}`);

  // Check if counts match
  if (originalItems.length !== totalTransformed) {
    errors.push(
      `Passage count mismatch: Original has ${originalItems.length} items, ` +
      `transformed has ${totalTransformed} passages`
    );
  }

  if (originalPrefatory.length !== transformedPrefatory.length) {
    warnings.push(
      `Prefatory material count differs: Original has ${originalPrefatory.length}, ` +
      `transformed has ${transformedPrefatory.length}`
    );
  }

  if (originalMain.length !== transformedMain.length) {
    errors.push(
      `Main passage count mismatch: Original has ${originalMain.length}, ` +
      `transformed has ${transformedMain.length}`
    );
  }

  // Validate each original passage exists in transformed
  console.log('\n🔍 Validating passage transformation...');

  for (const oldItem of originalItems) {
    const expectedRef = oldItem.number === 0 ? '0.0' : oldItem.number.toString();

    // Find in transformed data
    let found = false;
    let transformedPassage: NewFormatPassage | undefined;

    if (oldItem.number === 0) {
      transformedPassage = transformedPrefatory.find(p => p.ref === expectedRef);
    } else {
      transformedPassage = transformedMain.find(p => p.ref === expectedRef);
    }

    if (transformedPassage) {
      found = true;

      // Validate text content matches
      const oldText = oldItem.text.trim();
      const newText = transformedPassage.content.sanskrit.devanagari.trim();

      if (oldText !== newText) {
        warnings.push(
          `Text content differs for ref ${expectedRef}. ` +
          `Original length: ${oldText.length}, Transformed length: ${newText.length}`
        );
      }
    }

    if (!found) {
      errors.push(`Missing passage: Original number ${oldItem.number} (expected ref: ${expectedRef})`);
    } else {
      console.log(`   ✓ Passage ${expectedRef} - Found and validated`);
    }
  }

  // Validate commentaries
  console.log('\n🔍 Validating commentaries...');

  const originalWithCommentary = originalItems.filter(
    item => item.commentary_text && item.commentary_text.trim()
  );

  console.log(`   Original items with commentary: ${originalWithCommentary.length}`);

  let totalCommentaryPassages = 0;
  for (const commentary of newData.commentaries) {
    console.log(`   Commentary: ${commentary.commentary_title}`);
    console.log(`     - ID: ${commentary.commentary_id}`);
    console.log(`     - Passages: ${commentary.passages.length}`);
    totalCommentaryPassages += commentary.passages.length;

    // Check that each commentary passage has corresponding original
    for (const commentaryPassage of commentary.passages) {
      const ref = commentaryPassage.ref;
      const number = ref === '0.0' ? 0 : parseInt(ref);

      const originalItem = originalItems.find(item => item.number === number);

      if (!originalItem) {
        warnings.push(
          `Commentary passage ${ref} in ${commentary.commentary_id} ` +
          `has no corresponding original passage`
        );
      } else if (!originalItem.commentary_text || !originalItem.commentary_text.trim()) {
        warnings.push(
          `Commentary passage ${ref} in ${commentary.commentary_id} ` +
          `but original has no commentary text`
        );
      }
    }
  }

  console.log(`   Total commentary passages across all commentaries: ${totalCommentaryPassages}`);

  if (totalCommentaryPassages !== originalWithCommentary.length) {
    warnings.push(
      `Commentary passage count differs: Original has ${originalWithCommentary.length} items with commentary, ` +
      `transformed has ${totalCommentaryPassages} commentary passages total`
    );
  }

  // Check for specific passages (Mantra 1-18)
  console.log('\n🔍 Checking specific mantras (1-18)...');
  for (let i = 1; i <= 18; i++) {
    const ref = i.toString();
    const passage = transformedMain.find(p => p.ref === ref);

    if (!passage) {
      errors.push(`Missing Mantra ${i} (ref: ${ref})`);
      console.log(`   ✗ Mantra ${i} - MISSING`);
    } else {
      const preview = passage.content.sanskrit.devanagari.substring(0, 50).replace(/\n/g, ' ');
      console.log(`   ✓ Mantra ${i} - "${preview}..."`);
    }
  }

  // Summary
  const summary = {
    originalCount: originalItems.length,
    transformedCount: totalTransformed,
    prefatoryCount: transformedPrefatory.length,
    mainPassagesCount: transformedMain.length,
    commentariesCount: newData.commentaries.length,
    totalCommentaryPassages,
  };

  return {
    success: errors.length === 0,
    errors,
    warnings,
    summary,
  };
}

// ===== MAIN EXECUTION =====

function main() {
  console.log('🔍 Sacred Texts Transformation Validator\n');
  console.log('='.repeat(60));

  const oldFile = '../website/data/isavasya.json';
  const newFile = './app/public/data/isha_upanishad.json';

  try {
    const result = validateTransformation(oldFile, newFile);

    console.log('\n' + '='.repeat(60));
    console.log('📋 VALIDATION SUMMARY\n');

    console.log('Statistics:');
    console.log(`  Original items:          ${result.summary.originalCount}`);
    console.log(`  Transformed passages:    ${result.summary.transformedCount}`);
    console.log(`  Prefatory material:      ${result.summary.prefatoryCount}`);
    console.log(`  Main passages:           ${result.summary.mainPassagesCount}`);
    console.log(`  Commentaries:            ${result.summary.commentariesCount}`);
    console.log(`  Total commentary passages: ${result.summary.totalCommentaryPassages}`);

    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      result.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      result.warnings.forEach((warn, idx) => {
        console.log(`  ${idx + 1}. ${warn}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    if (result.success) {
      console.log('✅ VALIDATION PASSED - All passages accounted for!\n');
      process.exit(0);
    } else {
      console.log('❌ VALIDATION FAILED - Please review errors above\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error during validation:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { validateTransformation };
