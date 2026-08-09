declare module "@colyseus/tools" {
  import type { Express } from "express";
  import type { Server, ServerOptions, Transport } from "colyseus";

  export interface ConfigOptions {
    options?: ServerOptions;
    displayLogs?: boolean;
    getId?: () => string;
    initializeTransport?: (options: unknown) => Transport;
    initializeExpress?: (app: Express) => void | Promise<void>;
    initializeGameServer?: (app: Server) => void | Promise<void>;
    beforeListen?: () => void | Promise<void>;
  }

  export default function config(options: ConfigOptions): ConfigOptions;
  export function listen(options: ConfigOptions | Server, port?: number): Promise<Server>;
}
