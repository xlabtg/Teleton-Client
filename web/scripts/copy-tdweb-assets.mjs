#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..');
const source = resolve(webRoot, 'node_modules/tdweb/dist');
const target = resolve(webRoot, 'public');

if (!existsSync(source)) {
  console.warn('tdweb dist assets are not available yet; run npm install in web/ to copy them.');
  process.exit(0);
}

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
console.log(`Copied tdweb runtime assets to ${target}`);
