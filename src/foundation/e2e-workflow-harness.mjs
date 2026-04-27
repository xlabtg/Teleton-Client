import { createAgentActionHistoryStore } from './agent-action-history.mjs';
import { createAgentActionNotificationDispatcher } from './agent-action-notifications.mjs';
import { createAgentIpcEnvelope } from './agent-ipc-bridge.mjs';
import { isSecureReference } from './proxy-settings.mjs';
import { createMockTdlibClientAdapter, createTdlibClientAdapter } from '../tdlib/client-adapter.mjs';
import { createMockTonTransactionConfirmationWorkflow } from '../ton/transaction-confirmation.mjs';
import { createMockTonWalletAdapter, createTonWalletAdapter } from '../ton/wallet-adapter.mjs';

export const TELETON_E2E_ENVIRONMENT = Object.freeze([
  Object.freeze({
    name: 'TELETON_E2E_LIVE_ENABLED',
    requiredForLive: true,
    secret: false,
    description: 'Set to true only in protected CI or a trusted local shell to run live end-to-end workflow checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TDLIB_API_ID_REF',
    requiredForLive: true,
    secret: true,
    description: 'Secure reference for the Telegram API id used by protected TDLib authentication checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TDLIB_API_HASH_REF',
    requiredForLive: true,
    secret: true,
    description: 'Secure reference for the Telegram API hash used by protected TDLib authentication checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TDLIB_PHONE_NUMBER_REF',
    requiredForLive: true,
    secret: true,
    description: 'Secure reference for the Telegram phone number used by protected TDLib authentication checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_AGENT_TRANSPORT_REF',
    requiredForLive: true,
    secret: true,
    description: 'Secure reference for the protected Teleton Agent transport used by live agent reply checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TON_WALLET_ADDRESS',
    requiredForLive: true,
    secret: false,
    description: 'Public TON test wallet address used for protected transaction draft and confirmation checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TON_PROVIDER_REF',
    requiredForLive: true,
    secret: true,
    description: 'Secure wallet provider reference used by protected TON transaction checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TON_RECIPIENT_ADDRESS',
    requiredForLive: true,
    secret: false,
    description: 'Public TON recipient address used for protected transaction draft checks.'
  }),
  Object.freeze({
    name: 'TELETON_E2E_TON_TRANSFER_NANOTON',
    requiredForLive: false,
    secret: false,
    description: 'Optional positive integer transfer amount for TON draft checks.'
  })
]);

const REQUIRED_LIVE_ENVIRONMENT = TELETON_E2E_ENVIRONMENT.filter((entry) => entry.requiredForLive).map(
  (entry) => entry.name
);

const LIVE_SECURE_REFERENCE_ENVIRONMENT = Object.freeze([
  'TELETON_E2E_TDLIB_API_ID_REF',
  'TELETON_E2E_TDLIB_API_HASH_REF',
  'TELETON_E2E_TDLIB_PHONE_NUMBER_REF',
  'TELETON_E2E_AGENT_TRANSPORT_REF',
  'TELETON_E2E_TON_PROVIDER_REF'
]);

const PRIVATE_ARTIFACT_FIELDS = new Set([
  'apiHashRef',
  'apiIdRef',
  'body',
  'botTokenRef',
  'chatName',
  'chatTitle',
  'content',
  'context',
  'from',
  'memo',
  'message',
  'messageText',
  'mnemonic',
  'password',
  'passwordRef',
  'phoneNumberRef',
  'privateKey',
  'prompt',
  'providerRef',
  'recipient',
  'recipientAddress',
  'recipientName',
  'secret',
  'secretRef',
  'seedPhrase',
  'senderName',
  'secureStorageRef',
  'text',
  'to',
  'token',
  'tokenRef',
  'transportRef',
  'walletProviderRef'
]);

const SECURE_REFERENCE_PATTERN = /\b(?:env|keychain|keystore|secret|wallet):[A-Za-z0-9_.:/-]+/g;

