import { Eraser, Save, SlidersHorizontal } from 'lucide-react';
import { ChangeEvent } from 'react';

import { useTeletonStore } from '../../shared/store/useTeletonStore';
import type { ProxySettings } from '../../shared/types';

export function SettingsScreen() {
  const proxy = useTeletonStore((state) => state.proxy);
  const setProxyDraft = useTeletonStore((state) => state.setProxyDraft);
  const applyProxy = useTeletonStore((state) => state.applyProxy);
  const saveSettings = useTeletonStore((state) => state.saveSettings);
  const clearSettings = useTeletonStore((state) => state.clearSettings);

  const updateProxy = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next: ProxySettings = {
      ...proxy,
      [event.target.name]:
        event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.name === 'port'
            ? Number(event.target.value)
            : event.target.value
    };
    setProxyDraft(next);
  };

  return (
    <section className="min-h-screen px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl border border-mist bg-white p-5 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center bg-saffron text-white">
            <SlidersHorizontal size={21} />
          </span>
          <div>
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-ink/58">Proxy and encrypted browser state</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
            <input type="checkbox" name="enabled" checked={proxy.enabled} onChange={updateProxy} />
            <span>Proxy enabled</span>
          </label>
          <label className="block text-sm font-medium">
            Type
            <select className="mt-2 h-11 w-full border border-mist px-3" name="type" value={proxy.type} onChange={updateProxy}>
              <option value="none">None</option>
              <option value="socks5">SOCKS5</option>
              <option value="mtproto">MTProto</option>
            </select>
          </label>
          <label className="block text-sm font-medium">
            Host
            <input className="mt-2 h-11 w-full border border-mist px-3" name="host" value={proxy.host} onChange={updateProxy} />
          </label>
          <label className="block text-sm font-medium">
            Port
            <input
              className="mt-2 h-11 w-full border border-mist px-3"
              name="port"
              inputMode="numeric"
              value={proxy.port || ''}
              onChange={updateProxy}
            />
          </label>
          <label className="block text-sm font-medium">
            Username
            <input
              className="mt-2 h-11 w-full border border-mist px-3"
              name="username"
              value={proxy.username ?? ''}
              onChange={updateProxy}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className="mt-2 h-11 w-full border border-mist px-3"
              type="password"
              name="password"
              value={proxy.password ?? ''}
              onChange={updateProxy}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            MTProto secret reference
            <input
              className="mt-2 h-11 w-full border border-mist px-3"
              name="secret"
              value={proxy.secret ?? ''}
              onChange={updateProxy}
              placeholder="env:TELETON_MTPROTO_SECRET"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="flex h-10 items-center gap-2 bg-teal px-4 text-sm font-semibold text-white hover:bg-ink"
            onClick={() => void applyProxy()}
          >
            <Save size={17} />
            Apply
          </button>
          <button
            type="button"
            className="flex h-10 items-center gap-2 border border-mist px-4 text-sm font-semibold hover:bg-paper"
            onClick={() => void saveSettings()}
          >
            <Save size={17} />
            Save Encrypted
          </button>
          <button
            type="button"
            className="flex h-10 items-center gap-2 border border-mist px-4 text-sm font-semibold hover:bg-paper"
            onClick={() => void clearSettings()}
          >
            <Eraser size={17} />
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}
