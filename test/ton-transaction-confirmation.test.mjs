import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createMockTonTransactionConfirmationWorkflow,
  createTonTransactionConfirmationWorkflow,
  TON_TRANSACTION_HISTORY_STATUSES,
  validateTonTransactionReview
} from '../src/ton/transaction-confirmation.mjs';

test('TON transaction review exposes amount, recipient, network fee, provider, and risk indicators', () => {
  const validation = validateTonTransactionReview(
    {
      id: 'tx-1',
      amountNanoTon: 1500000000n,
      recipient: 'EQDreceiverAddress',
      networkFeeNanoTon: 25000000n,
      provider: 'tonkeeper',
      totalNanoTon: 1525000000n
    },
    {
      perTransactionLimitNanoTon: 1000000000n,
      highFeeNanoTon: 20000000n
    }
  );

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.review, {
    id: 'tx-1',
    amountNanoTon: 1500000000n,
    recipient: 'EQDreceiverAddress',
    networkFeeNanoTon: 25000000n,
    provider: 'tonkeeper',
    totalNanoTon: 1525000000n,
    memo: null,
    riskIndicators: [
      {
        code: 'amount_exceeds_limit',
        severity: 'high',
        message: 'TON transaction amount exceeds the configured per-transaction limit.'
      },
      {
        code: 'network_fee_high',
        severity: 'medium',
        message: 'TON transaction network fee is higher than the configured review threshold.'
      }
    ],
    limitState: {
      perTransactionLimitNanoTon: 1000000000n,
      remainingDailyLimitNanoTon: null,
      exceedsPerTransactionLimit: true,
      exceedsRemainingDailyLimit: false
    }
  });
});

test('TON transaction confirmation requires biometric or password approval before signing', async () => {
  const approvals = [];
  const workflow = createTonTransactionConfirmationWorkflow({
    approval: {
      async confirm(request) {
        approvals.push(request);
        return { approved: true, method: request.availableMethods[0], approvedAt: '2026-04-26T12:00:00.000Z' };
      }
    },
    now: () => '2026-04-26T11:59:00.000Z'
  });

  const review = workflow.createReview({
    id: 'tx-approval',
    amountNanoTon: 500000000n,
    recipient: 'EQDreceiverAddress',
    networkFeeNanoTon: 10000000n,
    provider: 'tonkeeper'
  });

  await assert.rejects(() => workflow.approveTransaction(review.id, { approvalMethods: [] }), /biometric or password/);

  const approval = await workflow.approveTransaction(review.id, {
    approvalMethods: ['biometric', 'password'],
    requestedBy: 'user:42'
  });

  assert.equal(approval.status, 'approved');
  assert.equal(approval.approval.method, 'biometric');
  assert.equal(approval.signed, false);
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].transaction.id, 'tx-approval');
  assert.deepEqual(approvals[0].availableMethods, ['biometric', 'password']);
});

test('TON transaction confirmation records approved, rejected, failed, and pending history entries', async () => {
  assert.deepEqual(TON_TRANSACTION_HISTORY_STATUSES, ['approved', 'rejected', 'failed', 'pending']);

  const workflow = createMockTonTransactionConfirmationWorkflow({
    approvalResults: [
      { approved: true, method: 'password', approvedAt: '2026-04-26T12:00:00.000Z' },
      { approved: false, method: 'password', reason: 'User rejected.', approvedAt: '2026-04-26T12:01:00.000Z' }
    ],
    now: () => '2026-04-26T12:00:00.000Z'
  });

  const approvedReview = workflow.createReview({
    id: 'tx-approved',
    amountNanoTon: 1n,
    recipient: 'EQDreceiverAddress',
    networkFeeNanoTon: 1n,
    provider: 'tonkeeper'
  });
  const rejectedReview = workflow.createReview({
    id: 'tx-rejected',
    amountNanoTon: 2n,
    recipient: 'EQDreceiverAddress',
    networkFeeNanoTon: 1n,
    provider: 'tonkeeper'
  });
  const pendingReview = workflow.createReview({
    id: 'tx-pending',
    amountNanoTon: 3n,
    recipient: 'EQDreceiverAddress',
    networkFeeNanoTon: 1n,
    provider: 'tonkeeper'
  });

  await workflow.approveTransaction(approvedReview.id, { approvalMethods: ['password'] });
  await workflow.approveTransaction(rejectedReview.id, { approvalMethods: ['password'] });
  workflow.markTransactionFailed('tx-approved', 'Provider signing failed.');

  assert.deepEqual(
    workflow.listHistory().map((entry) => ({ id: entry.transaction.id, status: entry.status })),
    [
      { id: 'tx-approved', status: 'failed' },
      { id: 'tx-rejected', status: 'rejected' },
      { id: 'tx-pending', status: 'pending' }
    ]
  );
  assert.match(workflow.listHistory().at(0).reason, /Provider signing failed/);
  assert.equal(workflow.listHistory({ status: 'approved' }).at(0).transaction.id, 'tx-approved');
  assert.equal(workflow.getApprovalRequests().length, 2);
});

test('TON transaction confirmation validates provider boundaries before approval hooks', async () => {
  let called = false;
  const workflow = createTonTransactionConfirmationWorkflow({
    approval: {
      async confirm() {
        called = true;
        return { approved: true, method: 'password' };
      }
    }
  });

  assert.throws(
    () =>
      workflow.createReview({
        id: 'tx-invalid',
        amountNanoTon: 0n,
        recipient: '',
        networkFeeNanoTon: -1n,
        provider: ''
      }),
    /amountNanoTon must be a positive/
  );

  await assert.rejects(() => workflow.approveTransaction('missing', { approvalMethods: ['password'] }), /Unknown TON transaction review/);
  assert.equal(called, false);
});
