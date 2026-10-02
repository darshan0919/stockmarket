#!/usr/bin/env node
'use strict';

/**
 * inspect-skill.js
 *
 * Deterministic static analysis tool for Antigravity & Claude skills.
 * Part of the grill-skill toolkit.
 *
 * Inspects a target skill's SKILL.md, companion scripts, references, and configuration
 * to provide hard empirical metrics before the Grilling / Review session begins:
 *   1. Size & Progressive Disclosure (< 500 lines, frontmatter length)
 *   2. Logic vs Reasoning split (identifies script candidates)
 *   3. Caching & Cursors (two-tier caching, windowCursor, usecase prefixes)
 *   4. Conventions & Guardrails (sourceSkill, creationTime, loadEnv, data:push)
 *   5. Token & Model Tiering Opportunities (cloud-to-local offloading candidates)
 *   6. Reusability & Dependency check
 *
 * Usage:
 *   node inspect-skill.js <skill-name-or-path> [--json]
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');

// Heuristics for detecting deterministic logic in prompts
const SCRIPT_CANDIDATE_PATTERNS = [
  {
    category: 'Math & Financial Calculations',
    regex:
      /\b(calculate|compute|sum|percentage|growth rate|ratio|cagr|pe multiple|eps|ebitda margin|irr|variance|weighted average)\b/i,
    hint: 'Deterministic arithmetic in prompt. Should be computed in companion script.',
  },
  {
    category: 'Regex & String Manipulation',
    regex:
      /\b(regex|regular expression|parse the date|extract substring|split by|replace all|format as (?:currency|inr|crore|lakh)|sanitize)\b/i,
    hint: 'Text formatting/parsing. Belongs in a utility script/function.',
  },
  {
    category: 'Data Extraction & Schema Assembly',
    regex:
      /\b(extract the following json|construct a json object|assemble the payload|validate schema|json schema|build the dto)\b/i,
    hint: 'JSON assembly/validation. Script can structure the schema shell; local cheap LLM can fill slots.',
  },
  {
    category: 'Filtering, Sorting & Pagination',
    regex:
      /\b(filter out|sort by|rank (?:top|descending|ascending)|paginate|fetch all pages|offset|limit to \d+)\b/i,
    hint: 'Filtering/sorting logic. Should be handled in script before feeding LLM.',
  },
  {
    category: 'Threshold & Conditional Logic',
    regex:
      /\b(if \w+ (?:is greater than|>|<|is less than|crosses|exceeds)|threshold of|mark as (?:act|watch|noted) if)\b/i,
    hint: 'Deterministic thresholds. Extract into rule/script logic rather than prompt reasoning.',
  },
  {
    category: 'File System & Process Orchestration',
    regex:
      /\b(write (?:to|into) file|read each file|grep|find all files|run command|execute script|curl|fetch api)\b/i,
    hint: 'File/API orchestration. Should be encapsulated in companion runner.',
  },
];

// Candidates for Cheap / Local LLM offloading
const LOCAL_LLM_CANDIDATE_PATTERNS = [
  {
    task: 'Document / Filing Categorization',
    regex: /\b(categorize|classify as|assign category|tag with|classification)\b/i,
    tier: 'Local Small Model (e.g. Llama 3 8B, Qwen 2.5 7B, Gemini Flash Lite)',
  },
  {
    task: 'Passage / Quote Pre-filtering',
    regex:
      /\b(scan for mentions of|find paragraphs containing|extract relevant sentences|filter out boilerplate|relevance filter)\b/i,
    tier: 'Local Embeddings / Small Quantized LLM / Flash-class',
  },
  {
    task: 'Sentiment & Tone Scoring',
    regex: /\b(management tone|sentiment score|cautious|optimistic|bullish|bearish score)\b/i,
    tier: 'Fine-tuned Small Model / Local LLM',
  },
  {
    task: 'Entity & Key-Value Extraction',
    regex:
      /\b(extract (?:revenue|pat|capex|order value|guidance number|dates)|pull out the table)\b/i,
    tier: 'Local Extraction Model / Gemini Flash Lite',
  },
];

function resolveSkillPath(target) {
  if (!target) return null;
  // If target is an absolute path or exists directly
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const skillMd = path.join(target, 'SKILL.md');
    if (fs.existsSync(skillMd)) return { dir: path.resolve(target), skillMd };
  }

  // Look in skills categories: tooling, equity-research, development
  const categories = ['tooling', 'equity-research', 'development'];
  for (const cat of categories) {
    const candidateDir = path.join(SKILLS_DIR, cat, target);
    const skillMd = path.join(candidateDir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      return { dir: candidateDir, skillMd, category: cat };
    }
  }

  // Look directly under skills/
  const candidateDirect = path.join(SKILLS_DIR, target);
  if (fs.existsSync(path.join(candidateDirect, 'SKILL.md'))) {
    return {
      dir: candidateDirect,
      skillMd: path.join(candidateDirect, 'SKILL.md'),
      category: 'root',
    };
  }

  // Check global skills (~/.gemini/config/skills/)
  const os = require('os');
  const globalCandidate = path.join(os.homedir(), '.gemini/config/skills', target);
  if (fs.existsSync(path.join(globalCandidate, 'SKILL.md'))) {
    return {
      dir: globalCandidate,
      skillMd: path.join(globalCandidate, 'SKILL.md'),
      category: 'global',
    };
  }

  return null;
}

function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, body: content };

  const rawYaml = fmMatch[1];
  const body = fmMatch[2].trim();
  const frontmatter = {};

  let currentKey = null;
  let capturingMultiline = false;
  let multilineLines = [];

  for (const line of rawYaml.split('\n')) {
    const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      if (currentKey && capturingMultiline) {
        frontmatter[currentKey] = multilineLines.join(' ').trim();
        capturingMultiline = false;
        multilineLines = [];
      }
      currentKey = keyMatch[1].trim();
      const val = keyMatch[2].trim();
      if (val === '>' || val === '>-' || val === '|' || val === '|-') {
        capturingMultiline = true;
        multilineLines = [];
      } else {
        frontmatter[currentKey] = val.replace(/^["']|["']$/g, '');
      }
    } else if (capturingMultiline) {
      if (/^\s+/.test(line)) {
        multilineLines.push(line.trim());
      } else if (line.trim() === '') {
        // empty
      } else {
        frontmatter[currentKey] = multilineLines.join(' ').trim();
        capturingMultiline = false;
        multilineLines = [];
      }
    }
  }
  if (currentKey && capturingMultiline) {
    frontmatter[currentKey] = multilineLines.join(' ').trim();
  }

  return { frontmatter, body };
}

function inspectSkill(targetName) {
  const resolved = resolveSkillPath(targetName);
  if (!resolved) {
    return {
      error: `Could not resolve skill "${targetName}". Searched in skills/{tooling,equity-research,development}/ and ~/.gemini/config/skills/`,
    };
  }

  const { dir, skillMd, category } = resolved;
  const rawContent = fs.readFileSync(skillMd, 'utf8');
  const { frontmatter, body } = parseFrontmatter(rawContent);

  const lines = rawContent.split('\n');
  const lineCount = lines.length;
  const wordCount = rawContent.split(/\s+/).filter(Boolean).length;
  const bodyLines = body.split('\n').length;
  const descWordCount = (frontmatter.description || '').split(/\s+/).filter(Boolean).length;

  // Scan subdirectories
  const scriptsDir = path.join(dir, 'scripts');
  const referencesDir = path.join(dir, 'references');
  const assetsDir = path.join(dir, 'assets');

  const scripts = fs.existsSync(scriptsDir)
    ? fs.readdirSync(scriptsDir).filter((f) => !f.startsWith('.'))
    : [];
  const references = fs.existsSync(referencesDir)
    ? fs.readdirSync(referencesDir).filter((f) => !f.startsWith('.'))
    : [];
  const assets = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).filter((f) => !f.startsWith('.'))
    : [];

  // Check script lines
  let totalScriptLines = 0;
  for (const s of scripts) {
    try {
      const sContent = fs.readFileSync(path.join(scriptsDir, s), 'utf8');
      totalScriptLines += sContent.split('\n').length;
    } catch (_) {}
  }

  // 1. Progressive Disclosure Checks
  const progressiveDisclosure = {
    lineCount,
    bodyLines,
    wordCount,
    descWordCount,
    isExceeding500Lines: lineCount > 500,
    hasSubdirectoryHierarchy: references.length > 0 || scripts.length > 0,
    hasPushyTrigger: /whenever|use this skill (?:every|any time|when)|trigger on/i.test(
      frontmatter.description || ''
    ),
    verdict:
      lineCount <= 500
        ? 'PASS (Lean prompt)'
        : 'FAIL (Prompt bloat: exceeds 500 lines — needs layering)',
  };

  // 2. Logic vs Reasoning Split (Script Candidates)
  const scriptCandidatesFound = [];
  for (const pattern of SCRIPT_CANDIDATE_PATTERNS) {
    const matches = body.match(new RegExp(pattern.regex, 'gi'));
    if (matches && matches.length > 0) {
      scriptCandidatesFound.push({
        category: pattern.category,
        count: matches.length,
        hint: pattern.hint,
        sampleMatches: Array.from(new Set(matches)).slice(0, 3),
      });
    }
  }

  // 3. Cloud vs Local LLM Offloading Candidates
  const localLlmCandidates = [];
  for (const p of LOCAL_LLM_CANDIDATE_PATTERNS) {
    const matches = body.match(new RegExp(p.regex, 'gi'));
    if (matches && matches.length > 0) {
      localLlmCandidates.push({
        task: p.task,
        targetTier: p.tier,
        matchCount: matches.length,
        sampleMatches: Array.from(new Set(matches)).slice(0, 3),
      });
    }
  }

  // 4. Caching & Cursors Audit
  const cachingAudit = {
    mentionsCache: /\b(cache|cached|caching|readJson|saveJson|data\/cache)\b/i.test(body),
    mentionsWindowCursor:
      /\b(windowCursor|commitWindow|resolveWindowStartMs)\b/i.test(body) ||
      scripts.some((s) => {
        try {
          return fs.readFileSync(path.join(scriptsDir, s), 'utf8').includes('windowCursor');
        } catch (_) {
          return false;
        }
      }),
    mentionsUsecasePrefix: /\b(usecase|usecase-prefix)\b/i.test(body),
    hasShortCircuit: /\b(skip if|already processed|if exists return|cache hit)\b/i.test(body),
  };

  // 5. Conventions & Guardrails Compliance
  const conventionsAudit = {
    touchesNotesDb: /\b(add-note|notesDb|appendNotes|watchlistInsights\.js)\b/i.test(body),
    hasSourceSkillGate: /\bsourceSkill\b/i.test(body),
    touchesDatabase: /\b(lib\/db\.js|data\/.*\.json|saveReport|appendEvents|upsertMany)\b/i.test(
      body
    ),
    hasDataPush: /\b(yarn data:push|data:push)\b/i.test(body),
    hasCreationTimeEnvelope: /\bcreationTime\b/i.test(body),
    hasBannedCreatedAt:
      /\bcreatedAt\b/i.test(body) &&
      !/\b(external|upstream|tweet|filing).{0,30}createdAt/i.test(body),
    scriptsCheckLoadEnv:
      scripts.length === 0
        ? 'N/A (No companion scripts)'
        : (() => {
            let missingLoadEnv = [];
            for (const s of scripts) {
              if (!s.endsWith('.js')) continue;
              const code = fs.readFileSync(path.join(scriptsDir, s), 'utf8');
              if (code.includes('process.env') && !code.includes('loadEnv')) {
                missingLoadEnv.push(s);
              }
            }
            return missingLoadEnv.length === 0
              ? 'PASS (loadEnv used or no secrets read)'
              : `FAIL (Missing loadEnv in: ${missingLoadEnv.join(', ')})`;
          })(),
  };

  // 6. Output & Format Architecture
  const outputArchitecture = {
    producesPdf: /\b(render-pdf|\.pdf|pdfRenderer|pdfUtils)\b/i.test(body),
    producesJsonDto: /\b(dto|saveReport|json-first|canonical json|output-dto-standard)\b/i.test(
      body
    ),
    producesHtmlWidget: /\b(visualize:show_widget|html widget|showWidget)\b/i.test(body),
    hasFilesTouchedManifest: /\b(files touched|db\.touchedFiles|touchedFiles)\b/i.test(body),
  };

  // 7. Reasoning Tasks Discovery (Candidates for Quality & Criticality Review)
  const reasoningTasksDiscovered = [];
  const linesArr = body.split('\n');
  let currentHeader = null;
  let headerContent = [];

  for (let i = 0; i < linesArr.length; i++) {
    const l = linesArr[i];
    const headerMatch = l.match(/^(#{2,4})\s+(.+)$/);
    if (headerMatch) {
      if (currentHeader && headerContent.length > 0) {
        const textBlock = headerContent.join(' ');
        if (
          /\b(reasoning|analysis|evaluate|judge|interpret|synthesize|verdict|thesis|tone|guidance|dodging|contradiction|risk|catalyst|conviction|classify|re-rating|accretion|credibility|moat|scenarios|valuation)\b/i.test(
            currentHeader + ' ' + textBlock
          )
        ) {
          reasoningTasksDiscovered.push({
            header: currentHeader,
            summary: textBlock.slice(0, 160).trim() + (textBlock.length > 160 ? '...' : ''),
          });
        }
      }
      currentHeader = headerMatch[2].trim();
      headerContent = [];
    } else if (currentHeader && l.trim()) {
      headerContent.push(l.trim());
    }
  }
  if (currentHeader && headerContent.length > 0) {
    const textBlock = headerContent.join(' ');
    if (
      /\b(reasoning|analysis|evaluate|judge|interpret|synthesize|verdict|thesis|tone|guidance|dodging|contradiction|risk|catalyst|conviction|classify|re-rating|accretion|credibility|moat|scenarios|valuation)\b/i.test(
        currentHeader + ' ' + textBlock
      )
    ) {
      reasoningTasksDiscovered.push({
        header: currentHeader,
        summary: textBlock.slice(0, 160).trim() + (textBlock.length > 160 ? '...' : ''),
      });
    }
  }

  // Fallback if no specific headers matched: scan bullet points or numbered steps
  if (reasoningTasksDiscovered.length === 0) {
    for (const line of linesArr) {
      if (/^\s*(?:\d+\.|\*|\-)\s+\*\*(.+?)\*\*:\s*(.+)$/.test(line)) {
        const m = line.match(/^\s*(?:\d+\.|\*|\-)\s+\*\*(.+?)\*\*:\s*(.+)$/);
        if (
          /\b(reasoning|analysis|evaluate|judge|synthesize|verdict|thesis|tone|guidance|catalyst|conviction)\b/i.test(
            m[1] + ' ' + m[2]
          )
        ) {
          reasoningTasksDiscovered.push({
            header: m[1].trim(),
            summary: m[2].slice(0, 160).trim(),
          });
        }
      }
    }
  }

  // Compute Overall Reasoning vs Orchestration Score
  // If prompt has many script candidates, it's doing too much computation in the prompt.
  const scriptCandidateScore = scriptCandidatesFound.reduce((acc, curr) => acc + curr.count, 0);
  const reasoningVsOrchestration = {
    scriptCandidateFrequency: scriptCandidateScore,
    estimatedLogicInPromptRatio:
      scriptCandidateScore > 10
        ? 'HIGH (> 40% of instructions are algorithmic)'
        : scriptCandidateScore > 4
          ? 'MODERATE (15-40% could move to script)'
          : 'LOW (< 15% - mostly pure reasoning)',
    companionScriptPresence:
      scripts.length > 0
        ? `Yes (${scripts.length} scripts, ${totalScriptLines} LOC)`
        : 'None (All instructions currently inline in prompt)',
  };

  return {
    skillName: frontmatter.name || path.basename(dir),
    category: category || 'unknown',
    directory: dir,
    skillMdPath: skillMd,
    frontmatter,
    progressiveDisclosure,
    bundledResources: {
      scripts,
      references,
      assets,
      totalScriptLines,
    },
    reasoningVsOrchestration,
    scriptCandidatesFound,
    localLlmCandidates,
    cachingAudit,
    conventionsAudit,
    outputArchitecture,
    reasoningTasksDiscovered,
  };
}

function printReport(result) {
  if (result.error) {
    console.error(`\n❌ Error: ${result.error}\n`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🔍 STATIC INSPECTION REPORT: /${result.skillName}`);
  console.log(`📂 Location: ${result.skillMdPath}`);
  console.log(`🏷️  Category: ${result.category}`);
  console.log(`======================================================\n`);

  console.log(`📏 [1] SIZE & PROGRESSIVE DISCLOSURE:`);
  console.log(
    `   - Total Lines: ${result.progressiveDisclosure.lineCount} (Body: ${result.progressiveDisclosure.bodyLines})`
  );
  console.log(`   - Word Count:  ${result.progressiveDisclosure.wordCount} words`);
  console.log(`   - Description: ${result.progressiveDisclosure.descWordCount} words`);
  console.log(`   - Status:      ${result.progressiveDisclosure.verdict}`);
  console.log(
    `   - Resources:   ${result.bundledResources.scripts.length} scripts (${result.bundledResources.totalScriptLines} LOC), ${result.bundledResources.references.length} references, ${result.bundledResources.assets.length} assets`
  );

  console.log(`\n⚖️  [2] REASONING VS LOGIC RATIO:`);
  console.log(
    `   - Logic-in-Prompt Ratio: ${result.reasoningVsOrchestration.estimatedLogicInPromptRatio}`
  );
  console.log(
    `   - Companion Scripts:     ${result.reasoningVsOrchestration.companionScriptPresence}`
  );
  if (result.scriptCandidatesFound.length > 0) {
    console.log(
      `   ⚠️  Detected ${result.scriptCandidatesFound.length} categories of deterministic logic in SKILL.md:`
    );
    for (const sc of result.scriptCandidatesFound) {
      console.log(`      • ${sc.category} (${sc.count} mentions) -> Hint: ${sc.hint}`);
      console.log(`        Samples: ${sc.sampleMatches.join(', ')}`);
    }
  } else {
    console.log(`   ✅ Clean! Minimal deterministic arithmetic/parsing detected in prompt.`);
  }

  console.log(`\n💡 [3] CLOUD -> LOCAL / CHEAP LLM OFFLOADING CANDIDATES:`);
  if (result.localLlmCandidates.length > 0) {
    for (const lc of result.localLlmCandidates) {
      console.log(`   • ${lc.task} (${lc.matchCount} mentions)`);
      console.log(`     Target: ${lc.targetTier}`);
      console.log(`     Keywords: ${lc.sampleMatches.join(', ')}`);
    }
  } else {
    console.log(
      `   (No clear categorical or filtering steps detected; task appears purely qualitative)`
    );
  }

  console.log(`\n🔄 [4] CACHING & CURSORS AUDIT:`);
  console.log(
    `   - Mentions Caching:      ${result.cachingAudit.mentionsCache ? '✅ YES' : '❌ NO'}`
  );
  console.log(
    `   - Uses windowCursor:     ${result.cachingAudit.mentionsWindowCursor ? '✅ YES' : '⚠️  NO (Crucial if scheduled/recurring)'}`
  );
  console.log(
    `   - Scoped Usecase:        ${result.cachingAudit.mentionsUsecasePrefix ? '✅ YES' : '⚠️  NO'}`
  );
  console.log(
    `   - Short-Circuit Exists:  ${result.cachingAudit.hasShortCircuit ? '✅ YES' : '⚠️  NO'}`
  );

  console.log(`\n🛡️  [5] CONVENTIONS & INTEGRITY:`);
  if (result.conventionsAudit.touchesNotesDb) {
    console.log(`   - Touches Notes DB:      YES`);
    console.log(
      `   - sourceSkill Gate:      ${result.conventionsAudit.hasSourceSkillGate ? '✅ PASS' : '🚨 FAIL (Must set sourceSkill on add-note!)'}`
    );
  }
  if (result.conventionsAudit.touchesDatabase) {
    console.log(`   - Touches Database:      YES`);
    console.log(
      `   - data:push Included:    ${result.conventionsAudit.hasDataPush ? '✅ PASS' : '⚠️  WARNING (Missing yarn data:push step)'}`
    );
    console.log(
      `   - Envelope creationTime: ${result.conventionsAudit.hasCreationTimeEnvelope ? '✅ PASS' : '⚠️  Check envelope'}`
    );
    if (result.conventionsAudit.hasBannedCreatedAt) {
      console.log(
        `   - Banned createdAt:      🚨 DETECTED createdAt in prompt. Verify not duplicating creationTime!`
      );
    }
  }
  console.log(`   - Scripts loadEnv():     ${result.conventionsAudit.scriptsCheckLoadEnv}`);

  console.log(`\n📦 [6] OUTPUT ARCHITECTURE:`);
  console.log(
    `   - JSON-first DTO:        ${result.outputArchitecture.producesJsonDto ? '✅ YES' : '⚠️  NO (output-dto-standard recommended)'}`
  );
  console.log(
    `   - Saved PDF Output:      ${result.outputArchitecture.producesPdf ? '✅ YES' : 'ℹ️  NO (Required if analytical report)'}`
  );
  console.log(
    `   - Interactive Widget:    ${result.outputArchitecture.producesHtmlWidget ? '✅ YES' : 'ℹ️  NO'}`
  );
  console.log(
    `   - Files-Touched Report:  ${result.outputArchitecture.hasFilesTouchedManifest ? '✅ YES' : '⚠️  Missing files-touched section'}`
  );

  console.log(`\n🧠 [7] DISCOVERED REASONING TASKS (MANDATORY HUMAN CONFIRMATION GATE):`);
  console.log(
    `   🚨 MANDATE: NEVER assume or decide the criticality of reasoning tasks by yourself!`
  );
  console.log(`   The reviewer MUST stop and ask the user to confirm the importance of each:`);
  if (result.reasoningTasksDiscovered && result.reasoningTasksDiscovered.length > 0) {
    result.reasoningTasksDiscovered.forEach((t, idx) => {
      console.log(`   ${idx + 1}. [${t.header}]`);
      console.log(`      Context: "${t.summary}"`);
    });
  } else {
    console.log(
      `   (No explicit reasoning section headers found; inspect full prompt text for qualitative tasks)`
    );
  }
  console.log(`\n   👉 Mandatory prompt for user:`);
  console.log(
    `      "Which of these reasoning tasks are core Alpha / mission-critical to your investment decisions,`
  );
  console.log(`       which are valuable secondary context, and which are routine summaries?"`);
  console.log(`\n======================================================\n`);
}

function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  const isJson = args.includes('--json');

  if (!target) {
    console.error('Usage: node inspect-skill.js <skill-name-or-path> [--json]');
    process.exit(1);
  }

  const result = inspectSkill(target);
  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }
}

if (require.main === module) {
  main();
}

module.exports = { inspectSkill, resolveSkillPath };
