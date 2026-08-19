import { createRequire } from 'node:module';

interface RconInstance {
  authenticate(password: string): Promise<boolean>;
  execute(command: string): Promise<string | boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  isAuthenticated(): boolean;
}

type RconConstructor = new (options: {
  host?: string;
  port?: number;
  maxPacketSize?: number;
  encoding?: 'ascii' | 'utf8';
  timeout?: number;
}) => RconInstance;

// rcon-srcds is CommonJS and exposes its constructor as `default`.
const require = createRequire(import.meta.url);
const Rcon = (require('rcon-srcds') as { default: RconConstructor }).default;

export interface StatsClient {
  executeStats(): Promise<string>;
  disconnect(): Promise<void>;
}

export interface RconClientOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs: number;
}

export class MinecraftRconClient implements StatsClient {
  private client: RconInstance | null = null;
  private inFlight: Promise<string> | null = null;

  constructor(private readonly options: RconClientOptions) {}

  executeStats(): Promise<string> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.executeWithDeadline().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client?.isConnected()) {
      await client.disconnect().catch(() => undefined);
    }
  }

  private async executeWithDeadline(): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const command = this.execute();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('RCON request timed out')), this.options.timeoutMs);
      });
      return await Promise.race([command, deadline]);
    } catch (error) {
      await this.disconnect();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async execute(): Promise<string> {
    if (!this.client?.isAuthenticated()) {
      this.client = new Rcon({
        host: this.options.host,
        port: this.options.port,
        timeout: this.options.timeoutMs,
        encoding: 'utf8',
      });
      await this.client.authenticate(this.options.password);
    }
    const response = await this.client.execute('dynmap stats');
    if (typeof response !== 'string') throw new Error('RCON returned an invalid response');
    return response;
  }
}
