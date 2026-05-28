declare module './src/ai/model-capabilities.js' {
  export type ModelTier = 'tiny' | 'small' | 'medium' | 'large' | 'flagship';

  export const MODEL_TIERS: {
    readonly TINY: 'tiny';
    readonly SMALL: 'small';
    readonly MEDIUM: 'medium';
    readonly LARGE: 'large';
    readonly FLAGSHIP: 'flagship';
  };

  export function classifyModelTier(modelName?: string, provider?: string): ModelTier;
  export function isSmallModel(tier: ModelTier): boolean;
  export function getReasoningBump(tier: ModelTier): number;
  export function getModelBudgetMultiplier(tier: ModelTier): number;
  export function getModelCapabilityLabel(tier: ModelTier): string;
}

declare module './src/cli/snowflake-logo.js' {
  export interface ColorPalette {
    reset: string;
    bright: string;
    dim: string;
    italic: string;
    underline: string;
    bgBlack: string;
    bgBlue: string;
    bgCyan: string;
    bgWhite: string;
    bgBrightBlue: string;
    cyan: string;
    blue: string;
    magenta: string;
    white: string;
    red: string;
    yellow: string;
    green: string;
    bgMagenta: string;
  }

  export const colors: ColorPalette;
  export const miniLogo: string;
  export const statusIcons: Record<string, string>;

  export function applyColorTheme(theme?: 'dark' | 'light'): 'dark' | 'light';
  export function welcomeBanner(
    version: string,
    info?: {
      project?: string;
      session?: string;
      provider?: string;
      model?: string;
    }
  ): string;
  export function sessionIndicator(sessionId?: string | null): string;
  export function providerStatus(name: string, status: string): string;
}

declare module './src/cli/tui.js' {
  export interface TuiHistoryEntry {
    role?: 'user' | 'assistant' | string;
    content?: string;
  }

  export interface TuiSnapshot {
    provider: string;
    model: string;
    modelTier?: string;
    processing?: boolean;
    sessionId?: string;
    sessionShort?: string;
    projectPath?: string;
    projectName?: string;
    queueLength?: number;
    queueText?: string;
    statusText?: string;
    codebaseFiles?: number;
    codebaseChunks?: number;
    toolSummary?: string;
    conversationSummary?: string;
    startupNotices?: string[];
    compact?: boolean;
    unicode?: boolean;
    recentHistory?: TuiHistoryEntry[];
  }

  export interface InputPanelParts {
    top: string;
    status: string;
    hint: string;
    prompt: string;
    bottom: string;
  }

  export function buildTuiSnapshot(repl?: Record<string, unknown>): TuiSnapshot;
  export function renderInputPanel(
    snapshot: TuiSnapshot,
    options?: {
      colors?: Record<string, string>;
      width?: number;
    }
  ): InputPanelParts;
  export function renderStatusPanel(
    snapshot: TuiSnapshot,
    options?: {
      colors?: Record<string, string>;
      width?: number;
      title?: string;
    }
  ): string;
  export function renderLandingTui(
    snapshot: TuiSnapshot,
    options?: {
      colors?: Record<string, string>;
      width?: number;
      title?: string;
    }
  ): string;
  export function renderStartupTui(
    snapshot: TuiSnapshot,
    options?: {
      colors?: Record<string, string>;
      width?: number;
    }
  ): string;
  export function renderConversationStartup(
    snapshot: TuiSnapshot,
    options?: {
      colors?: Record<string, string>;
      width?: number;
    }
  ): string;
  export function renderShellTui(
    snapshot: TuiSnapshot,
    options?: {
      colors?: Record<string, string>;
      width?: number;
      title?: string;
    }
  ): string;
  export function renderCommandCenter(options?: {
    colors?: Record<string, string>;
    width?: number;
  }): string;
  export function renderAssistantPanel(options?: {
    content?: string;
    footer?: string;
    colors?: Record<string, string>;
    title?: string;
    width?: number;
  }): string;
  export function renderToolPanel(options?: {
    toolName?: string;
    summary?: string;
    success?: boolean;
    colors?: Record<string, string>;
    width?: number;
    title?: string;
  }): string;
}

declare module './src/ai/capability-scorecard.js' {
  export interface CapabilityProbe {
    key: string;
    label: string;
    ok?: boolean;
  }

  export interface CapabilityArea {
    id: string;
    label: string;
    weight: number;
    target: string;
    passed: number;
    total: number;
    score: number;
    percent: number;
    probes: CapabilityProbe[];
    checks: CapabilityProbe[];
  }

