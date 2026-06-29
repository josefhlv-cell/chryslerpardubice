Zkopíruj celý elm327-engine.ts tímhle. Hlavní oprava: když data chodí, inicializace už nesmí shodit připojení.

// ELM327 Protocol Engine
// Handles initialization, command queuing, and response parsing
import { bleManager } from "@/lib/obd/ble-manager";
export type CommandPriority = "high" | "normal" | "low";
export type QueuedCommand = {
  command: string;
  priority: CommandPriority;
  resolve: (value: string) => void;
  reject: (reason: any) => void;
  timestamp: number;
  retries: number;
};
export type ELMState = "idle" | "initializing" | "ready" | "busy" | "error";
export type InitStep = {
  command: string;
  description: string;
  status: "pending" | "running" | "success" | "error";
  response?: string;
};
const INIT_SEQUENCE = [
  { command: "ATE0", description: "Echo off" },
  { command: "ATL0", description: "Linefeeds off" },
  { command: "ATS0", description: "Spaces off" },
  { command: "ATH0", description: "Headers off" },
  { command: "ATSP0", description: "Auto protocol" },
  { command: "010C", description: "RPM test" },
];
const ERROR_PATTERNS = [
  "UNABLE TO CONNECT",
  "BUS INIT",
  "CAN ERROR",
  "BUFFER FULL",
  "ERROR",
];
const SIMULATED_RESPONSES: Record<string, string> = {
  ATE0: "OK",
  ATL0: "OK",
  ATS0: "OK",
  ATH0: "OK",
  ATSP0: "OK",
  ATRV: "12.6V",
  "010C": "410C0C1C",
  "0105": "41054D",
};
class ELM327Engine {
  private state: ELMState = "idle";
  private queue: QueuedCommand[] = [];
  private processing = false;
  private commandDelay = 160;
  private initSteps: InitStep[] = [];
  private stateListeners: ((state: ELMState) => void)[] = [];
  private initListeners: ((steps: InitStep[]) => void)[] = [];
  private isNative = false;
  private initialized = false;
  private initializingPromise: Promise<boolean> | null = null;
  constructor() {
    this.isNative =
      typeof (window as any).Capacitor !== "undefined" &&
      (window as any).Capacitor.isNativePlatform?.();
  }
  getState(): ELMState {
    return this.state;
  }
  getInitSteps(): InitStep[] {
    return [...this.initSteps];
  }
  setCommandDelay(ms: number) {
    this.commandDelay = Math.max(100, Math.min(300, ms));
  }
  onStateChange(listener: (state: ELMState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener);
    };
  }
  onInitProgress(listener: (steps: InitStep[]) => void): () => void {
    this.initListeners.push(listener);
    return () => {
      this.initListeners = this.initListeners.filter((l) => l !== listener);
    };
  }
  private setState(state: ELMState) {
    this.state = state;
    this.stateListeners.forEach((l) => l(state));
  }
  private emitInitProgress() {
    this.initListeners.forEach((l) => l([...this.initSteps]));
  }
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      this.setState("ready");
      return true;
    }
    if (this.initializingPromise) return this.initializingPromise;
    this.initializingPromise = this.runInitialize();
    try {
      return await this.initializingPromise;
    } finally {
      this.initializingPromise = null;
    }
  }
  private async runInitialize(): Promise<boolean> {
    this.clearQueue();
    this.processing = false;
    this.setState("initializing");
    let successCount = 0;
    this.initSteps = INIT_SEQUENCE.map((s) => ({
      ...s,
      status: "pending" as const,
    }));
    this.emitInitProgress();
    await this.delay(600);
    for (let i = 0; i < this.initSteps.length; i++) {
      const command = this.initSteps[i].command;
      this.initSteps[i].status = "running";
      this.emitInitProgress();
      try {
        const response = await this.sendRaw(command);
        this.initSteps[i].response = response;
        if (this.isHardError(response)) {
          this.initSteps[i].status = "error";
        } else {
          this.initSteps[i].status = "success";
          successCount++;
        }
      } catch (e) {
        this.initSteps[i].status = "error";
        this.initSteps[i].response = String(e);
      }
      this.emitInitProgress();
      await this.delay(this.commandDelay);
    }
    // DŮLEŽITÉ:
    // Pokud prošel aspoň jeden AT/OBD příkaz, necháme spojení běžet.
    // Některé iOS-VLink adaptéry vrací divné odpovědi, ale live data normálně chodí.
    if (successCount > 0) {
      this.initialized = true;
      this.setState("ready");
      return true;
    }
    this.setState("error");
    return false;
  }
  private async sendRaw(command: string): Promise<string> {
    const cleanCommand = command.trim().replace(/\r/g, "");
    if (!this.isNative) {
      await this.delay(80);
      const key = cleanCommand.toUpperCase().replace(/\s/g, "");
      return SIMULATED_RESPONSES[key] || "";
    }
    await bleManager.write(cleanCommand);
    const response = await bleManager.readResponse(3500);
    return this.parseResponse(response);
  }
  async sendCommand(command: string, priority: CommandPriority = "normal"): Promise<string> {
    return new Promise((resolve, reject) => {
      const item: QueuedCommand = {
        command,
        priority,
        resolve,
        reject,
        timestamp: Date.now(),
        retries: 0,
      };
      if (priority === "high") this.queue.unshift(item);
      else this.queue.push(item);
      this.processQueue();
    });
  }
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.setState("busy");
      try {
        const response = await this.sendRaw(item.command);
        if (this.isHardError(response)) {
          if (item.retries < 1) {
            item.retries++;
            this.queue.unshift(item);
          } else {
            item.reject(new Error(`OBD Error: ${response}`));
          }
        } else {
          item.resolve(response);
        }
      } catch (e) {
        item.reject(e);
      }
      await this.delay(this.commandDelay);
    }
    this.processing = false;
    this.setState(this.initialized ? "ready" : "idle");
  }
  parseResponse(raw: string): string {
    return raw
      .replace(/>/g, "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          !line.toUpperCase().startsWith("AT") &&
          !line.toUpperCase().startsWith("SEARCHING")
      )
      .join("\n");
  }
  isHardError(response: string): boolean {
    const upper = response.toUpperCase();
    return ERROR_PATTERNS.some((p) => upper.includes(p));
  }
  isError(response: string): boolean {
    return this.isHardError(response);
  }
  clearQueue() {
    this.queue.forEach((item) => item.reject(new Error("Queue cleared")));
    this.queue = [];
  }
  reset() {
    this.clearQueue();
    this.initialized = false;
    this.initializingPromise = null;
    this.processing = false;
    this.setState("idle");
  }
  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
export const elm327 = new ELM327Engine();