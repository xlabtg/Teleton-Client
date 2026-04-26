import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_PROVIDER_TYPES,
  isSecureReference,
  validateAgentProviderConfig
} from '../src/foundation/agent-provider-config.mjs';

test('agent provider config validates local providers without shared credentials', () => {
  assert.deepEqual(AGENT_PROVIDER_TYPES, ['local', 'cloud', 'custom-endpoint']);

  const valid = validateAgentProviderConfig({
    id: 'ollama-local',
    type: 'local',
    modelId: 'llama3.2',
    endpointUrl: 'http://127.0.0.1:11434'
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.config.endpointUrl, 'http://127.0.0.1:11434');

  const invalid = validateAgentProviderConfig({
    id: 'local-with-secret',
    type: 'local',
    modelId: 'local-model',
    endpointUrl: 'https://local.example',
    apiKeyRef: 'env:SHOULD_NOT_BE_USED'
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /Local provider endpointUrl/);
  assert.match(invalid.errors.join('\n'), /credentials are not stored/);
});

test('agent provider config requires secure credential references for cloud providers', () => {
  const valid = validateAgentProviderConfig({
    id: 'openai',
    type: 'cloud',
    modelId: 'gpt-4.1-mini',
    endpointUrl: 'https://api.openai.com/v1',
    apiKeyRef: 'keychain:teleton-openai-api-key'
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.config.requiresCloudOptIn, true);
  assert.equal(valid.config.apiKeyRef, 'keychain:teleton-openai-api-key');
  assert.equal(isSecureReference('env:TELETON_AGENT_TOKEN'), true);
  assert.equal(isSecureReference('raw-token'), false);

  const invalid = validateAgentProviderConfig({
    id: 'cloud',
    type: 'cloud',
    modelId: 'remote-model',
    endpointUrl: 'http://api.example.test',
    apiKeyRef: 'raw-token'
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /https:/);
  assert.match(invalid.errors.join('\n'), /secure references/);
});

test('agent provider config validates custom endpoint providers', () => {
  const valid = validateAgentProviderConfig({
    id: 'approved-custom',
    type: 'custom-endpoint',
    modelId: 'vendor/model-v1',
    endpointUrl: 'https://llm.example.test/v1',
    tokenRef: 'secret:approved-custom-token'
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.config.tokenRef, 'secret:approved-custom-token');
  assert.equal(valid.config.requiresCloudOptIn, true);

  const invalid = validateAgentProviderConfig({
    id: 'bad custom',
    type: 'custom-endpoint',
    modelId: 'model with spaces',
    endpointUrl: 'not-a-url'
  });

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /provider id/);
  assert.match(invalid.errors.join('\n'), /modelId/);
  assert.match(invalid.errors.join('\n'), /valid URL/);
});
