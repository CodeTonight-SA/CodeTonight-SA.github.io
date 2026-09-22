#!/usr/bin/env node
//
// happi-version.mjs
//
// Two dependency-free static sites advertise a HAPPI protocol version that has
// drifted stale three times.  This tool derives the canonical version from two
// independent authorities, rewrites only the regions explicitly marked as live
// claims, and fails loudly when anything disagrees or is unclassified.
//
// Marker syntax, authored into the site files as comments:
//
//   HTML / SVG:
//     <!-- happi:live -->HAPPI/1.5<!-- /happi:live -->
//     <!-- happi:frozen why="release history" -->...anything...<!-- /happi:frozen -->
//
//   JavaScript / CSS:
//     /* happi:live */ "happi/1.5" /* /happi:live */
//     /* happi:frozen why="back-compat example" */ ... /* /happi:frozen */
//
// Exit codes are load-bearing: 0 ok, 1 violations found, 2 authority problem
// (or a usage problem, which is also impossible to verify).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DEFAULT_SPEC = '/Users/void/.hal/happi.md';
const DEFAULT_RUNTIME = '/Users/void/.grip/lib/precog/idr.py';

const SCAN_EXTENSIONS = new Set(['.html', '.svg', '.js', '.css']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist']);

// A protocol-version literal.  Case is deliberately not folded: the protocol
// spells itself either all-caps or all-lowercase, and --write preserves that.
// Three spellings of the same version appear on these sites and all three are
// live claims somewhere: HAPPI/1.5, happi/1.5 and the bare v1.5. The third was
// found in the wild AFTER the first pass and was invisible to a regex covering
// only the first two, so six stale claims survived a green check. Cover all
// three, and let the frozen markers carry the release-history uses of v1.N.
const LITERAL_RE = /\b(?:(?:HAPPI|happi)\/1\.[0-9]+|v1\.[0-9]+)\b/g;

const SPEC_OUTPUT_RE = /happi\/([0-9]+\.[0-9]+)/;
const RUNTIME_OUTPUT_RE = /HAPPI_VERSION\s*=\s*["']([0-9]+\.[0-9]+)["']/;

// These scanners only recognise the *shape* of a marker.  Strict validation
// happens afterwards so a malformed marker can be reported instead of ignored.
const MARKER_SCANNERS = [
  /<!--\s*(\/?)\s*happi:([A-Za-z]+)([^>]*?)-->/g,
  /\/\*\s*(\/?)\s*happi:([A-Za-z]+)([^*]*?)\*\//g,
];

// A frozen opener may carry a `why="..."` justification and nothing else.
const FROZEN_TAIL_RE = /^\s*(why\s*=\s*["'][^"']*["']\s*)?$/;

function usageText() {
  return [
    'happi-version — derive and enforce the canonical HAPPI protocol version',
    '',
    'usage:',
    '  happi-version --version',
    '      Derive the canonical version from the spec and from the runtime and',
    '      print it.  Exits 2 if either authority is unreadable, unparsable, or',
    '      if the two disagree.',
    '',
    '  happi-version --check [paths...]',
    '      Verify that every protocol literal sits inside a live or frozen',
    '      region, that live literals match the canonical version, that every',
    '      live region carries a literal, that no marker is malformed, and',
    '      that no marker sits inside an enclosing comment.',
    '      Default paths: .html/.svg/.js/.css files under the current directory,',
    '      skipping node_modules, .git and dist.',
    '',
    '  happi-version --write [paths...]',
    '      Rewrite protocol literals inside LIVE regions only, to the canonical',
    '      version.  Frozen regions are never modified.',
    '',
    '  happi-version --help',
    '',
    'environment:',
    `  HAPPI_SPEC     shell script that owns the spec (default ${DEFAULT_SPEC})`,
    `  HAPPI_RUNTIME  runtime file holding HAPPI_VERSION (default ${DEFAULT_RUNTIME})`,
  ].join('\n');
}

function firstLine(message) {
  return String(message).split('\n')[0];
}

// ---------------------------------------------------------------------------
// Authorities
// ---------------------------------------------------------------------------

function readSpecAuthority() {
  const specPath = process.env.HAPPI_SPEC || DEFAULT_SPEC;
  const source = `spec: bash ${specPath}`;
  let stdout;
  try {
    stdout = execFileSync('bash', [specPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    return { ok: false, source, detail: `cannot run it — ${firstLine(error.message)}` };
  }
  const match = SPEC_OUTPUT_RE.exec(stdout);
  if (match === null) {
    return { ok: false, source, detail: 'no happi/<major.minor> found in its output' };
  }
  return { ok: true, source, version: match[1] };
}

function readRuntimeAuthority() {
  const runtimePath = process.env.HAPPI_RUNTIME || DEFAULT_RUNTIME;
  const source = `runtime: ${runtimePath}`;
  let text;
  try {
    text = fs.readFileSync(runtimePath, 'utf8');
  } catch (error) {
    return { ok: false, source, detail: `cannot read it — ${firstLine(error.message)}` };
  }
  const match = RUNTIME_OUTPUT_RE.exec(text);
  if (match === null) {
    return { ok: false, source, detail: 'no HAPPI_VERSION = "major.minor" found in it' };
  }
  return { ok: true, source, version: match[1] };
}

// Never falls back to a default and never prefers one authority over the other.
function resolveCanonicalVersion() {
  const spec = readSpecAuthority();
  const runtime = readRuntimeAuthority();

  // CI override. The two authorities live in private repositories that a GitHub
  // Actions runner cannot reach, so CI asserts the version explicitly instead.
  // Be exact about what this buys: with HAPPI_EXPECTED set, the check proves the
  // site agrees with the value CI was told, NOT that the value is current. It
  // catches a hand-edited version string; it cannot catch the protocol moving
  // while nobody runs --write. Closing that needs the authorities published.
  const expected = (process.env.HAPPI_EXPECTED || '').trim();
  if (expected) {
    if (!/^[0-9]+\.[0-9]+$/.test(expected)) {
      console.log(`HAPPI_EXPECTED is not a major.minor version: ${JSON.stringify(expected)}`);
      return { ok: false, code: 2 };
    }
    return { ok: true, version: expected, source: 'HAPPI_EXPECTED (CI override)' };
  }

  if (!spec.ok) {
    console.log(`authority 1 (${spec.source}): ${spec.detail}`);
  }
  if (!runtime.ok) {
    console.log(`authority 2 (${runtime.source}): ${runtime.detail}`);
  }
  if (!spec.ok || !runtime.ok) {
    return { ok: false, code: 2 };
  }

  if (spec.version !== runtime.version) {
    console.log(`authority 1 (${spec.source}) says ${spec.version}`);
    console.log(`authority 2 (${runtime.source}) says ${runtime.version}`);
    console.log(`authorities disagree: ${spec.version} vs ${runtime.version}`);
    return { ok: false, code: 2 };
  }

  return { ok: true, version: spec.version };
}

// ---------------------------------------------------------------------------
// Line numbers (1-based, against the original text)
// ---------------------------------------------------------------------------

function computeLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineOf(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

// ---------------------------------------------------------------------------
// Markers, regions and literals
// ---------------------------------------------------------------------------

function markerProblem(marker) {
  // Returns a description of what is wrong, or null when well formed.
  if (marker.kind !== 'live' && marker.kind !== 'frozen') {
    return `unknown region kind happi:${marker.kind}`;
  }
  const tail = marker.tail;
  if (marker.isClose) {
    return /^\s*$/.test(tail)
      ? null
      : `closer /happi:${marker.kind} has trailing text ${JSON.stringify(tail.trim())}`;
  }
  if (marker.kind === 'live') {
    return /^\s*$/.test(tail)
      ? null
      : `opener happi:live has unexpected text ${JSON.stringify(tail.trim())}`;
  }
  return FROZEN_TAIL_RE.test(tail)
    ? null
    : `opener happi:frozen has unexpected text ${JSON.stringify(tail.trim())}`;
}

function findMarkers(text, lineStarts) {
  const markers = [];

  for (const scanner of MARKER_SCANNERS) {
    scanner.lastIndex = 0;
    let match;
    while ((match = scanner.exec(text)) !== null) {
      markers.push({
        start: match.index,
        end: match.index + match[0].length,
        isClose: match[1] === '/',
        kind: match[2],
        tail: match[3],
        raw: match[0],
      });
    }
  }

  markers.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  // Two scanners can never legitimately overlap; drop any later overlap.
  const kept = [];
  let lastEnd = -1;
  for (const marker of markers) {
    if (marker.start < lastEnd) continue;
    kept.push(marker);
    lastEnd = marker.end;
  }

  for (const marker of kept) {
    marker.line = lineOf(lineStarts, marker.start);
    marker.problem = markerProblem(marker);
    marker.structural = marker.kind === 'live' || marker.kind === 'frozen';
  }
  return kept;
}

// A marker is written as a comment, so placing one INSIDE an existing comment
// is a nesting bug: neither C-style nor HTML comments nest, and the marker's own
// terminator closes the ENCLOSING comment. The remainder of that comment then
// becomes live source. In CSS the parser discards tokens to resync and takes the
// next rule with it -- that is how a global `box-sizing: border-box` reset was
// silently deleted, turning every element on a six-page site content-box while
// this check, a marker-stripped text diff, and `node --check` all stayed green.
// In HTML and SVG the remainder leaks into the document as visible text.
//
// It is detectable only structurally, so it is detected here.
// Inside <script> or <style>, an HTML-form marker placed within a QUOTED STRING
// is not a comment -- it is part of the string's value. A page shipped with
//   var PROTO = '<!-- happi:live -->happi/1.5<!-- /happi:live -->';
// and that variable fed the `v` field of thirteen simulated events, so the
// demo's own output rendered raw marker text where the protocol version belongs.
// Nothing textual sees it: the markers pair correctly and the literal is inside
// a region, so this check passed and `node --check` passed. Markers in those
// blocks belong OUTSIDE the literal, in the block's own comment syntax.
// A third placement that is invisible to every textual check: inside an HTML
// ATTRIBUTE VALUE, or inside <title>. Neither is a comment context -- the HTML
// parser does not strip comments there -- so the marker renders as literal text
// in a page title, a meta description, a link preview or an aria-label. This
// happened 32 times on this site and was fixed by hand; it is rejected here so
// it cannot return. Markers belong AROUND such an element, never inside it.
function findMarkersInMarkupText(text, lineStarts) {
  const violations = [];
  const htmlMarker = /<!--\s*\/?\s*happi:[A-Za-z]+[^>]*?-->/;

  // Blank out <script>/<style> bodies: they are RAWTEXT, carry their own
  // syntax, and are covered by the string-literal and comment checks instead.
  let masked = text.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g,
    (m, tag, body) => m.slice(0, m.length - body.length - tag.length - 3)
                    + '\u0000'.repeat(body.length)
                    + m.slice(m.length - tag.length - 3));

  // inside an attribute value.
  //
  // A tag cannot be found with /<[a-zA-Z][^<>]*>/ here, and that is the whole
  // difficulty: the marker being looked for CONTAINS `<` and `>`, so the very
  // tags that are broken are the ones such a pattern skips. It silently matches
  // nothing and reports a clean file. Scan forward instead, tracking quotes, and
  // end the tag at the first `>` that is not inside an attribute value.
  const tagSpans = [];
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] !== '<') continue;
    if (!/[a-zA-Z]/.test(masked[i + 1] || '')) continue;
    let quote = null;
    for (let j = i + 1; j < masked.length; j++) {
      const ch = masked[j];
      if (quote) { if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '>') { tagSpans.push([i, j + 1]); i = j; break; }
      if (ch === '<' && masked[j + 1] !== '!') { break; }
    }
  }
  for (const [tagStart, tagEnd] of tagSpans) {
    const tag = { index: tagStart };
    const raw = text.slice(tagStart, tagEnd);
    const attrRe = /=\s*("([^"]*)"|'([^']*)')/g;
    let attr;
    while ((attr = attrRe.exec(raw)) !== null) {
      const value = attr[2] !== undefined ? attr[2] : attr[3];
      if (value === undefined || !htmlMarker.test(value)) continue;
      violations.push({
        line: lineOf(lineStarts, tag.index + attr.index),
        detail: `marker is inside an HTML attribute value, where it is not a `
              + `comment and renders as literal text: ${attr[1].slice(0, 70)}`,
      });
    }
  }

  // <title> and <textarea> are RCDATA: the parser does not strip comments there
  // either, so a marker renders as literal text -- in a browser tab, a search
  // result, or as the pre-filled contents of an editable box.
  const rcdataRe = /<(title|textarea)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let t;
  while ((t = rcdataRe.exec(text)) !== null) {
    if (!htmlMarker.test(t[2])) continue;
    violations.push({
      line: lineOf(lineStarts, t.index),
      detail: `marker is inside <${t[1].toLowerCase()}>, which is RCDATA and not a `
            + `comment context, so it renders as literal text`,
    });
  }
  return violations;
}

