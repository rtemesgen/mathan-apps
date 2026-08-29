import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const dist = resolve(import.meta.dirname, '../../frontend/dist');
const output = resolve(dist, 'build-provenance.json');
const repository = resolve(import.meta.dirname, '../..');

function currentGitSha() {
  // `git rev-parse` works for both a regular checkout and a linked worktree,
  // where .git is a pointer file rather than a directory.
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

const hash = createHash('sha256');
filesBelow(dist).filter((path) => path !== output).sort().forEach((path) => {
  hash.update(relative(dist, path));
  hash.update(readFileSync(path));
});

const provenance = {
  gitSha: currentGitSha(),
  assetHash: hash.digest('hex'),
  builtAt: new Date().toISOString(),
  diagnostics: process.env.VITE_ENABLE_OFFLINE_DIAGNOSTICS === 'true',
};
writeFileSync(output, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`Build provenance: ${provenance.gitSha.slice(0, 12)} ${provenance.assetHash.slice(0, 12)}`);