const DEFAULT_MOCK_FIXTURE = Object.freeze({
  auth: Object.freeze({
    apiIdRef: 'env:TELETON_E2E_MOCK_API_ID',
    apiHashRef: 'keychain:teleton-e2e-mock-api-hash',
    phoneNumberRef: 'keystore:teleton-e2e-mock-phone'
  }),
  userId: 'mock-e2e-user',
  chats: Object.freeze([Object.freeze({ id: 'chat-e2e-1', title: 'Mock E2E Chat', unreadCount: 1 })]),
  userMessageText: 'mock user message body',
  agentReplyText: 'mock agent reply body',
  ton: Object.freeze({
    walletAddress: 'EQDmockE2eWalletAddress',
    recipientAddress: 'EQDmockE2eRecipientAddress',
    walletProviderRef: 'wallet:mock-ton-e2e-provider',
    balanceNanoTon: 5000000000n,
    transferNanoTon: 100000000n,
    networkFeeNanoTon: 1000000n
  })
});

export class TeletonE2eWorkflowError extends Error {
  constructor(message, code, details = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'TeletonE2eWorkflowError';
    this.code = code;
    this.step = details.step ?? null;
    this.artifacts = details.artifacts ?? { logs: [], screenshots: [] };
    this.details = details.details ?? [];
  }
}

