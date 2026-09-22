#!/usr/bin/env node
// Counter-tests for happi-version --check.
//
// Every case here is a marker placement that CORRUPTS the file while the markers
// themselves pair correctly, so nothing textual notices. Three of the four
// shipped to production before being caught, one of them by rendering the page
// and counting stylesheet rules. A guard against them is worth nothing unless it
// has been watched to fail, so each case asserts the check REJECTS the bad file
// and a clean control asserts it does not reject everything.
//
//   node tools/test-happi-version.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, 'happi-version.mjs');
const VERSION = '1.5';

const CLEAN_HTML = `<!doctype html>
<html><head>
<!-- happi:live --><title>HAPPI/${VERSION}</title><!-- /happi:live -->
<!-- happi:live --><meta name="description" content="HAPPI/${VERSION} protocol" /><!-- /happi:live -->
<style>
/* happi:frozen why="banner" */
/* ===== a file banner mentioning HAPPI/1.0 ===== */
/* /happi:frozen */
body { box-sizing: border-box; }
</style>
</head><body>
<p><!-- happi:live -->happi/${VERSION}<!-- /happi:live --></p>
<p><!-- happi:frozen why="release history" -->v1.2<!-- /happi:frozen --> added the memory-chain.</p>
<textarea>no markers in here</textarea>
<script>
var PROTO = /* happi:live */'happi/${VERSION}'/* /happi:live */;
</script>
</body></html>
`;

const CASES = [
  {
    name: 'marker inside a CSS comment (closes it early; the next rule is discarded)',
    file: 'style.css',
    body: `/* =========================\n   /* happi:frozen why="banner" */HAPPI/1.0/* /happi:frozen */\n   ========================= */\n*, *::before, *::after { box-sizing: border-box; }\n`,
    expect: 'enclosing comment',
  },
  {
    // The outer comment must be TERMINATED, or there is no enclosing comment for
    // the marker to sit inside and the case tests nothing. An earlier version of
    // this fixture omitted the closing --> and reported a false MISSED.
    name: 'marker inside an HTML comment (the inner --> ends the outer one)',
    replace: ['<textarea>no markers in here</textarea>',
              `<!-- editorial note: the badge reads <!-- happi:live -->HAPPI/${VERSION}<!-- /happi:live --> today -->`],
    expect: 'enclosing comment',
  },
  {
    name: 'marker inside a <script> string literal (becomes the string VALUE)',
    replace: [`/* happi:live */'happi/${VERSION}'/* /happi:live */`,
              `'<!-- happi:live -->happi/${VERSION}<!-- /happi:live -->'`],
    expect: 'string literal',
  },
  {
    name: 'marker inside an HTML attribute value (renders as literal text)',
    replace: [`<!-- happi:live --><meta name="description" content="HAPPI/${VERSION} protocol" /><!-- /happi:live -->`,
              `<meta name="description" content="<!-- happi:live -->HAPPI/${VERSION}<!-- /happi:live --> protocol" />`],
    expect: 'attribute value',
  },
  {
    name: 'marker inside <title> (RCDATA; renders in the browser tab)',
    replace: [`<!-- happi:live --><title>HAPPI/${VERSION}</title><!-- /happi:live -->`,
              `<title>HAPPI<!-- happi:live -->/${VERSION}<!-- /happi:live --></title>`],
    expect: 'RCDATA',
  },
  {
    name: 'marker inside <textarea> (RCDATA; renders as the box contents)',
    replace: ['<textarea>no markers in here</textarea>',
              `<textarea><!-- happi:live -->happi/${VERSION}<!-- /happi:live --></textarea>`],
    expect: 'RCDATA',
  },
  {
    name: 'a stale live claim',
    replace: [`<p><!-- happi:live -->happi/${VERSION}<!-- /happi:live --></p>`,
              '<p><!-- happi:live -->happi/1.1<!-- /happi:live --></p>'],
    expect: 'expected',
  },
  {
    name: 'an unclassified literal',
    replace: ['<textarea>no markers in here</textarea>', '<p>happi/1.3</p>'],
    expect: 'unclassified literal',
  },
];

function run(dir) {
  try {
    const out = execFileSync(process.execPath, [TOOL, '--check', dir],
      { encoding: 'utf8', env: { ...process.env, HAPPI_EXPECTED: VERSION } });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

function fixture(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'happi-version-test-'));
  let html = CLEAN_HTML;
  if (mutate && mutate.replace) {
    const [from, to] = mutate.replace;
    if (!html.includes(from)) throw new Error(`fixture does not contain: ${from.slice(0, 60)}`);
    html = html.replace(from, to);
  }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  if (mutate && mutate.file) fs.writeFileSync(path.join(dir, mutate.file), mutate.body);
  return dir;
}

let failures = 0;

// Control first. Without it a pass below could mean the check rejects everything,
// or that the fixture never reached it.
const cleanDir = fixture(null);
const control = run(cleanDir);
if (control.code !== 0) {
  failures += 1;
  console.log(`FAIL  control: a clean fixture was rejected\n${control.out}`);
} else if (!/live regions/.test(control.out)) {
  failures += 1;
  console.log(`FAIL  control: the check did not scan the fixture\n${control.out}`);
} else {
  console.log(`ok    control: clean fixture accepted — ${control.out.trim().split('\n').pop()}`);
}

for (const testCase of CASES) {
  const dir = fixture(testCase);
  const result = run(dir);
  const rejected = result.code !== 0;
  const explained = result.out.includes(testCase.expect);
  if (rejected && explained) {
    console.log(`ok    rejected: ${testCase.name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`        exit=${result.code}  expected text ${JSON.stringify(testCase.expect)} present=${explained}`);
    console.log(`        ${result.out.trim().split('\n').join('\n        ')}`);
  }
}

console.log(`\n${CASES.length + 1} cases, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
