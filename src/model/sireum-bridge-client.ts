import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import type { ModelDiagnostic } from './model-provider.js';
import type { ModelMetadata } from './model-index.js';

interface PendingRequest {
  resolve(value: any): void;
  reject(error: Error): void;
}

export interface SireumTypeCheckResult {
  air: string[];
  metadata?: ModelMetadata;
  diagnostics: ModelDiagnostic[];
  hasError: boolean;
}

/** Owns one long-lived JVM bridge and correlates line-delimited responses by request id. */
export class SireumBridgeClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly sireumHome: string,
    private readonly bridgeJar: string,
    private readonly log: (message: string) => void
  ) {}

  /** Starts the bridge and verifies the protocol before model requests are accepted. */
  async start(): Promise<void> {
    if (this.process) return;
    const java = path.join(this.sireumHome, 'bin', 'linux', 'java', 'bin', 'java');
    const sireumJar = path.join(this.sireumHome, 'bin', 'sireum.jar');
    this.process = spawn(java, ['-cp', [this.bridgeJar, sireumJar].join(path.delimiter), 'ResoluteSireumBridge'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    readline.createInterface({ input: this.process.stdout }).on('line', line => this.receive(line));
    this.process.stderr.on('data', data => this.log(String(data)));
    this.process.on('exit', (code, signal) => {
      const error = new Error(`Sireum bridge exited (code ${String(code)}, signal ${String(signal)}).`);
      this.process = undefined;
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    const handshake = await this.request('handshake', {});
    if (handshake.protocolVersion !== 1) throw new Error(`Unsupported Sireum bridge protocol ${String(handshake.protocolVersion)}.`);
  }

  /** Type-checks one complete SysML source set and returns canonical AIR documents. */
  async typeCheck(files: ReadonlyArray<{ uri: string; text: string }>): Promise<SireumTypeCheckResult> {
    await this.start();
    return this.request('typeCheck', { files });
  }

  /** Terminates the child process and rejects outstanding requests. */
  stop(): void {
    this.process?.kill();
    this.process = undefined;
  }

  private request(method: string, params: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process!.stdin.write(`${JSON.stringify({ protocolVersion: 1, id, method, ...params })}\n`);
    });
  }

  private receive(line: string): void {
    try {
      const message = JSON.parse(line) as { id: number; result?: unknown; error?: { message?: string } };
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? 'Sireum bridge error'));
      else pending.resolve(message.result);
    } catch (error) {
      this.log(`Invalid Sireum bridge response: ${String(error)}\n${line}`);
    }
  }
}
