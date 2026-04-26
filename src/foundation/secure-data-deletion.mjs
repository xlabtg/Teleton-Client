export const SECURE_DATA_DELETION_SCHEMA_VERSION = 1;
export const SECURE_DATA_DELETION_PLAN_KIND = 'teleton.secureDataDeletion.plan';
export const SECURE_DATA_DELETION_RESULT_KIND = 'teleton.secureDataDeletion.result';
export const SECURE_DATA_DELETION_SCOPES = Object.freeze(['account', 'cache', 'agent', 'wallet']);
export const SECURE_DATA_DELETION_PLATFORMS = Object.freeze(['android', 'ios', 'desktop', 'web']);

const SCOPE_DEFINITIONS = deepFreeze({
  account: {
    confirmationLabel: 'ACCOUNT',
    label: 'local account data',
    recoveryEligible: false,
    effect:
      'Account local data deletion removes TDLib session state, message database snapshots, device-only authentication caches, and secure references for this installation. It does not delete the Telegram account or remote messages.'
  },
  cache: {
    confirmationLabel: 'CACHE',
    label: 'cached media and local cache data',
    recoveryEligible: true,
    effect:
      'Cache deletion removes cached media, previews, temporary uploads, offline shell cache entries, and derived local thumbnails. Cache entries are hidden during any recovery window and purged after the deadline.'
  },
  agent: {
    confirmationLabel: 'AGENT',
    label: 'Teleton Agent local memory',
    recoveryEligible: false,
    effect:
      'Agent memory deletion destroys the local agent memory encryption key reference and deletes encrypted memory snapshots, vector indexes, action scratch state, and local runtime cache data.'
  },
  wallet: {
    confirmationLabel: 'WALLET',
    label: 'TON wallet local state',
    recoveryEligible: false,
    effect:
      'Wallet local state deletion removes local wallet metadata, transaction caches, pending drafts, WalletConnect sessions, and wallet provider secure references from this device. It does not delete public blockchain history or external wallet provider accounts.'
  }
});