function enabled(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function missingEnvironment(env) {
  return REQUIRED_LIVE_ENVIRONMENT.filter((name) => !String(env[name] ?? '').trim());
}

function validateLiveSecureReferences(env) {
  const invalid = LIVE_SECURE_REFERENCE_ENVIRONMENT.filter((name) => !isSecureReference(env[name]));

  if (invalid.length > 0) {
    throw new TeletonE2eWorkflowError(
      `Live E2E environment values must be secure references: ${invalid.join(', ')}.`,
      'invalid_live_environment',
      { details: invalid }
    );
  }
}

function parseTransferNanoTon(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  try {
    const parsed = BigInt(value);
    if (parsed > 0n) {
      return parsed;
    }
  } catch {
    // Fall through to the explicit validation error below.
  }

  throw new TeletonE2eWorkflowError(
    'TELETON_E2E_TON_TRANSFER_NANOTON must be a positive integer when set.',
    'invalid_transfer_amount'
  );
}

function redactText(value) {
  return String(value ?? '').replace(SECURE_REFERENCE_PATTERN, '[secure-ref]');
}

function sanitizeError(error) {
  const name = String(error?.name ?? 'Error');
  const code = error?.code === undefined ? null : String(error.code);

  return {
    name,
    code,
    summary:
      code === null
        ? `${name} occurred during the E2E workflow.`
        : `${name} occurred during the E2E workflow (${code}).`
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeArtifactValue(value, fieldName = '') {
  if (PRIVATE_ARTIFACT_FIELDS.has(fieldName)) {
    return '[redacted]';
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'string') {
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeArtifactValue(item));
  }

  if (isPlainObject(value)) {
    const sanitized = {};

    for (const [key, fieldValue] of Object.entries(value)) {
      sanitized[key] = sanitizeArtifactValue(fieldValue, key);
    }

    return sanitized;
  }

  return value;
}

function clone(value) {
  return structuredClone(value);
}

function createArtifactRecorder({ captureScreenshot, mode }) {
  const logs = [];
  const screenshots = [];

  function log(entry) {
    logs.push(Object.freeze(sanitizeArtifactValue(entry)));
  }

  function snapshot() {
    return Object.freeze({
      logs: Object.freeze(logs.map(clone)),
      screenshots: Object.freeze(screenshots.map(clone))
    });
  }

  async function captureFailure(step, error) {
    if (typeof captureScreenshot !== 'function') {
      return null;
    }

    try {
      const captured = await captureScreenshot({
        step,
        mode,
        error: sanitizeError(error)
      });

      if (!captured) {
        return null;
      }

      const screenshot = Object.freeze({
        step,
        path: redactText(captured.path ?? captured.file ?? ''),
        label: redactText(captured.label ?? `${step} failure`)
      });
      screenshots.push(screenshot);
      return screenshot;
    } catch (screenshotError) {
      log({
        level: 'warning',
        step,
        status: 'screenshot_failed',
        error: sanitizeError(screenshotError)
      });
      return null;
    }
  }

  return Object.freeze({
    log,
    snapshot,
    captureFailure
  });
}

async function runStep({ key, label, recorder, mode }, callback) {
  recorder.log({ level: 'info', step: key, status: 'started' });

  try {
    const result = await callback();
    recorder.log({ level: 'info', step: key, status: 'passed' });
    return result;
  } catch (error) {
    recorder.log({ level: 'error', step: key, status: 'failed', error: sanitizeError(error) });
    await recorder.captureFailure(key, error);

    throw new TeletonE2eWorkflowError(`E2E ${label} failed in ${mode} mode.`, 'e2e_workflow_failed', {
      step: key,
      artifacts: recorder.snapshot(),
      cause: error
    });
  }
}

function mergeFixture(input = {}) {
  const ton = {
    ...DEFAULT_MOCK_FIXTURE.ton,
    ...(input.ton ?? {})
  };

  return {
    ...DEFAULT_MOCK_FIXTURE,
    ...input,
    auth: {
      ...DEFAULT_MOCK_FIXTURE.auth,
      ...(input.auth ?? {})
    },
    chats: input.chats ?? DEFAULT_MOCK_FIXTURE.chats,
    ton
  };
}

function createTdlibAdapterForMode(mode, env, options, fixture) {
  if (options.tdlibAdapter) {
    return options.tdlibAdapter;
  }

  if (mode === 'live') {
    if (!options.tdlibImplementation) {
      throw new TeletonE2eWorkflowError(
        'Live E2E checks require tdlibImplementation or tdlibAdapter to be supplied by the protected platform shell.',
        'missing_live_tdlib_adapter'
      );
    }

    return createTdlibClientAdapter(options.tdlibImplementation, { platform: options.platform ?? 'desktop' });
  }

  return createMockTdlibClientAdapter({
    platform: options.platform ?? 'desktop',
    userId: fixture.userId,
    chats: fixture.chats
  });
}

function createTonWalletAdapterForMode(mode, env, options, fixture) {
  if (options.tonWalletAdapter) {
    return options.tonWalletAdapter;
  }

  if (mode === 'live') {
    if (!options.tonWalletImplementation) {
      throw new TeletonE2eWorkflowError(
        'Live E2E checks require tonWalletImplementation or tonWalletAdapter to be supplied by the protected platform shell.',
        'missing_live_ton_wallet_adapter'
      );
    }

    return createTonWalletAdapter(options.tonWalletImplementation, {
      id: 'e2e-live-wallet',
      label: 'E2E live wallet',
      address: env.TELETON_E2E_TON_WALLET_ADDRESS,
      walletProviderRef: env.TELETON_E2E_TON_PROVIDER_REF,
      network: options.tonNetwork ?? 'testnet'
    });
  }

  return createMockTonWalletAdapter({
    id: 'e2e-mock-wallet',
    label: 'E2E mock wallet',
    address: fixture.ton.walletAddress,
    walletProviderRef: fixture.ton.walletProviderRef,
    balanceNanoTon: fixture.ton.balanceNanoTon,
    network: options.tonNetwork ?? 'testnet'
  });
}

function authenticationRequestForMode(mode, env, fixture) {
  if (mode === 'live') {
    return {
      apiIdRef: env.TELETON_E2E_TDLIB_API_ID_REF,
      apiHashRef: env.TELETON_E2E_TDLIB_API_HASH_REF,
      phoneNumberRef: env.TELETON_E2E_TDLIB_PHONE_NUMBER_REF
    };
  }

  return fixture.auth;
}

function recipientForMode(mode, env, fixture) {
  return mode === 'live' ? env.TELETON_E2E_TON_RECIPIENT_ADDRESS : fixture.ton.recipientAddress;
}

async function runAuthAndMessagingStep({ tdlibAdapter, mode, env, fixture, recorder, updates }) {
  recorder.log({ level: 'info', step: 'auth-and-messaging', operation: 'authenticate', status: 'started' });
  const session = await tdlibAdapter.authenticate(authenticationRequestForMode(mode, env, fixture));
  recorder.log({
    level: 'info',
    step: 'auth-and-messaging',
    operation: 'authenticate',
    status: 'passed',
    authorizationState: session.authorizationState
  });

  recorder.log({ level: 'info', step: 'auth-and-messaging', operation: 'getChatList', status: 'started' });
  const chatList = await tdlibAdapter.getChatList({ limit: 1 });
  recorder.log({
    level: 'info',
    step: 'auth-and-messaging',
    operation: 'getChatList',
    status: 'passed',
    chatCount: chatList.chats.length
  });

  const primaryChat = chatList.chats[0];
  if (!primaryChat) {
    throw new TeletonE2eWorkflowError('E2E auth and messaging flow requires at least one chat.', 'missing_e2e_chat');
  }

  recorder.log({ level: 'info', step: 'auth-and-messaging', operation: 'sendMessage', status: 'started' });
  const sentMessage = await tdlibAdapter.sendMessage({
    chatId: primaryChat.id,
    text: fixture.userMessageText
  });
  recorder.log({
    level: 'info',
    step: 'auth-and-messaging',
    operation: 'sendMessage',
    status: 'passed',
    sentMessageId: sentMessage.id,
    sentMessageStatus: sentMessage.status
  });

  return Object.freeze({
    session,
    primaryChat,
    sentMessage,
    updates
  });
}

async function defaultAgentApproval({ now }) {
  return {
    approved: true,
    method: 'manual',
    approvedAt: now()
  };
}

async function runAgentReplyStep({ tdlibAdapter, fixture, recorder, now, authMessaging }) {
  const uiNotifications = [];
  const platformNotifications = [];
  const history = createAgentActionHistoryStore({ now });
  const notifications = createAgentActionNotificationDispatcher({
    settings: { notifications: { enabled: true } },
    notifyUi: (notification) => uiNotifications.push(notification),
    notifyPlatform: (notification) => platformNotifications.push(notification)
  });

  recorder.log({ level: 'info', step: 'agent-reply', operation: 'proposal', status: 'started' });
  const proposal = createAgentIpcEnvelope({
    id: 'agent.e2e.reply.proposal',
    kind: 'event',
    source: 'agent',
    target: 'ui',
    eventType: 'agent.action.proposed',
    timestamp: now(),
    payload: {
      action: 'sendMessage',
      actionLabel: 'Send reply',
      chatId: authMessaging.primaryChat.id,
      replyToMessageId: authMessaging.sentMessage.id,
      messageText: fixture.agentReplyText,
      requiresApproval: true
    }
  });
  const proposedRecord = history.previewAction(proposal);
  const approvalNotification = notifications.handleAgentEvent(proposal);
  recorder.log({
    level: 'info',
    step: 'agent-reply',
    operation: 'proposal',
    status: 'passed',
    requiresConfirmation: proposal.requiresConfirmation,
    notificationType: approvalNotification?.type ?? null
  });

  recorder.log({ level: 'info', step: 'agent-reply', operation: 'confirmation', status: 'started' });
  const approval = await defaultAgentApproval({ now });
  if (approval.approved !== true) {
    throw new TeletonE2eWorkflowError('E2E agent reply proposal was not approved.', 'agent_reply_rejected');
  }
  recorder.log({
    level: 'info',
    step: 'agent-reply',
    operation: 'confirmation',
    status: 'passed',
    method: approval.method
  });

  recorder.log({ level: 'info', step: 'agent-reply', operation: 'sendMessage', status: 'started' });
  const sentReply = await tdlibAdapter.sendMessage({
    chatId: authMessaging.primaryChat.id,
    text: fixture.agentReplyText,
    replyToMessageId: authMessaging.sentMessage.id
  });
  const completedRecord = history.recordAction({
    id: 'agent.e2e.reply.completed',
    action: proposal.payload.action,
    actionLabel: proposal.payload.actionLabel,
    status: 'completed',
    actor: { id: 'agent', type: 'agent' },
    timestamp: proposal.timestamp,
    completedAt: approval.approvedAt,
    payload: proposal.payload
  });
  recorder.log({
    level: 'info',
    step: 'agent-reply',
    operation: 'sendMessage',
    status: 'passed',
    sentMessageId: sentReply.id,
    sentMessageStatus: sentReply.status
  });

  return Object.freeze({
    proposal,
    proposedRecord,
    completedRecord,
    approval,
    sentReply,
    uiNotifications,
    platformNotifications
  });
}

async function runTonTransactionStep({ tonWalletAdapter, mode, env, fixture, recorder, now, transferNanoTon }) {
  recorder.log({ level: 'info', step: 'ton-transaction', operation: 'prepareTransfer', status: 'started' });
  const transferDraft = await tonWalletAdapter.prepareTransfer({
    to: recipientForMode(mode, env, fixture),
    amountNanoTon: transferNanoTon,
    memo: 'teleton e2e transaction draft',
    confirmed: true
  });
  recorder.log({
    level: 'info',
    step: 'ton-transaction',
    operation: 'prepareTransfer',
    status: 'passed',
    draftId: transferDraft.id,
    draftStatus: transferDraft.status
  });

  recorder.log({ level: 'info', step: 'ton-transaction', operation: 'getTransferStatus', status: 'started' });
  const transferStatus = await tonWalletAdapter.getTransferStatus(transferDraft.id);
  recorder.log({
    level: 'info',
    step: 'ton-transaction',
    operation: 'getTransferStatus',
    status: 'passed',
    transferStatus: transferStatus.status
  });

  recorder.log({ level: 'info', step: 'ton-transaction', operation: 'confirmTransaction', status: 'started' });
  const confirmationWorkflow = createMockTonTransactionConfirmationWorkflow({
    approvalResults: [{ approved: true, method: 'password', approvedAt: now() }],
    now
  });
  const review = confirmationWorkflow.createReview({
    id: transferDraft.id,
    amountNanoTon: transferDraft.amountNanoTon,
    recipient: transferDraft.to,
    networkFeeNanoTon: fixture.ton.networkFeeNanoTon,
    provider: mode === 'live' ? 'protected-e2e-provider' : 'mock-e2e-provider',
    wallet: transferDraft.wallet ?? {
      id: 'e2e-wallet',
      label: 'E2E wallet',
      address: transferDraft.from,
      network: transferDraft.network
    },
    memo: transferDraft.memo
  });
  const confirmation = await confirmationWorkflow.approveTransaction(review.id, {
    approvalMethods: ['password'],
    requestedBy: 'e2e-harness'
  });
  recorder.log({
    level: 'info',
    step: 'ton-transaction',
    operation: 'confirmTransaction',
    status: 'passed',
    confirmationStatus: confirmation.status,
    signed: confirmation.signed
  });

  return Object.freeze({
    transferDraft,
    transferStatus,
    review,
    confirmation
  });
}

function summarizeAuth(authMessaging) {
  return Object.freeze({
    authorizationState: authMessaging.session.authorizationState,
    userId: authMessaging.session.userId ?? null
  });
}

function summarizeMessaging(authMessaging, updates) {
  return Object.freeze({
    chatCount: authMessaging.primaryChat ? 1 : 0,
    sentMessageId: authMessaging.sentMessage.id,
    sentMessageStatus: authMessaging.sentMessage.status,
    updateTypes: Object.freeze(updates.map((update) => update.type))
  });
}

function summarizeAgentReply(agentReply) {
  return Object.freeze({
    proposalId: agentReply.proposal.id,
    proposalRequiresConfirmation: agentReply.proposal.requiresConfirmation,
    notificationType: agentReply.uiNotifications.at(0)?.type ?? null,
    confirmationStatus: agentReply.approval.approved ? 'approved' : 'rejected',
    sentMessageId: agentReply.sentReply.id,
    sentMessageStatus: agentReply.sentReply.status,
    historyStatuses: Object.freeze([agentReply.proposedRecord.status, agentReply.completedRecord.status])
  });
}

function summarizeTonTransaction(tonTransaction) {
  return Object.freeze({
    draftId: tonTransaction.transferDraft.id,
    draftStatus: tonTransaction.transferDraft.status,
    transferStatus: tonTransaction.transferStatus.status,
    confirmationStatus: tonTransaction.confirmation.status,
    signed: tonTransaction.confirmation.signed
  });
}

export function createTeletonE2eWorkflowHarness(options = {}) {
  const env = options.env ?? process.env;
  const liveEnabled = enabled(env.TELETON_E2E_LIVE_ENABLED);
  const missing = liveEnabled ? missingEnvironment(env) : ['TELETON_E2E_LIVE_ENABLED'];

  if (liveEnabled && missing.length > 0) {
    throw new TeletonE2eWorkflowError(
      `Live E2E checks are enabled but missing required environment variables: ${missing.join(', ')}.`,
      'missing_live_environment',
      { details: missing }
    );
  }

  if (liveEnabled) {
    validateLiveSecureReferences(env);
  }

  const mode = liveEnabled ? 'live' : 'mock';
  const fixture = mergeFixture(options.mockFixture);
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const transferNanoTon = parseTransferNanoTon(env.TELETON_E2E_TON_TRANSFER_NANOTON, fixture.ton.transferNanoTon);

  function createRecorder() {
    return createArtifactRecorder({
      captureScreenshot: options.captureScreenshot,
      mode
    });
  }

  async function runCoreWorkflows() {
    const recorder = createRecorder();
    const tdlibAdapter = createTdlibAdapterForMode(mode, env, options, fixture);
    const tonWalletAdapter = createTonWalletAdapterForMode(mode, env, options, fixture);
    const updates = [];
    const unsubscribe = tdlibAdapter.subscribeUpdates((update) => updates.push(update), {
      types: ['authorizationState', 'message']
    });

    try {
      const authMessaging = await runStep(
        { key: 'auth-and-messaging', label: 'auth and messaging', recorder, mode },
        () => runAuthAndMessagingStep({ tdlibAdapter, mode, env, fixture, recorder, updates })
      );
      const agentReply = await runStep(
        { key: 'agent-reply', label: 'agent reply confirmation', recorder, mode },
        () => runAgentReplyStep({ tdlibAdapter, fixture, recorder, now, authMessaging })
      );
      const tonTransaction = await runStep(
        { key: 'ton-transaction', label: 'TON transaction confirmation', recorder, mode },
        () => runTonTransactionStep({ tonWalletAdapter, mode, env, fixture, recorder, now, transferNanoTon })
      );

      return Object.freeze({
        mode,
        liveEnabled,
        missingEnvironment: Object.freeze([...missing]),
        auth: summarizeAuth(authMessaging),
        messaging: summarizeMessaging(authMessaging, updates),
        agentReply: summarizeAgentReply(agentReply),
        tonTransaction: summarizeTonTransaction(tonTransaction),
        artifacts: recorder.snapshot()
      });
    } finally {
      unsubscribe();
    }
  }

  return Object.freeze({
    mode,
    liveEnabled,
    missingEnvironment: Object.freeze([...missing]),
    environmentContract: TELETON_E2E_ENVIRONMENT,
    async runAuthAndMessagingFlow() {
      const recorder = createRecorder();
      const tdlibAdapter = createTdlibAdapterForMode(mode, env, options, fixture);
      const updates = [];
      const unsubscribe = tdlibAdapter.subscribeUpdates((update) => updates.push(update), {
        types: ['authorizationState', 'message']
      });

      try {
        const authMessaging = await runStep(
          { key: 'auth-and-messaging', label: 'auth and messaging', recorder, mode },
          () => runAuthAndMessagingStep({ tdlibAdapter, mode, env, fixture, recorder, updates })
        );

        return Object.freeze({
          mode,
          liveEnabled,
          missingEnvironment: Object.freeze([...missing]),
          auth: summarizeAuth(authMessaging),
          messaging: summarizeMessaging(authMessaging, updates),
          artifacts: recorder.snapshot()
        });
      } finally {
        unsubscribe();
      }
    },
    async runAgentReplyFlow() {
      const recorder = createRecorder();
      const tdlibAdapter = createTdlibAdapterForMode(mode, env, options, fixture);
      const updates = [];
      const unsubscribe = tdlibAdapter.subscribeUpdates((update) => updates.push(update), {
        types: ['authorizationState', 'message']
      });

      try {
        const authMessaging = await runStep(
          { key: 'auth-and-messaging', label: 'auth and messaging', recorder, mode },
          () => runAuthAndMessagingStep({ tdlibAdapter, mode, env, fixture, recorder, updates })
        );
        const agentReply = await runStep(
          { key: 'agent-reply', label: 'agent reply confirmation', recorder, mode },
          () => runAgentReplyStep({ tdlibAdapter, fixture, recorder, now, authMessaging })
        );

        return Object.freeze({
          mode,
          liveEnabled,
          missingEnvironment: Object.freeze([...missing]),
          agentReply: summarizeAgentReply(agentReply),
          artifacts: recorder.snapshot()
        });
      } finally {
        unsubscribe();
      }
    },
    async runTonTransactionFlow() {
      const recorder = createRecorder();
      const tonWalletAdapter = createTonWalletAdapterForMode(mode, env, options, fixture);
      const tonTransaction = await runStep(
        { key: 'ton-transaction', label: 'TON transaction confirmation', recorder, mode },
        () => runTonTransactionStep({ tonWalletAdapter, mode, env, fixture, recorder, now, transferNanoTon })
      );

      return Object.freeze({
        mode,
        liveEnabled,
        missingEnvironment: Object.freeze([...missing]),
        tonTransaction: summarizeTonTransaction(tonTransaction),
        artifacts: recorder.snapshot()
      });
    },
    runCoreWorkflows
  });
}