function findMarkersInStringLiterals(text, lineStarts) {
  const violations = [];
  const htmlMarker = /<!--\s*\/?\s*happi:[A-Za-z]+[^>]*?-->/;
  const blockRe = /<(script|style)\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/\1>/g;
  let block;
  while ((block = blockRe.exec(text)) !== null) {
    const body = block[2];
    const base = block.index + block[0].indexOf(body);
    const strRe = /'([^'\n]*)'|"([^"\n]*)"/g;
    let s;
    while ((s = strRe.exec(body)) !== null) {
      const value = s[1] !== undefined ? s[1] : s[2];
      if (value === undefined || !htmlMarker.test(value)) continue;
      violations.push({
        line: lineOf(lineStarts, base + s.index),
        detail: `marker is inside a <${block[1]}> string literal, so it becomes part `
              + `of the string's VALUE rather than classifying it: ${s[0].slice(0, 70)}`,
      });
    }
  }
  return violations;
}

function findNestedCommentViolations(text, markers, lineStarts) {
  const violations = [];
  if (markers.length === 0) return violations;

  // Blank out every marker first. Otherwise a marker's own delimiters are read
  // as the enclosing comment and every marker looks like its own parent.
  let masked = text;
  for (const m of markers) {
    masked = masked.slice(0, m.start) + '\u0000'.repeat(m.end - m.start) + masked.slice(m.end);
  }

  // Only a marker whose OWN terminator can close the enclosing comment is
  // dangerous, so the syntax families must match. An HTML-form marker inside a
  // CSS comment carries no `*/` and cannot terminate it -- verified by stripping
  // every such marker from a six-page site and measuring no change. Flagging
  // those would be 23 false positives and would train the reader to ignore this.
  const spans = [];
  for (const [re, family] of [[/\/\*[\s\S]*?\*\//g, 'c'], [/<!--[\s\S]*?-->/g, 'html']]) {
    re.lastIndex = 0;
    let hit;
    while ((hit = re.exec(masked)) !== null) {
      spans.push([hit.index, hit.index + hit[0].length, family]);
    }
  }

  for (const m of markers) {
    const markerFamily = m.raw.trim().startsWith('<!--') ? 'html' : 'c';
    for (const [a, b, family] of spans) {
      if (family === markerFamily && a < m.start && m.end <= b) {
        violations.push({
          line: m.line,
          detail: `marker sits inside an enclosing comment — comments do not nest, `
                + `so this terminates the comment early and corrupts the file: `
                + `${m.raw.trim()}`,
        });
        break;
      }
    }
  }
  return violations;
}

function analyseText(text) {
  const lineStarts = computeLineStarts(text);
  const markers = findMarkers(text, lineStarts);
  const violations = [];
  const regions = [];
  const stack = [];

  for (const marker of markers) {
    if (marker.problem !== null) {
      violations.push({
        line: marker.line,
        detail: `malformed marker: ${marker.raw.trim()} — ${marker.problem}`,
      });
    }
    if (!marker.structural) continue;

    if (!marker.isClose) {
      if (stack.length > 0) {
        const outer = stack[stack.length - 1];
        violations.push({
          line: marker.line,
          detail: `nested happi:${marker.kind} region inside happi:${outer.kind} region`,
        });
      }
      const region = {
        kind: marker.kind,
        openStart: marker.start,
        bodyStart: marker.end,
        closeStart: text.length,
        closeEnd: text.length,
        line: marker.line,
      };
      regions.push(region);
      stack.push(region);
      continue;
    }

    if (stack.length === 0) {
      violations.push({
        line: marker.line,
        detail: `closer without opener: /happi:${marker.kind}`,
      });
      continue;
    }

    const top = stack.pop();
    if (top.kind !== marker.kind) {
      violations.push({
        line: marker.line,
        detail: `mismatched closer /happi:${marker.kind} while happi:${top.kind} is open`,
      });
    }
    top.closeStart = marker.start;
    top.closeEnd = marker.end;
  }

  for (const region of stack) {
    violations.push({
      line: region.line,
      detail: `unclosed happi:${region.kind} region`,
    });
  }

  for (const v of findNestedCommentViolations(text, markers, lineStarts)) {
    violations.push(v);
  }
  for (const v of findMarkersInStringLiterals(text, lineStarts)) {
    violations.push(v);
  }
  for (const v of findMarkersInMarkupText(text, lineStarts)) {
    violations.push(v);
  }

  return { lineStarts, regions, violations };
}

function findLiterals(text, lineStarts) {
  const literals = [];
  LITERAL_RE.lastIndex = 0;
  let match;
  while ((match = LITERAL_RE.exec(text)) !== null) {
    literals.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
      // The spelling this literal uses, so a rewrite keeps it: 'HAPPI/', 'happi/'
      // or the bare 'v' form. Reconstructing with the wrong prefix would corrupt
      // the page rather than correct it.
      prefix: match[0].startsWith('v') ? 'v' : match[0].slice(0, match[0].indexOf('/') + 1),
      line: lineOf(lineStarts, match.index),
    });
  }
  return literals;
}