const PLATFORM_LOCATION_CATALOG = deepFreeze({
  android: {
    account: {
      storage: 'Android app-private files, databases, and Keystore aliases',
      targets: [
        'context.filesDir/tdlib/accounts',
        'context.getDatabasePath("tdlib-message-database")',
        'context.noBackupFilesDir/tdlib/session'
      ],
      secureRefs: ['keystore:teleton.tdlib.session.android', 'keystore:teleton.messageDatabase.android.v1']
    },
    cache: {
      storage: 'Android cacheDir, code_cache, and app-private media caches',
      targets: ['context.cacheDir/media', 'context.cacheDir/previews', 'context.codeCacheDir/teleton'],
      secureRefs: []
    },
    agent: {
      storage: 'Android app-private agent files and Keystore aliases',
      targets: ['context.filesDir/agent/memory', 'context.filesDir/agent/vector-indexes', 'context.cacheDir/agent'],
      secureRefs: ['keystore:teleton.agentMemory.android.v1']
    },
    wallet: {
      storage: 'Android app-private TON files, databases, and wallet-provider references',
      targets: ['context.filesDir/ton/wallet-state', 'context.getDatabasePath("ton-history")', 'context.cacheDir/ton'],
      secureRefs: ['keystore:teleton.ton.wallet.android', 'keystore:teleton.ton.wallet-provider.android']
    }
  },
  ios: {
    account: {
      storage: 'iOS Application Support, Library caches, and Keychain Services',
      targets: [
        'Application Support/TDLib/accounts',
        'Application Support/TDLib/message-database',
        'Library/Preferences/dev.teleton.client.account.plist'
      ],
      secureRefs: ['keychain:dev.teleton.client.tdlib.session', 'keychain:teleton.messageDatabase.ios.v1']
    },
    cache: {
      storage: 'iOS Library/Caches and tmp directories',
      targets: ['Library/Caches/Teleton/Media', 'Library/Caches/Teleton/Previews', 'tmp/Teleton'],
      secureRefs: []
    },
    agent: {
      storage: 'iOS Application Support agent files and Keychain Services',
      targets: [
        'Application Support/TeletonAgent/memory',
        'Application Support/TeletonAgent/vector-indexes',
        'Library/Caches/TeletonAgent'
      ],
      secureRefs: ['keychain:teleton.agentMemory.ios.v1']
    },
    wallet: {
      storage: 'iOS Application Support TON files and Keychain Services',
      targets: ['Application Support/TON/wallet-state', 'Application Support/TON/transaction-history', 'Library/Caches/TON'],
      secureRefs: ['keychain:dev.teleton.client.ton.wallet', 'keychain:dev.teleton.client.ton.wallet-provider']
    }
  },
  desktop: {
    account: {
      storage: 'Electron userData, local databases, and OS credential vault entries',
      targets: ['userData/tdlib/accounts', 'userData/databases/message-database', 'userData/session/tdlib'],
      secureRefs: ['keychain:teleton.tdlib.session.desktop', 'keychain:teleton.messageDatabase.desktop.v1']
    },
    cache: {
      storage: 'Electron userData cache directories and local media cache',
      targets: ['userData/Cache/media', 'userData/Cache/previews', 'userData/GPUCache'],
      secureRefs: []
    },
    agent: {
      storage: 'Electron userData agent files and OS credential vault entries',
      targets: ['userData/agent/memory', 'userData/agent/vector-indexes', 'userData/agent/runtime-cache'],
      secureRefs: ['keychain:teleton.agentMemory.desktop.v1']
    },
    wallet: {
      storage: 'Electron userData TON files and OS credential vault entries',
      targets: ['userData/ton/wallet-state', 'userData/ton/transaction-history', 'userData/ton/pending-drafts'],
      secureRefs: ['keychain:teleton.ton.wallet.desktop', 'keychain:teleton.ton.wallet-provider.desktop']
    }
  },
  web: {
    account: {
      storage: 'Browser IndexedDB, CacheStorage metadata, and WebCrypto-backed key references',
      targets: ['IndexedDB:teleton-tdlib-session', 'IndexedDB:teleton-message-database', 'StorageManager persisted account bucket'],
      secureRefs: ['webcrypto:teleton.tdlib.session.web', 'webcrypto:teleton.messageDatabase.web.v1']
    },
    cache: {
      storage: 'Browser CacheStorage, IndexedDB media metadata, and service worker cache entries',
      targets: ['CacheStorage:teleton-shell-*', 'IndexedDB:teleton-media-cache', 'StorageManager temporary cache bucket'],
      secureRefs: []
    },
    agent: {
      storage: 'Browser IndexedDB agent stores and WebCrypto-backed key references',
      targets: ['IndexedDB:teleton-agent-memory', 'IndexedDB:teleton-agent-vector-indexes', 'CacheStorage:teleton-agent-runtime'],
      secureRefs: ['webcrypto:teleton.agentMemory.web.v1']
    },
    wallet: {
      storage: 'Browser IndexedDB wallet metadata, WalletConnect sessions, and WebCrypto-backed key references',
      targets: ['IndexedDB:teleton-wallet-state', 'IndexedDB:teleton-walletconnect-sessions', 'IndexedDB:teleton-transaction-history'],
      secureRefs: ['webcrypto:teleton.ton.wallet.web', 'webcrypto:teleton.ton.wallet-provider.web']
    }
  }
});

const PLATFORM_LIMITATIONS = deepFreeze({
  android: [
    'Android secure deletion cannot guarantee physical block erasure on flash storage, journaling filesystems, wear-leveling, OEM backup tools, or system snapshots.',
    'Android wrappers must destroy app Keystore aliases before removing encrypted files and must exclude sensitive stores from Auto Backup unless a human security review approves the backup behavior.'
  ],
  ios: [
    'iOS secure deletion cannot guarantee removal from APFS snapshots, device backups, crash diagnostics, Spotlight-derived metadata, or filesystem journal remnants.',
    'iOS wrappers must delete device-local Keychain items and app-container files, then request human security review for backup, iCloud, and app group storage behavior.'
  ],
  desktop: [
    'Desktop secure deletion cannot guarantee removal from SSD wear-leveling, journaling filesystems, search indexes, file history, Time Machine, Volume Shadow Copy, or external backups.',
    'Desktop wrappers must delete OS credential vault entries before app files and document per-OS limitations for macOS, Windows, and Linux before release.'
  ],
  web: [
    'Web secure deletion is limited by browser storage engines; IndexedDB, CacheStorage, service worker caches, browser backups, and storage compaction are controlled by the browser.',
    'Web wrappers must revoke WebCrypto key references where possible, clear CacheStorage and IndexedDB stores, and document that browser-level remnants can persist until the browser compacts or clears storage.'
  ]
});

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTimestamp(value, label = 'Secure deletion timestamp') {
  const timestamp = value === undefined ? new Date().toISOString() : String(value).trim();
  const date = new Date(timestamp);

  if (!timestamp || Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }

  return date.toISOString();
}

