const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'editor', 'monaco-initializer.js'), 'utf8');

assert.match(
    source,
    /createEditor[\s\S]*?foldingMaximumRegions:\s*100000/,
    'Main Monaco editor should raise folding region limit for large JSON documents'
);

assert.match(
    source,
    /createDiffEditor[\s\S]*?foldingMaximumRegions:\s*100000/,
    'Diff Monaco editor should also raise folding region limit for large JSON documents'
);

console.log('✅ Monaco editor folding limit is configured for large JSON payloads');