function enclosingRegions(regions, offset) {
  const enclosing = [];
  for (const region of regions) {
    if (offset >= region.bodyStart && offset < region.closeStart) enclosing.push(region);
  }
  return enclosing;
}

// ---------------------------------------------------------------------------
// Path collection
// ---------------------------------------------------------------------------

function walkDirectory(directory, collected) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walkDirectory(full, collected);
    } else if (entry.isFile()) {
      if (SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) collected.push(full);
    }
  }
}

function collectFiles(inputs) {
  const files = [];
  for (const input of inputs) {
    let stats;
    try {
      stats = fs.statSync(input);
    } catch (error) {
      throw new Error(`cannot read ${input} — ${firstLine(error.message)}`);
    }
    if (stats.isDirectory()) walkDirectory(input, files);
    else files.push(input);
  }
  files.sort();
  return files;
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

function runCheck(files, canonical) {
  let liveRegions = 0;
  let frozenRegions = 0;
  let violationCount = 0;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      console.log(`${file}:1  cannot read file — ${firstLine(error.message)}`);
      violationCount += 1;
      continue;
    }

    const { lineStarts, regions, violations } = analyseText(text);
    const literals = findLiterals(text, lineStarts);
    const found = violations.slice();

    for (const literal of literals) {
      const enclosing = enclosingRegions(regions, literal.start);

      if (enclosing.length === 0) {
        found.push({
          line: literal.line,
          detail: `unclassified literal ${literal.text} — wrap in happi:live or happi:frozen`,
        });
        continue;
      }

      // A literal inside any frozen region is historical and never judged,
      // even in the pathological case of a live region nested inside it.
      if (enclosing.some((region) => region.kind === 'frozen')) continue;

      const expected = `${literal.prefix}${canonical}`;
      if (literal.text !== expected) {
        found.push({
          line: literal.line,
          detail: `stale live literal ${literal.text} — expected ${expected}`,
        });
      }
    }

    for (const region of regions) {
      if (region.kind !== 'live') {
        frozenRegions += 1;
        continue;
      }
      liveRegions += 1;
      const hasLiteral = literals.some(
        (literal) => literal.start >= region.bodyStart && literal.start < region.closeStart,
      );
      if (!hasLiteral) {
        found.push({ line: region.line, detail: 'live region with no protocol literal' });
      }
    }

    found.sort((a, b) => a.line - b.line);
    for (const violation of found) {
      console.log(`${file}:${violation.line}  ${violation.detail}`);
    }
    violationCount += found.length;
  }

  console.log(
    `scanned ${files.length} files, ${liveRegions} live regions, ` +
    `${frozenRegions} frozen regions, ${violationCount} violations`,
  );

  return violationCount === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// --write