function normalizePlatform(value) {
  const platform = String(value ?? '').trim().toLowerCase();

  if (!SECURE_DATA_DELETION_PLATFORMS.includes(platform)) {
    throw new Error(`Unsupported secure deletion platform: ${value}`);
  }

  return platform;
}

function normalizeScope(value) {
  const scope = String(value ?? '').trim().toLowerCase();

  if (!SECURE_DATA_DELETION_SCOPES.includes(scope)) {
    throw new Error(`Unsupported secure deletion scope: ${value}`);
  }

  return scope;
}

function normalizeScopes(input) {
  const requested = Array.isArray(input) && input.length > 0 ? input : SECURE_DATA_DELETION_SCOPES;
  const scopes = [];
  const seen = new Set();

  for (const value of requested) {
    const scope = normalizeScope(value);
    if (!seen.has(scope)) {
      scopes.push(scope);
      seen.add(scope);
    }
  }

  return scopes;
}

function formatList(values) {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} AND ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, AND ${values.at(-1)}`;
}

function confirmationTextFor(scopes) {
  return `DELETE LOCAL ${formatList(scopes.map((scope) => SCOPE_DEFINITIONS[scope].confirmationLabel))} DATA`;
}

function addHours(timestamp, hours) {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1000).toISOString();
}

function normalizeRecoveryHours(input, scope) {
  const value = isPlainObject(input) ? input[scope] : scope === 'cache' ? input : undefined;

  if (value === undefined || value === null) {
    return 0;
  }

  const hours = Number(value);

  if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
    throw new Error('Secure deletion recovery window must be an integer between 0 and 168 hours.');
  }

  if (hours > 0 && SCOPE_DEFINITIONS[scope].recoveryEligible !== true) {
    throw new Error(`Secure deletion recovery window is not supported for ${scope} scope.`);
  }

  return hours;
}

function recoveryPlanFor(scopes, requestedAt, recoveryWindowHours) {
  const hoursByScope = {};
  const eligibleScopes = [];

  for (const scope of scopes) {
    const hours = normalizeRecoveryHours(recoveryWindowHours, scope);

    if (hours > 0) {
      hoursByScope[scope] = hours;
      eligibleScopes.push(scope);
    }
  }

  const maxHours = Math.max(0, ...Object.values(hoursByScope));

  return deepFreeze({
    eligibleScopes,
    hoursByScope,
    deadlineAt: maxHours > 0 ? addHours(requestedAt, maxHours) : null,
    behavior:
      eligibleScopes.length > 0
        ? 'Eligible cache entries are hidden immediately, kept restorable until the deadline, and purged after the recovery window expires.'
        : 'No recovery window is available for the selected scopes. Secret-bearing scopes use immediate key or reference destruction.'
  });
}

function reviewFor(input = {}) {
  const approved = input?.approved === true;
  const review = {
    required: true,
    status: approved ? 'approved' : 'required',
    releaseBlocker: !approved,
    reviewer: null,
    reviewedAt: null,
    evidence: [
      'Human reviewer confirms platform storage locations are complete for the target wrapper.',
      'Human reviewer confirms filesystem limitations and backup behavior are documented before release.',
      'Human reviewer confirms no deletion diagnostics include secrets, private messages, or wallet signing material.'
    ]
  };

  if (!approved) {
    return deepFreeze(review);
  }

  const reviewer = String(input.reviewer ?? '').trim();
  if (!reviewer) {
    throw new Error('Approved secure deletion review requires a reviewer.');
  }

  return deepFreeze({
    ...review,
    reviewer,
    reviewedAt: normalizeTimestamp(input.reviewedAt, 'Secure deletion review reviewedAt')
  });
}

function createLocations(platform, scopes) {
  return scopes.map((scope) => {
    const catalog = PLATFORM_LOCATION_CATALOG[platform][scope];

    return deepFreeze({
      scope,
      platform,
      label: SCOPE_DEFINITIONS[scope].label,
      storage: catalog.storage,
      targets: [...catalog.targets],
      secureRefs: [...catalog.secureRefs],
      limitations: [...PLATFORM_LIMITATIONS[platform]]
    });
  });
}

function operationForSecureRef(scope, platform, secureRef, sequence) {
  return {
    id: `${scope}:destroy-secure-ref:${sequence}`,
    scope,
    platform,
    kind: 'destroy-secure-ref',
    target: secureRef,
    irreversible: true,
    description: `Delete device-local secure reference for ${SCOPE_DEFINITIONS[scope].label}.`
  };
}

function operationForTarget(scope, platform, target, sequence, recovery) {
  const recoveryHours = recovery.hoursByScope[scope] ?? 0;
  const kind = scope === 'cache' && recoveryHours > 0 ? 'schedule-cache-purge' : 'delete-location';

  return {
    id: `${scope}:${kind}:${sequence}`,
    scope,
    platform,
    kind,
    target,
    irreversible: kind !== 'schedule-cache-purge',
    recoveryDeadlineAt: kind === 'schedule-cache-purge' ? addHours(recovery.requestedAt, recoveryHours) : null,
    description:
      kind === 'schedule-cache-purge'
        ? `Hide cached data now and schedule purge after the recovery window for ${target}.`
        : `Delete local storage location for ${SCOPE_DEFINITIONS[scope].label}.`
  };
}

function createOperations(platform, locations, recovery) {
  const operations = [];

  for (const location of locations) {
    let sequence = 1;

    for (const secureRef of location.secureRefs) {
      operations.push(operationForSecureRef(location.scope, platform, secureRef, sequence++));
    }

    for (const target of location.targets) {
      operations.push(operationForTarget(location.scope, platform, target, sequence++, recovery));
    }
  }

  return operations.map((operation) => deepFreeze(operation));
}

function normalizePlan(plan) {
  if (!isPlainObject(plan) || plan.kind !== SECURE_DATA_DELETION_PLAN_KIND) {
    throw new Error(`Secure deletion execution requires a ${SECURE_DATA_DELETION_PLAN_KIND} plan.`);
  }

  if (!Array.isArray(plan.operations)) {
    throw new Error('Secure deletion plan operations must be an array.');
  }

  if (!isPlainObject(plan.confirmation) || typeof plan.confirmation.requiredText !== 'string') {
    throw new Error('Secure deletion plan requires confirmation metadata.');
  }

  return plan;
}

function resultStatus(value) {
  if (isPlainObject(value) && typeof value.status === 'string') {
    return value.status;
  }

  return 'completed';
}

function emitProgress(onProgress, update) {
  if (typeof onProgress === 'function') {
    onProgress(deepFreeze(clone(update)));
  }
}

async function executeOperation(operation, options, recovery) {
  if (operation.kind === 'destroy-secure-ref') {
    if (!options.secureStorage || typeof options.secureStorage.delete !== 'function') {
      throw new Error('Secure deletion destroy-secure-ref operations require secureStorage.delete(keyRef).');
    }

    return options.secureStorage.delete(operation.target);
  }

  if (operation.kind === 'schedule-cache-purge') {
    if (options.storage && typeof options.storage.schedulePurge === 'function') {
      return options.storage.schedulePurge(operation, recovery);
    }

    if (options.storage && typeof options.storage.deleteLocation === 'function') {
      return options.storage.deleteLocation(operation);
    }

    throw new Error('Secure deletion cache purge operations require storage.schedulePurge(operation, recovery).');
  }

  if (operation.kind === 'delete-location') {
    if (options.storage && typeof options.storage.deleteLocation === 'function') {
      return options.storage.deleteLocation(operation);
    }

    throw new Error('Secure deletion location operations require storage.deleteLocation(operation).');
  }

  throw new Error(`Unsupported secure deletion operation kind: ${operation.kind}`);
}

export function createSecureDataDeletionPlan(input = {}) {
  const platform = normalizePlatform(input.platform ?? 'desktop');
  const scopes = normalizeScopes(input.scopes);
  const requestedAt = normalizeTimestamp(input.requestedAt, 'Secure deletion requestedAt');
  const recovery = {
    requestedAt,
    ...recoveryPlanFor(scopes, requestedAt, input.recoveryWindowHours)
  };
  const locations = createLocations(platform, scopes);
  const operations = createOperations(platform, locations, recovery);
  const planId = String(input.id ?? `secure-deletion:${platform}:${requestedAt}`).trim();

  if (!planId) {
    throw new Error('Secure deletion plan id must be a non-empty string.');
  }

  return deepFreeze({
    kind: SECURE_DATA_DELETION_PLAN_KIND,
    schemaVersion: SECURE_DATA_DELETION_SCHEMA_VERSION,
    id: planId,
    platform,
    scopes,
    requestedAt,
    confirmation: {
      requiredText: confirmationTextFor(scopes),
      summary:
        'This request is irreversible for local secret-bearing data. It deletes local device data only and does not delete Telegram accounts, remote messages, external wallet accounts, or public blockchain history.',
      remoteDeletion: false,
      effects: scopes.map((scope) => SCOPE_DEFINITIONS[scope].effect)
    },
    recovery: {
      eligibleScopes: [...recovery.eligibleScopes],
      hoursByScope: { ...recovery.hoursByScope },
      deadlineAt: recovery.deadlineAt,
      behavior: recovery.behavior
    },
    humanReview: reviewFor(input.humanReview),
    platformLimitations: [...PLATFORM_LIMITATIONS[platform]],
    locations,
    operations
  });
}

export async function executeSecureDataDeletionPlan(planInput, options = {}) {
  const plan = normalizePlan(planInput);

  if (options.confirmationText !== plan.confirmation.requiredText) {
    throw new Error(`Secure deletion confirmation text must exactly match: ${plan.confirmation.requiredText}`);
  }

  const startedAt = normalizeTimestamp(options.startedAt ?? options.now, 'Secure deletion startedAt');
  const totalOperations = plan.operations.length;
  const results = [];

  emitProgress(options.onProgress, {
    status: 'started',
    planId: plan.id,
    totalOperations,
    completedOperations: 0
  });

  for (const [index, operation] of plan.operations.entries()) {
    emitProgress(options.onProgress, {
      status: 'running',
      planId: plan.id,
      operationId: operation.id,
      scope: operation.scope,
      kind: operation.kind,
      completedOperations: index,
      totalOperations
    });

    const adapterResult = await executeOperation(operation, options, plan.recovery);
    const completed = {
      operationId: operation.id,
      scope: operation.scope,
      kind: operation.kind,
      status: resultStatus(adapterResult)
    };
    results.push(completed);

    emitProgress(options.onProgress, {
      status: 'operation-completed',
      planId: plan.id,
      operationId: operation.id,
      scope: operation.scope,
      kind: operation.kind,
      completedOperations: index + 1,
      totalOperations
    });
  }

  const completedAt = normalizeTimestamp(options.completedAt ?? new Date().toISOString(), 'Secure deletion completedAt');
  const result = {
    kind: SECURE_DATA_DELETION_RESULT_KIND,
    schemaVersion: SECURE_DATA_DELETION_SCHEMA_VERSION,
    planId: plan.id,
    platform: plan.platform,
    scopes: [...plan.scopes],
    status: 'completed',
    startedAt,
    completedAt,
    completedOperations: results.length,
    totalOperations,
    recovery: clone(plan.recovery),
    results
  };

  emitProgress(options.onProgress, {
    status: 'completed',
    planId: plan.id,
    completedOperations: results.length,
    totalOperations
  });

  return deepFreeze(result);
}
