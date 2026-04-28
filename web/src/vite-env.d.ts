/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEGRAM_API_ID?: string;
  readonly VITE_TELEGRAM_API_HASH?: string;
  readonly VITE_TDLIB_LOG_VERBOSITY?: string;
  readonly VITE_TELETON_AGENT_WS_URL?: string;
  readonly VITE_TELETON_AGENT_MANAGEMENT_URL?: string;
  readonly VITE_TONCONNECT_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'tdweb' {
  export default class TdClient {
    constructor(options: Record<string, unknown>);
    send(query: Record<string, unknown>): Promise<Record<string, unknown>>;
    close(): void;
  }
}
