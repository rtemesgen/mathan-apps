import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const dist = resolve(import.meta.dirname, '../../frontend/dist');
const output = resolve(dist, 'build-provenance.json');
const repository = resolve(import.meta.dirname, '../..');

function currentGitSha() {
  const gitDirectory = resolve(repository, '.git');
  const head = readFileSync(resolve(gitDirectory, 'HEAD'), 'utf8').trim();
  if (!head.startsWith('ref: ')) return head;
  const reference = head.slice(5);
  const looseReference = resolve(gitDirectory, reference);
  if (existsSync(looseReference)) return readFileSync(looseReference, 'utf8').trim();
  const packed = readFileSync(resolve(gitDirectory, 'packed-refs'), 'utf8').split('\n')
    .find((line) => line.endsWith(` ${reference}`));
  if (!packed) throw new Error(`Could not resolve Git reference ${reference}`);
  return packed.split(' ')[0];
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
