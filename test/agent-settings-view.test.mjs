import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_PRIVACY_IMPACT_MODES,
  createAgentSettingsView
} from '../src/foundation/agent-settings-view.mjs';

test('agent settings view exposes mode, model, privacy, approval, and rate limit controls', () => {
  const view = createAgentSettingsView();

  assert.deepEqual(view.getState().mode.options.map((option) => option.id), ['off', 'local', 'cloud', 'hybrid']);
  assert.equal(view.getState().settings.mode, 'off');
  assert.equal(view.getState().settings.allowCloudProcessing, false);
  assert.equal(view.getState().settings.maxAutonomousActionsPerHour, 0);
  assert.equal(view.getState().activation.pending, false);

  let state = view.setModelPreference({
    provider: 'local',
    modelId: 'teleton-local-small',
    displayName: 'Teleton Local Small'
  });
  assert.deepEqual(state.settings.model, {
    provider: 'local',
    modelId: 'teleton-local-small',
    displayName: 'Teleton Local Small'
  });

  state = view.setRequireConfirmation(false);
  assert.equal(state.settings.requireConfirmation, false);

  state = view.selectMode('local');
  assert.equal(state.settings.mode, 'local');

  state = view.setActionLimit(12);
  assert.equal(state.settings.maxAutonomousActionsPerHour, 12);
});

test('agent settings view requires privacy impact confirmation before cloud or hybrid activation', () => {
  const view = createAgentSettingsView();

  let state = view.selectMode('cloud');
  assert.equal(state.settings.mode, 'off');
  assert.equal(state.activation.pending, true);
  assert.equal(state.activation.requestedMode, 'cloud');
  assert.equal(state.activation.requiresPrivacyConfirmation, true);
  assert.match(state.activation.privacyImpact.summary, /cloud processing/i);

  state = view.confirmPrivacyImpact();
  assert.equal(state.settings.mode, 'cloud');
  assert.equal(state.settings.allowCloudProcessing, true);
  assert.equal(state.activation.pending, false);

  state = view.selectMode('off');
  assert.equal(state.settings.mode, 'off');
  assert.equal(state.settings.allowCloudProcessing, false);
  assert.equal(state.settings.maxAutonomousActionsPerHour, 0);

  state = view.selectMode('hybrid');
  assert.equal(state.settings.mode, 'off');
  assert.equal(state.activation.requestedMode, 'hybrid');

  state = view.cancelPrivacyImpact();
  assert.equal(state.settings.mode, 'off');
  assert.equal(state.activation.pending, false);
});

test('agent settings view activates local mode without cloud privacy consent', () => {
  const view = createAgentSettingsView();

  const state = view.selectMode('local');
  assert.equal(state.settings.mode, 'local');
  assert.equal(state.settings.allowCloudProcessing, false);
  assert.equal(state.activation.pending, false);
  assert.deepEqual(AGENT_PRIVACY_IMPACT_MODES, ['cloud', 'hybrid']);
});

test('agent settings view previews portable imports before applying agent changes', () => {
  const view = createAgentSettingsView({
    initialSettings: {
      mode: 'local',
      model: { provider: 'local', modelId: 'teleton-local-small' },
      maxAutonomousActionsPerHour: 2
    }
  });
  const exported = view.exportPortableSettings();

  assert.equal(exported.kind, 'teleton.agent.settings.export');
  assert.equal(exported.settings.mode, 'local');

  const preview = view.previewImport({
    ...exported,
    settings: {
      ...exported.settings,
      model: { provider: 'openai', modelId: 'gpt-4.1-mini' },
      maxAutonomousActionsPerHour: 9,
      memory: { facts: ['private local memory must not import'] },
      token: 'raw-token'
    }
  });

  assert.equal(preview.valid, true);
  assert.deepEqual(preview.excludedFields, ['memory', 'token', 'apiKey', 'secret']);
  assert.deepEqual(preview.changes.map((change) => change.path), [
    'model.provider',
    'model.modelId',
    'maxAutonomousActionsPerHour'
  ]);
  assert.equal(view.getState().settings.maxAutonomousActionsPerHour, 2);

  const state = view.applyImport(preview);
  assert.equal(state.settings.model.provider, 'openai');
  assert.equal(state.settings.maxAutonomousActionsPerHour, 9);

  assert.throws(
    () => view.previewImport({ kind: 'teleton.agent.settings.export', schemaVersion: 999, settings: {} }),
    /newer than this client supports/
  );
});