  export interface CapabilityGap {
    id: string;
    label: string;
    missing: string[];
  }

  export interface CapabilityScorecard {
    target: number;
    overall: number;
    score: number;
    maxScore: number;
    status: 'ready' | 'below-target';
    competitors: Array<{
      name: string;
      strengths: string[];
    }>;
    areas: CapabilityArea[];
    gaps: CapabilityGap[];
  }

  export const WINTER_CAPABILITY_TARGET: number;
  export function assessWinterCapabilities(repl?: Record<string, unknown>): Promise<CapabilityScorecard>;
  export function formatCapabilityScorecard(
    report: CapabilityScorecard,
    options?: { colors?: Record<string, string> }
  ): string;
}

declare module './src/ai/hermes-core.js' {
  export interface HermesCoreSignals {
    agent: boolean;
    skills: boolean;
    memory: boolean;
    automation: boolean;
    gateway: boolean;
    tui: boolean;
    mcp: boolean;
  }

  export const HERMES_CORE_RESOURCE: string;
  export function detectHermesCoreSignals(input?: {
    taskText?: string;
    projectSignals?: string[];
  }): HermesCoreSignals;
  export function shouldApplyHermesCore(input?: {
    taskText?: string;
    projectSignals?: string[];
  }): boolean;
  export function buildHermesCoreContract(options?: { compact?: boolean }): string;
}

declare module './src/ai/small-model-amplifier.js' {
  export interface SmallModelAmplification {
    weak: boolean;
    maxToolTurns: number;
    enforceSelfCritique: boolean;
    hint: string;
  }

  export function isWeakTier(modelTier?: string): boolean;
  export function buildCodingMasteryContract(options?: { compact?: boolean }): string;
  export function buildSmallModelAmplification(options?: {
    modelTier?: string;
    workflowProfile?: string;
    depth?: string;
  }): SmallModelAmplification;
}

declare module './src/cli/repl.js' {
  export interface WinterREPLOptions {
    projectPath?: string;
    sessionId?: string | null;
    version?: string;
  }

  export class WinterREPL {
    constructor(options?: WinterREPLOptions);
    projectPath: string;
    sessionId: string | null;
    version: string;
    running: boolean;
    readlineClosed: boolean;
    start(): Promise<void>;
    showStatus(): void;
    showTuiDashboard(): void;
    showInputPrompt(): void;
    closeInputBox(): void;
    chat(message: string, imageAttachments?: unknown[]): Promise<void>;
    runConversation(messages: unknown[], label?: string, tools?: unknown[] | null): Promise<{
      finalContent: string;
      usedTools: boolean;
      usedMutatingTools: boolean;
      autoVerified?: boolean;
      autoVerificationPassed?: boolean;
    }>;
    inferVerificationCommands(task?: string): Promise<string[]>;
    runVerification(commands?: string[] | null): Promise<{
      passed: boolean;
      details: Array<{ cmd: string; passed: boolean; output: string }>;
    }>;
    runAutoHealing(task: string): Promise<void>;
    buildInputPanel(): {
      top: string;
      status: string;
      hint: string;
      prompt: string;
      bottom: string;
    };
    handleSlashMenuKey(key?: Record<string, unknown>): boolean;
    handleDirectClipboardPaste(): Promise<boolean>;
  }
}

declare module './src/cli/commands.js' {
  export interface RedactedValue {
    [key: string]: unknown;
  }

  export interface CommandParserOptions {
    session: unknown;
    ai: unknown;
    config: unknown;
    tools?: unknown;
  }

  export class CommandParser {
    constructor(options: CommandParserOptions);
    parse(args: string[]): Promise<void>;
  }

  export function redactSecretsLegacy(value: unknown): unknown;
  export function redactSecrets(value: unknown): unknown;
}

declare module './src/skills/manager.js' {
  export interface SkillPrompt {
    name: string;
    description: string;
    prompts: string[];
    icon?: string;
    isCustom?: boolean;
    mode?: string;
  }

  export class SkillManager {
    constructor(session: unknown);
    listSkills(): Promise<SkillPrompt[]>;
    getCustomSkills(): Promise<SkillPrompt[]>;
    createSkill(name: string, options?: { description?: string; prompt?: string }): Promise<void>;
    enableSkill(name: string): Promise<boolean>;
    disableSkill(name: string): Promise<void>;
    getSkillPrompts(name: string): Promise<string[]>;
    getSkillByName(name: string): SkillPrompt | undefined;
  }
}
