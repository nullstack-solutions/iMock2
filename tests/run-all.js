#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const specs = [
    'business-logic.spec.js',
    // 'cache-workflow.spec.js', // TODO: Rewrite for new MappingsStore architecture (removed old cacheManager)
    'requests.spec.js',
    'scenarios.spec.js',
    'recording.spec.js',
    // 'mappings.spec.js', // TODO: Rewrite for new MappingsStore architecture (uses cacheManager.cache and optimisticQueue)
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
