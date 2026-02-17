#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { transform } = require("esbuild");

const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");

const APP_FILES = [
  "js/lib/logger.js",
  "editor/monaco-template-library.js",
  "js/vendor-js-yaml.min.js",
  "js/constants.js",
  "js/core.js",
  "js/features/notification-manager.js",
  "js/managers.js",
  "js/demo-data.js",
  "js/features/state.js",
  "js/features/utils.js",
  "js/features/settings-store.js",
  "js/features/templates.js",
  "js/features/queryParser.js",
  "js/features/render-helpers.js",
  "js/features/filters.js",
  "js/features/filter-presets.js",
  "js/features/store.js",
  "js/features/sync-engine.js",
  "js/features/sync-engine-ui-bridge.js",
  "js/features/operations.js",
  "js/features/cache.js",
  "js/features/mappings.js",
  "js/features/pagination.js",
  "js/features/event-delegation.js",
  "js/features/requests.js",
  "js/features/scenario-model.js",
  "js/features/scenarios.js",
  "js/features/recording.js",
  "js/features/management.js",
  "js/features/request-api.js",
  "js/features/wiremock-extras.js",
  "js/features/demo.js",
  "js/features.js",
  "js/editor.js",
  "js/main.js",
];

const EDITOR_FILES = [
  "editor/performance-optimizations.js",
  "js/lib/logger.js",
  "editor/monaco-loader.js",
  "editor/monaco-template-library.js",
  "js/vendor-js-yaml.min.js",
  "js/constants.js",
  "js/core.js",
  "js/features/notification-manager.js",
  "js/managers.js",
  "js/demo-data.js",
  "js/features/state.js",
  "js/features/utils.js",
  "js/features/settings-store.js",
  "js/features/templates.js",
  "js/features/render-helpers.js",
  "js/features/filters.js",
  "js/features/cache.js",
  "js/core/lifecycle.js",
  "js/features/store.js",
  "js/features/sync-engine.js",
  "js/features/sync-engine-ui-bridge.js",
  "js/features/operations.js",
  "js/features/mappings.js",
  "js/features/requests.js",
  "js/features/scenario-model.js",
  "js/features/scenarios.js",
  "js/features/recording.js",
  "js/features/management.js",
  "js/features/request-api.js",
  "js/features/wiremock-extras.js",
  "js/features/demo.js",
  "js/features.js",
  "js/main.js",
  "editor/yaml-utils.js",
  "editor/editor-history.js",
  "editor/editor-templates.js",
  "editor/monaco-initializer.js",
  "editor/monaco-bootstrap.js",
];

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    dev: args.has("--dev"),
    watch: args.has("--watch"),
  };
}

function readSourceFile(relativePath) {
  const absolutePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing source file: ${relativePath}`);
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  return `// --- ${relativePath} ---\n${content.trimEnd()}\n`;
}

function concatSources(files) {
  return files.map(readSourceFile).join("\n");
}

async function writeBundle(outputName, files, options) {
  const joinedSource = concatSources(files);
  let outputCode = joinedSource;

  if (!options.dev) {
    const transformed = await transform(joinedSource, {
      minify: true,
      target: "es2020",
    });
    outputCode = transformed.code;
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  const outputPath = path.join(DIST_DIR, outputName);
  fs.writeFileSync(outputPath, outputCode, "utf8");
  console.log(`[build] Wrote ${path.relative(ROOT_DIR, outputPath)}`);
}

async function buildAll(options) {
  await writeBundle("app.js", APP_FILES, options);
  await writeBundle("editor.js", EDITOR_FILES, options);
}

function startWatch(options) {
  let isBuilding = false;
  let pendingBuild = false;

  const triggerBuild = async () => {
    if (isBuilding) {
      pendingBuild = true;
      return;
    }

    isBuilding = true;
    try {
      await buildAll(options);
      console.log(`[watch] Build complete at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.error("[watch] Build failed:", error.message);
    } finally {
      isBuilding = false;
      if (pendingBuild) {
        pendingBuild = false;
        void triggerBuild();
      }
    }
  };

  let debounceTimer = null;
  const onFileChange = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void triggerBuild();
    }, 120);
  };

  ["js", "editor"].forEach((dir) => {
    const watchPath = path.join(ROOT_DIR, dir);
    fs.watch(watchPath, { recursive: true }, onFileChange);
    console.log(`[watch] Watching ${path.relative(ROOT_DIR, watchPath)}`);
  });

  void triggerBuild();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.watch) {
    startWatch(options);
    return;
  }

  await buildAll(options);
}

main().catch((error) => {
  console.error("[build] Failed:", error.message);
  process.exit(1);
});
