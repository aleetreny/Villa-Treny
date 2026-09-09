/** Public build identity; contains no environment values or credentials. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const sha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('A release requires a full Git commit ID.');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync('dist/release.json', JSON.stringify({ application: 'villa-treny', version, commit: sha }, null, 2) + '\n');
