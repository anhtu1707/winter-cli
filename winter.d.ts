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
