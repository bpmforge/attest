#!/usr/bin/env node
// rules.mjs — loader + linter for the `rules/` primitive (P-A3, T1-03).
//
// Cursor-derived lesson (design doc §15.1): "load rules by glob, not always —
// too many always-apply brings context bloat to every chat." A rule file is a
// markdown doc under rules/ carrying frontmatter:
//
//   ---
//   description: 'One-line summary shown when the rule is offered'
//   globs:
//     - "scripts/validators/**/*.sh"
//   alwaysApply: false
//   ---
//
// `alwaysApply: true` rules load into every session; every other rule loads
// ONLY when one of its globs matches a file in the working set. `globs` may
// be a YAML dash-list or a single comma-separated inline string.
//
// Exports (consumed by scripts/validators/validate-rules.sh via the CLI and
// by scripts/test-rules.ts directly):
//   parseRuleFrontmatter(text)         -> { frontmatter, errors }
//   loadRules(rulesDir)                -> [{ file, description, globs, alwaysApply }]
//   selectRules(files, rulesDir)       -> subset: alwaysApply ∪ glob-matched
//   lintRules(rulesDir)                -> [{ file, problem }]
//   globToRegExp(glob)                 -> RegExp (** crosses /, * and ? don't)
//
// CLI:
//   node scripts/lib/rules.mjs lint <rulesDir>          # [GAP] lines, exit 1 on gaps
//   node scripts/lib/rules.mjs select <rulesDir> <file...>  # matched rule files

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';

// Files under rules/ that are documentation about the primitive, not rules.
const NON_RULE_FILES = new Set(['README.md']);

// -- glob → RegExp -----------------------------------------------------------
// Minimal, dependency-free: `**` matches across path separators, `*` and `?`
// match within a segment, everything else is literal. Anchored both ends.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` or trailing `**` — cross segments; swallow a following slash
        // so `a/**/b` also matches `a/b`.
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; }
        else re += '.*';
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$()|[]{}\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

// -- frontmatter -------------------------------------------------------------
export function parseRuleFrontmatter(text) {
  const errors = [];
  const m = text.match(/^---\n([\s\S]*?)\n---(\n|$)/);
  if (!m) {
    return { frontmatter: null, errors: ['missing frontmatter block (--- ... ---)'] };
  }
  const fm = { description: undefined, globs: [], alwaysApply: undefined };
  let alwaysApplySeen = false;
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    if (key === 'description') {
      fm.description = raw.replace(/^['"]|['"]$/g, '');
    } else if (key === 'alwaysApply') {
      alwaysApplySeen = true;
      if (raw === 'true') fm.alwaysApply = true;
      else if (raw === 'false') fm.alwaysApply = false;
      else errors.push(`alwaysApply must be literal true or false, got '${raw}'`);
    } else if (key === 'globs') {
      if (raw !== '') {
        // inline: quoted single glob or comma-separated list, or [a, b]
        const inner = raw.replace(/^\[|\]$/g, '');
        fm.globs = inner
          .split(',')
          .map((g) => g.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean);
      } else {
        // dash-list on following indented lines
        while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
          i++;
          fm.globs.push(lines[i].replace(/^\s+-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
        }
      }
    }
  }
  if (fm.description === undefined || fm.description === '') {
    errors.push('missing or empty `description`');
  }
  if (fm.alwaysApply === undefined && !alwaysApplySeen) {
    errors.push('missing `alwaysApply` (must be explicit: true or false)');
  }
  if (fm.alwaysApply !== true && fm.globs.length === 0) {
    errors.push('rule is not alwaysApply but declares no `globs` — it can never load');
  }
  for (const g of fm.globs) {
    try { globToRegExp(g); }
    catch { errors.push(`unparseable glob '${g}'`); }
  }
  return { frontmatter: fm, errors };
}

// -- loader ------------------------------------------------------------------
function ruleFiles(rulesDir) {
  if (!existsSync(rulesDir) || !statSync(rulesDir).isDirectory()) return [];
  return readdirSync(rulesDir)
    .filter((f) => f.endsWith('.md') && !NON_RULE_FILES.has(f))
    .sort()
    .map((f) => join(rulesDir, f));
}

export function loadRules(rulesDir) {
  const out = [];
  for (const file of ruleFiles(rulesDir)) {
    const { frontmatter, errors } = parseRuleFrontmatter(readFileSync(file, 'utf8'));
    if (errors.length > 0 || !frontmatter) continue; // lintRules reports these
    out.push({
      file,
      description: frontmatter.description,
      globs: frontmatter.globs,
      alwaysApply: frontmatter.alwaysApply === true,
    });
  }
  return out;
}

// selectRules — alwaysApply rules plus every rule whose globs match at least
// one of `files` (paths normalized relative to the rules dir's parent when
// absolute, tried as-given otherwise).
export function selectRules(files, rulesDir) {
  const root = join(rulesDir, '..');
  const candidates = files.map((f) => {
    const relPath = isAbsolute(f) ? relative(root, f) : f;
    return relPath.split('\\').join('/');
  });
  return loadRules(rulesDir).filter((rule) => {
    if (rule.alwaysApply) return true;
    return rule.globs.some((g) => {
      const re = globToRegExp(g);
      return candidates.some((f) => re.test(f));
    });
  });
}

// -- linter ------------------------------------------------------------------
export function lintRules(rulesDir) {
  const gaps = [];
  const files = ruleFiles(rulesDir);
  if (existsSync(rulesDir) && files.length === 0) {
    gaps.push({ file: rulesDir, problem: 'rules/ exists but contains no rule files (*.md beyond README.md)' });
    return gaps;
  }
  for (const file of files) {
    const { errors } = parseRuleFrontmatter(readFileSync(file, 'utf8'));
    for (const e of errors) gaps.push({ file, problem: e });
  }
  return gaps;
}

// -- CLI ---------------------------------------------------------------------
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (invokedDirectly) {
  const [cmd, rulesDir, ...rest] = process.argv.slice(2);
  if (cmd === 'lint' && rulesDir) {
    const gaps = lintRules(rulesDir);
    for (const g of gaps) console.log(`[GAP] ${g.file}: ${g.problem}`);
    process.exit(gaps.length > 0 ? 1 : 0);
  } else if (cmd === 'select' && rulesDir) {
    for (const r of selectRules(rest, rulesDir)) console.log(r.file);
    process.exit(0);
  } else {
    console.error('usage: rules.mjs lint <rulesDir> | select <rulesDir> <file...>');
    process.exit(2);
  }
}
