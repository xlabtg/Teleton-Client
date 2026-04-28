import { Activity, Bot, Cable, Power, ShieldCheck } from 'lucide-react';
import { ChangeEvent } from 'react';

import { useTeletonStore } from '../../shared/store/useTeletonStore';

export function AgentPanel() {
  const agent = useTeletonStore((state) => state.agent);
  const agentStatus = useTeletonStore((state) => state.agentStatus);
  const setAgentSettings = useTeletonStore((state) => state.setAgentSettings);
  const saveSettings = useTeletonStore((state) => state.saveSettings);
  const connectAgent = useTeletonStore((state) => state.connectAgent);
  const disconnectAgent = useTeletonStore((state) => state.disconnectAgent);
  const enableAgent = useTeletonStore((state) => state.enableAgent);
  const disableAgent = useTeletonStore((state) => state.disableAgent);
  const checkManagementStatus = useTeletonStore((state) => state.checkManagementStatus);

  const update = (event: ChangeEvent<HTMLInputElement>) => {
    setAgentSettings({
      ...agent,
      [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value
    });
  };

  return (
    <section className="min-h-screen px-5 py-6 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-mist bg-white p-5 shadow-panel">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center bg-ink text-white">
              <Bot size={21} />
            </span>
            <div>
              <h1 className="text-xl font-semibold">Teleton Agent</h1>
              <p className="text-sm text-ink/58">{agentStatus.connection}</p>
            </div>
          </div>

          <div className="grid gap-4">
            <label className="block text-sm font-medium">
              WebSocket URL
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                name="wsUrl"
                value={agent.wsUrl}
                onChange={update}
              />
            </label>
            <label className="block text-sm font-medium">
              Management API URL
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                name="managementUrl"
                value={agent.managementUrl}
                onChange={update}
              />
            </label>
            <label className="block text-sm font-medium">
              Management API key
              <input
                className="mt-2 h-11 w-full border border-mist px-3"
                type="password"
                name="managementApiKey"
                value={agent.managementApiKey ?? ''}
                onChange={update}
                autoComplete="off"
              />
            </label>
            <label className="flex items-center gap-3 text-sm font-medium">
              <input type="checkbox" name="enabled" checked={agent.enabled} onChange={update} />
              <span>Agent enabled</span>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="flex h-10 items-center gap-2 bg-teal px-4 text-sm font-semibold text-white hover:bg-ink"
              onClick={() => void connectAgent()}
            >
              <Cable size={17} />
              Connect
            </button>
            <button
              type="button"
              className="flex h-10 items-center gap-2 border border-mist px-4 text-sm font-semibold hover:bg-paper"
              onClick={disconnectAgent}
            >
              <Power size={17} />
              Disconnect
            </button>
            <button
              type="button"
              className="flex h-10 items-center gap-2 border border-mist px-4 text-sm font-semibold hover:bg-paper"
              onClick={() => void checkManagementStatus()}
            >
              <Activity size={17} />
              Status
            </button>
            <button
              type="button"
              className="flex h-10 items-center gap-2 border border-mist px-4 text-sm font-semibold hover:bg-paper"
              onClick={() => void saveSettings()}
            >
              <ShieldCheck size={17} />
              Save
            </button>
          </div>
        </div>

        <div className="border border-mist bg-white p-5 shadow-panel">
          <h2 className="mb-4 text-base font-semibold">Runtime</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between border-b border-mist pb-3">
              <dt className="text-ink/58">Connection</dt>
              <dd className="font-semibold">{agentStatus.connection}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-mist pb-3">
              <dt className="text-ink/58">Lifecycle</dt>
              <dd className="font-semibold">{agentStatus.lifecycle ?? 'unknown'}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-mist pb-3">
              <dt className="text-ink/58">Uptime</dt>
              <dd className="font-semibold">{agentStatus.uptime ? `${Math.floor(agentStatus.uptime)}s` : 'none'}</dd>
            </div>
          </dl>
          {agentStatus.error && <p className="mt-4 border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{agentStatus.error}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              className="h-10 bg-mint px-4 text-sm font-semibold text-white hover:bg-ink"
              onClick={() => void enableAgent()}
            >
              Enable
            </button>
            <button
              type="button"
              className="h-10 border border-mist px-4 text-sm font-semibold hover:bg-paper"
              onClick={() => void disableAgent()}
            >
              Disable
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
