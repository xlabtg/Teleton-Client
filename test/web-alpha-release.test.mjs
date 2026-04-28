import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);

function pathFor(relativePath) {
  return new URL(relativePath, root);
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathFor(relativePath), 'utf8'));
}

test('alpha web client release project is scaffolded with the required runtime contracts', async () => {
  const requiredFiles = [
    'web/package.json',
    'web/index.html',
    'web/vite.config.ts',
    'web/.env.example',
    'web/README.md',
    'web/deploy.sh',
    'web/public/manifest.webmanifest',
    'web/public/service-worker.js',
    'web/public/offline.html',
    'web/public/icons/icon-192.png',
    'web/public/icons/icon-512.png',
    'web/src/app/App.tsx',
    'web/src/services/tdlib.service.ts',
    'web/src/services/agent.service.ts',
    'web/src/services/proxy.service.ts',
    'web/src/services/crypto.service.ts',
    'web/src/shared/store/useTeletonStore.ts',
    'web/src/widgets/ChatList.tsx',
    'web/src/widgets/MessageWindow.tsx',
    'web/src/widgets/InputBar.tsx',
    'web/tests/services.test.ts'
  ];

  for (const requiredFile of requiredFiles) {
    assert.equal(existsSync(pathFor(requiredFile)), true, `${requiredFile} is required for the alpha web release`);
  }

  const packageJson = await readJson('web/package.json');
  assert.equal(packageJson.scripts.dev, 'vite --host 0.0.0.0');
  assert.equal(packageJson.scripts.build, 'tsc -b && vite build');
  assert.equal(packageJson.scripts.test, 'vitest run');

  for (const dependency of ['@tonconnect/ui-react', 'react', 'react-router-dom', 'tdweb', 'zustand']) {
    assert.ok(packageJson.dependencies[dependency], `web/package.json must depend on ${dependency}`);
  }

  assert.ok(packageJson.devDependencies.tailwindcss, 'web/package.json must configure TailwindCSS');

  const envExample = await readFile(pathFor('web/.env.example'), 'utf8');
  assert.match(envExample, /VITE_TELEGRAM_API_ID=/);
  assert.match(envExample, /VITE_TELEGRAM_API_HASH=/);
  assert.match(envExample, /VITE_TELETON_AGENT_WS_URL=ws:\/\/localhost:8765/);
  assert.match(envExample, /VITE_TELETON_AGENT_MANAGEMENT_URL=https:\/\/localhost:7778/);

  const tdlibService = await readFile(pathFor('web/src/services/tdlib.service.ts'), 'utf8');
  assert.match(tdlibService, /authPhone/);
  assert.match(tdlibService, /authCode/);
  assert.match(tdlibService, /getChats/);
  assert.match(tdlibService, /sendMessage/);
  assert.match(tdlibService, /setProxy/);
  assert.match(tdlibService, /tdweb/);
  assert.match(tdlibService, /loadTdClientConstructor/);

  const agentService = await readFile(pathFor('web/src/services/agent.service.ts'), 'utf8');
  assert.match(agentService, /jsonrpc: '2\.0'/);
  assert.match(agentService, /agent\.enable/);
  assert.match(agentService, /agent\.disable/);
  assert.match(agentService, /ton\.getBalance/);
  assert.match(agentService, /ton\.sendTx/);
  assert.match(agentService, /\/v1\/agent\/status/);

  const cryptoService = await readFile(pathFor('web/src/services/crypto.service.ts'), 'utf8');
  assert.match(cryptoService, /AES-GCM/);
  assert.match(cryptoService, /indexedDB/);
  assert.match(cryptoService, /persistEncryptedSession/);
  assert.match(cryptoService, /consent !== true/);

  const store = await readFile(pathFor('web/src/shared/store/useTeletonStore.ts'), 'utf8');
  assert.doesNotMatch(store, /localStorage\.setItem\([^)]*session/i, 'Telegram sessions must not be persisted to localStorage');

  const webReadme = await readFile(pathFor('web/README.md'), 'utf8');
  assert.match(webReadme, /npm install/);
  assert.match(webReadme, /npm run build/);
  assert.match(webReadme, /teleton-agent/i);
  assert.match(webReadme, /encrypted/i);
});
