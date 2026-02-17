#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const specs = [
    'business-logic.spec.js',
    'query-parser.spec.js',
    'operations.spec.js',
    'cache-workflow.spec.js',
    'requests.spec.js',
    'scenarios.spec.js',
    'recording.spec.js',
    'mappings.spec.js',
    'cache-connection.spec.js',
    'editor-monaco.spec.js',
    'sync-engine.spec.js',
    'templates.spec.js'
];

const coverageDir = process.env.NODE_V8_COVERAGE;
if (coverageDir) {
    console.log(`[coverage] V8 coverage will be written to: ${path.resolve(coverageDir)}`);
}

let failures = 0;

for (const spec of specs) {
    const absoluteSpec = path.join(__dirname, spec);
    const result = spawnSync('node', [absoluteSpec], { stdio: 'inherit', env: process.env });

    if (result.error) {
        failures++;
        console.error(`\n❌ Failed to run spec "${spec}": ${result.error.message}`);
        if (result.error.code) {
            console.error(`Error code: ${result.error.code}`);
        }
        continue;
    }

    if (result.status !== 0) {
        failures++;
    }
}

if (failures > 0) {
    console.error(`\n❌ ${failures} spec(s) failed.`);
    process.exit(1);
}

console.log(`\n✅ All ${specs.length} specs completed${coverageDir ? ' with V8 coverage enabled.' : '.'}`);
