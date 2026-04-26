import { createMockTonWalletAdapter, createTonWalletAdapter } from './wallet-adapter.mjs';
import { createMockTonTransactionConfirmationWorkflow } from './transaction-confirmation.mjs';

export const TON_TESTNET_ENVIRONMENT = Object.freeze([
  Object.freeze({
    name: 'TELETON_TON_TESTNET_ENABLED',
    requiredForTestnet: true,
    secret: false,
    description: 'Set to true only in protected CI or a trusted local shell to run live TON testnet checks.'
  }),
  Object.freeze({
    name: 'TELETON_TON_TESTNET_WALLET_ADDRESS',
    requiredForTestnet: true,
    secret: false,
    description: 'Public testnet wallet address used for balance, receive address, draft, and confirmation checks.'
  }),
  Object.freeze({
    name: 'TELETON_TON_TESTNET_PROVIDER_REF',
    requiredForTestnet: true,
    secret: true,
    description: 'Secure reference for the protected testnet wallet provider; never use a raw private key or mnemonic.'
  }),
  Object.freeze({
    name: 'TELETON_TON_TESTNET_RECIPIENT_ADDRESS',
    requiredForTestnet: true,
    secret: false,
    description: 'Public testnet recipient address used when preparing unsigned transfer drafts.'
  }),
  Object.freeze({
    name: 'TELETON_TON_TESTNET_TRANSFER_NANOTON',
    requiredForTestnet: false,
    secret: false,
    description: 'Optional positive integer transfer amount for draft checks; defaults to 1 nanotON.'
  })
]);

const REQUIRED_TESTNET_ENVIRONMENT = TON_TESTNET_ENVIRONMENT.filter((entry) => entry.requiredForTestnet).map((entry) => entry.name);

const DEFAULT_MOCK_FIXTURE = Object.freeze({
  walletAddress: 'EQDmockTestnetWalletAddress',
  recipientAddress: 'EQDmockTestnetRecipientAddress',
  providerRef: 'wallet:mock-ton-testnet-provider',
  balanceNanoTon: 5000000000n,
  transferNanoTon: 100000000n,
  networkFeeNanoTon: 1000000n
});

export class TonTestnetCoverageError extends Error {
  constructor(message, code, details = []) {
    super(message);
    this.name = 'TonTestnetCoverageError';
    this.code = code;
    this.details = details;
  }
}

function enabled(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function missingEnvironment(env) {
  return REQUIRED_TESTNET_ENVIRONMENT.filter((name) => !String(env[name] ?? '').trim());
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

  throw new TonTestnetCoverageError(
    'TELETON_TON_TESTNET_TRANSFER_NANOTON must be a positive integer when set.',
    'invalid_testnet_transfer_amount'
  );
}

function redactError(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown TON testnet coverage error.');
  return message.replace(/\b(?:env|keychain|keystore|secret):[A-Za-z0-9_.:/-]+/g, '[secure-ref]');
}

function createTestnetAdapter(env, implementation) {
  if (!implementation) {
    throw new TonTestnetCoverageError(
      'Live TON testnet coverage requires a provider implementation passed to createTonTestnetWalletFlowHarness.',
      'missing_testnet_provider'
    );
  }

  return createTonWalletAdapter(implementation, {
    address: env.TELETON_TON_TESTNET_WALLET_ADDRESS,
    walletProviderRef: env.TELETON_TON_TESTNET_PROVIDER_REF,
    network: 'testnet'
  });
}

export function createTonTestnetWalletFlowHarness(options = {}) {
  const env = options.env ?? process.env;
  const isTestnetEnabled = enabled(env.TELETON_TON_TESTNET_ENABLED);
  const missing = isTestnetEnabled ? missingEnvironment(env) : ['TELETON_TON_TESTNET_ENABLED'];

  if (isTestnetEnabled && missing.length > 0) {
    throw new TonTestnetCoverageError(
      `TON testnet checks are enabled but missing required environment variables: ${missing.join(', ')}.`,
      'missing_testnet_environment',
      missing
    );
  }

  const mode = isTestnetEnabled ? 'testnet' : 'mock';
  const transferNanoTon = parseTransferNanoTon(env.TELETON_TON_TESTNET_TRANSFER_NANOTON, DEFAULT_MOCK_FIXTURE.transferNanoTon);
  const walletAddress = isTestnetEnabled
    ? env.TELETON_TON_TESTNET_WALLET_ADDRESS
    : options.mockFixture?.walletAddress ?? DEFAULT_MOCK_FIXTURE.walletAddress;
  const recipientAddress = isTestnetEnabled
    ? env.TELETON_TON_TESTNET_RECIPIENT_ADDRESS
    : options.mockFixture?.recipientAddress ?? DEFAULT_MOCK_FIXTURE.recipientAddress;

  return Object.freeze({
    mode,
    testnetEnabled: isTestnetEnabled,
    missingEnvironment: Object.freeze([...missing]),
    environmentContract: TON_TESTNET_ENVIRONMENT,
    async runWalletFlow() {
      const adapter = isTestnetEnabled
        ? createTestnetAdapter(env, options.provider)
        : createMockTonWalletAdapter({
            address: walletAddress,
            walletProviderRef: DEFAULT_MOCK_FIXTURE.providerRef,
            balanceNanoTon: options.mockFixture?.balanceNanoTon ?? DEFAULT_MOCK_FIXTURE.balanceNanoTon,
            network: 'testnet'
          });

      try {
        const balance = await adapter.getBalance();
        const receiveAddress = await adapter.getReceiveAddress();
        const transferDraft = await adapter.prepareTransfer({
          to: recipientAddress,
          amountNanoTon: transferNanoTon,
          memo: 'teleton testnet coverage draft',
          confirmed: true
        });
        const transferStatus = await adapter.getTransferStatus(transferDraft.id);

        const confirmationWorkflow = createMockTonTransactionConfirmationWorkflow({
          approvalResults: [{ approved: true, method: 'password', approvedAt: options.now?.() ?? new Date().toISOString() }],
          now: options.now
        });
        const review = confirmationWorkflow.createReview({
          id: transferDraft.id,
          amountNanoTon: transferDraft.amountNanoTon,
          recipient: transferDraft.to,
          networkFeeNanoTon: options.mockFixture?.networkFeeNanoTon ?? DEFAULT_MOCK_FIXTURE.networkFeeNanoTon,
          provider: mode === 'testnet' ? 'testnet-provider' : 'mock-provider',
          memo: transferDraft.memo
        });
        const confirmation = await confirmationWorkflow.approveTransaction(review.id, {
          approvalMethods: ['password'],
          requestedBy: 'testnet-coverage'
        });

        return Object.freeze({
          mode,
          testnetEnabled: isTestnetEnabled,
          missingEnvironment: Object.freeze([...missing]),
          balance,
          receiveAddress,
          transferDraft,
          transferStatus,
          confirmation
        });
      } catch (error) {
        throw new TonTestnetCoverageError(redactError(error), 'testnet_wallet_flow_failed');
      }
    }
  });
}
