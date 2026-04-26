import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  SECURE_DATA_DELETION_SCOPES,
  createSecureDataDeletionPlan,
  executeSecureDataDeletionPlan
} from '../src/foundation/secure-data-deletion.mjs';

const reviewedAt = '2026-04-26T12:05:00.000Z';
const requestedAt = '2026-04-26T12:00:00.000Z';

test('secure data deletion plan covers account, cache, agent, and wallet local data scopes', () => {
  const plan = createSecureDataDeletionPlan({
    platform: 'desktop',
    scopes: ['account', 'cache', 'agent', 'wallet'],
    requestedAt,
    recoveryWindowHours: { cache: 24 },
    humanReview: {
      approved: true,
      reviewer: 'security-reviewer',
      reviewedAt
    }
  });

  assert.deepEqual(SECURE_DATA_DELETION_SCOPES, ['account', 'cache', 'agent', 'wallet']);
  assert.equal(plan.kind, 'teleton.secureDataDeletion.plan');
  assert.equal(plan.platform, 'desktop');
  assert.equal(plan.confirmation.requiredText, 'DELETE LOCAL ACCOUNT, CACHE, AGENT, AND WALLET DATA');
  assert.match(plan.confirmation.summary, /irreversible/i);
  assert.equal(plan.confirmation.remoteDeletion, false);
  assert.equal(plan.humanReview.status, 'approved');
  assert.equal(plan.humanReview.releaseBlocker, false);
  assert.deepEqual(plan.recovery.eligibleScopes, ['cache']);
  assert.equal(plan.recovery.deadlineAt, '2026-04-27T12:00:00.000Z');
  assert.ok(plan.platformLimitations.some((limitation) => /SSD|journaling|backup/i.test(limitation)));

  for (const scope of SECURE_DATA_DELETION_SCOPES) {
    assert.ok(plan.locations.some((location) => location.scope === scope), `${scope} needs storage locations`);
    assert.ok(plan.operations.some((operation) => operation.scope === scope), `${scope} needs deletion operations`);
    assert.match(plan.confirmation.effects.join('\n'), new RegExp(scope, 'i'));
  }

  assert.ok(
    plan.operations.some(
      (operation) => operation.scope === 'agent' && operation.kind === 'destroy-secure-ref'
    ),
    'agent memory deletion must destroy the local encryption key reference'
  );
  assert.ok(
    plan.operations.some((operation) => operation.scope === 'wallet' && operation.kind === 'destroy-secure-ref'),
    'wallet deletion must remove local wallet provider references'
  );
  assert.ok(
    plan.operations.some((operation) => operation.scope === 'cache' && operation.kind === 'schedule-cache-purge'),
    'cache deletion must support a recovery-window purge stage'
  );
});

test('secure data deletion execution requires exact confirmation and reports progress', async () => {
  const plan = createSecureDataDeletionPlan({
    platform: 'desktop',
    scopes: ['cache', 'agent', 'wallet'],
    requestedAt,
    recoveryWindowHours: { cache: 6 }
  });
  const calls = [];
  const progress = [];
  const secureStorage = {
    async delete(keyRef) {
      calls.push({ adapter: 'secureStorage', keyRef });
      return { status: 'deleted' };
    }
  };
  const storage = {
    async deleteLocation(operation) {
      calls.push({ adapter: 'storage', kind: operation.kind, scope: operation.scope, target: operation.target });
      return { status: 'deleted' };
    },
    async schedulePurge(operation, recovery) {
      calls.push({
        adapter: 'storage',
        kind: operation.kind,
        scope: operation.scope,
        deadlineAt: recovery.deadlineAt
      });
      return { status: 'scheduled' };
    }
  };

  await assert.rejects(
    () =>
      executeSecureDataDeletionPlan(plan, {
        confirmationText: 'DELETE LOCAL DATA',
        secureStorage,
        storage
      }),
    /confirmation text/i
  );

  const result = await executeSecureDataDeletionPlan(plan, {
    confirmationText: plan.confirmation.requiredText,
    secureStorage,
    storage,
    onProgress(update) {
      progress.push(update);
    }
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.completedOperations, plan.operations.length);
  assert.equal(progress[0].status, 'started');
  assert.equal(progress.at(-1).status, 'completed');
  assert.ok(
    calls.some((call) => call.adapter === 'secureStorage' && call.keyRef === 'keychain:teleton.agentMemory.desktop.v1')
  );
  assert.ok(calls.some((call) => call.adapter === 'secureStorage' && /ton\.wallet/.test(call.keyRef)));
  assert.ok(calls.some((call) => call.kind === 'schedule-cache-purge' && call.deadlineAt === '2026-04-26T18:00:00.000Z'));
  assert.doesNotMatch(JSON.stringify(result), /mnemonic|private key|message body/i);
});

test('secure data deletion validates scopes and keeps unreviewed platform limitations release-blocking', () => {
  assert.throws(
    () =>
      createSecureDataDeletionPlan({
        platform: 'desktop',
        scopes: ['messages']
      }),
    /Unsupported secure deletion scope/
  );

  const plan = createSecureDataDeletionPlan({
    platform: 'web',
    scopes: ['wallet'],
    requestedAt
  });

  assert.equal(plan.humanReview.required, true);
  assert.equal(plan.humanReview.status, 'required');
  assert.equal(plan.humanReview.releaseBlocker, true);
  assert.match(plan.platformLimitations.join('\n'), /browser/i);
  assert.match(plan.confirmation.effects.join('\n'), /wallet provider/i);
});

test('secure data deletion foundation is documented with limitations and review gates', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8');
  const securityAudit = await readFile(new URL('../docs/security-audit.md', import.meta.url), 'utf8');
  const privacy = await readFile(new URL('../PRIVACY.md', import.meta.url), 'utf8');

  assert.match(readme, /secure data deletion/i);
  assert.match(architecture, /Secure Data Deletion/i);
  assert.match(architecture, /recovery window/i);
  assert.match(securityAudit, /filesystem limitations/i);
  assert.match(securityAudit, /human security review/i);
  assert.match(privacy, /delete local account data/i);
});