// ---------------------------------------------------------------------------

function runWrite(files, canonical) {
  let rewriteCount = 0;
  let failed = false;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      console.log(`${file}: cannot read file — ${firstLine(error.message)}`);
      failed = true;
      continue;
    }

    const { lineStarts, regions } = analyseText(text);
    if (!regions.some((region) => region.kind === 'live')) continue;

    const literals = findLiterals(text, lineStarts);
    const edits = [];

    for (const literal of literals) {
      const enclosing = enclosingRegions(regions, literal.start);
      if (enclosing.length === 0) continue;
      // Frozen wins over everything: never modify a byte inside a frozen region.
      if (enclosing.some((region) => region.kind === 'frozen')) continue;

      const next = `${literal.prefix}${canonical}`;
      if (next === literal.text) continue;

      edits.push({
        start: literal.start,
        end: literal.end,
        before: literal.text,
        next,
        line: literal.line,
      });
    }

    if (edits.length === 0) continue;

    // Rebuild the file by slicing the original around each edit, so every byte
    // outside the rewritten literals (including line endings) is preserved.
    let output = '';
    let cursor = 0;
    for (const edit of edits) {
      output += text.slice(cursor, edit.start) + edit.next;
      cursor = edit.end;
    }
    output += text.slice(cursor);

    try {
      fs.writeFileSync(file, output, 'utf8');
    } catch (error) {
      console.log(`${file}: cannot write file — ${firstLine(error.message)}`);
      failed = true;
      continue;
    }

    for (const edit of edits) {
      console.log(`${file}:${edit.line}  ${edit.before} -> ${edit.next}`);
    }
    rewriteCount += edits.length;
  }

  const noun = rewriteCount === 1 ? 'rewrite' : 'rewrites';
  console.log(`${rewriteCount} ${noun}`);
  return failed ? 2 : 0;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(argv) {
  const mode = argv[0];

  if (mode === undefined) {
    console.log(usageText());
    return 2;
  }

  if (mode === '--help' || mode === '-h' || mode === 'help') {
    console.log(usageText());
    return 0;
  }

  if (mode === '--version') {
    const authority = resolveCanonicalVersion();
    if (!authority.ok) return authority.code;
    console.log(authority.version);
    return 0;
  }

  if (mode === '--check' || mode === '--write') {
    const authority = resolveCanonicalVersion();
    if (!authority.ok) return authority.code;

    const rest = argv.slice(1);
    let files;
    try {
      files = collectFiles(rest.length > 0 ? rest : ['.']);
    } catch (error) {
      console.log(firstLine(error.message));
      return 2;
    }

    return mode === '--check'
      ? runCheck(files, authority.version)
      : runWrite(files, authority.version);
  }

  console.log(usageText());
  return 2;
}

process.exitCode = main(process.argv.slice(2));