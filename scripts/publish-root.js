const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const SOURCE_SITE = path.join(ROOT, "case-notes-site");

const FILE_TARGETS = [
  "index.html",
  "about.html",
  "contact.html",
  "archive.html",
  "search.html"
];

const DIRECTORY_TARGETS = [
  "assets",
  "case-notes",
  "posts"
];

main();

function main() {
  ensureExists(SOURCE_SITE, "Expected to find the source site in ./case-notes-site.");

  const buildResult = spawnSync("node", ["scripts/build-site.js"], {
    cwd: SOURCE_SITE,
    stdio: "inherit",
    shell: false
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status || 1);
  }

  for (const target of [...FILE_TARGETS, ...DIRECTORY_TARGETS]) {
    removePath(path.join(ROOT, target));
  }

  for (const fileName of FILE_TARGETS) {
    copyFile(path.join(SOURCE_SITE, fileName), path.join(ROOT, fileName));
  }

  for (const directoryName of DIRECTORY_TARGETS) {
    copyDirectory(path.join(SOURCE_SITE, directoryName), path.join(ROOT, directoryName));
  }

  console.log("Published the generated site to the workspace root.");
}

function ensureExists(targetPath, message) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(message);
  }
}

function removePath(targetPath) {
  const resolved = ensureInsideRoot(targetPath);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function copyFile(sourcePath, destinationPath) {
  ensureExists(sourcePath, `Missing source file: ${sourcePath}`);
  const target = ensureInsideRoot(destinationPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(sourcePath, target);
}

function copyDirectory(sourcePath, destinationPath) {
  ensureExists(sourcePath, `Missing source directory: ${sourcePath}`);
  const target = ensureInsideRoot(destinationPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(sourcePath, target, { recursive: true });
}

function ensureInsideRoot(targetPath) {
  const resolvedRoot = path.resolve(ROOT);
  const resolvedTarget = path.resolve(targetPath);

  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside the workspace: ${resolvedTarget}`);
  }

  return resolvedTarget;
}
