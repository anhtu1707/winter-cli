function lines(list = []) {
  return list.filter(Boolean).join('\n');
}

const BLUEPRINTS = {
  'webapp-build': {
    stack: ['Next.js/React', 'TypeScript', 'Tailwind CSS', 'UI component system', 'Playwright/Vitest'],
    scaffold: [
      'npm create next-app@latest <app-name> --ts --eslint --src-dir --app',
      'npm install tailwindcss @types/node',
      'npm install -D vitest @testing-library/react playwright',
    ],
    architecture: [
      'Define routes/pages, data models, and API boundaries first.',
      'Set up design tokens and reusable UI primitives.',
      'Implement feature slices with tests per slice.',
    ],
    verify: ['npm run lint', 'npm run typecheck', 'npm test', 'npm run build'],
  },
  'mobile-build': {
    stack: ['React Native + Expo or Flutter', 'State management', 'Offline cache', 'Crash logging'],
    scaffold: [
      'npx create-expo-app@latest <app-name>',
      'npm install @react-navigation/native react-native-screens react-native-safe-area-context',
      'npm install @tanstack/react-query zod',
    ],
    architecture: [
      'Define app navigation graph and feature modules.',
      'Separate API client/domain logic from UI screens.',
      'Handle offline state, retry, and error boundaries early.',
    ],
    verify: ['npm run lint', 'npm test', 'npx expo-doctor'],
  },
  'desktop-build': {
    stack: ['Electron/Tauri', 'Secure local storage', 'Auto-update', 'Crash handling'],
    scaffold: [
      'npm create electron-vite@latest <app-name>',
      'npm install electron-updater keytar',
      'npm install -D vitest',
    ],
    architecture: [
      'Split main/preload/renderer responsibilities clearly.',
      'Minimize privileged IPC APIs and validate inputs.',
      'Add update strategy and rollback-safe release flow.',
    ],
    verify: ['npm run lint', 'npm test', 'npm run build'],
  },
  'backend-build': {
    stack: ['NestJS/FastAPI/Spring', 'PostgreSQL', 'Redis', 'OpenAPI', 'Auth'],
    scaffold: [
      'npx @nestjs/cli new <service-name>',
      'npm install @nestjs/swagger zod pg redis',
      'npm install -D jest supertest',
    ],
    architecture: [
      'Define domain entities and API contracts first.',
      'Implement auth, validation, and observability at baseline.',
      'Apply migration + seed strategy before feature coding.',
    ],
    verify: ['npm run lint', 'npm test', 'npm run build'],
  },
  'data-build': {
    stack: ['Airflow/dbt/Kafka/Spark', 'Data contracts', 'Quality checks', 'Lineage'],
    scaffold: [
      'Initialize pipeline repo structure: ingestion/transform/serving.',
      'Set up dbt project with tests and source freshness checks.',
      'Define schema contracts and alert thresholds.',
    ],
    architecture: [
      'Design source-to-target flow and ownership boundaries.',
      'Add idempotency and replay strategy for pipelines.',
      'Track quality SLAs and lineage metadata.',
    ],
    verify: ['data quality tests', 'pipeline dry-run', 'contract checks'],
  },
  'devops-build': {
    stack: ['Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Observability'],
    scaffold: [
      'Create Dockerfile + docker-compose for local parity.',
      'Add CI pipeline for lint/test/build/security scan.',
      'Define IaC baseline (Terraform modules + env promotion flow).',
    ],
    architecture: [
      'Separate app, infra, and release concerns.',
      'Implement immutable artifact + promotion-based deploy.',
      'Add metrics/logging/tracing before production rollout.',
    ],
    verify: ['CI lint/test/build', 'terraform validate/plan', 'deploy dry-run'],
  },
  'ai-build': {
    stack: ['RAG architecture', 'Vector DB', 'Evaluation harness', 'Prompt/version control'],
    scaffold: [
      'Create data-ingestion, retrieval, generation, and eval modules.',
      'Set up embedding pipeline + vector index lifecycle.',
      'Add regression eval suite and quality thresholds.',
    ],
    architecture: [
      'Define retrieval contracts and fallback behavior.',
      'Track prompts/models/embeddings as versioned artifacts.',
      'Add hallucination and safety guardrails by default.',
    ],
    verify: ['eval suite', 'retrieval quality checks', 'latency/cost benchmarks'],
  },
  'game-build': {
    stack: ['Unity/Unreal/Godot', 'Asset pipeline', 'Performance profiling'],
    scaffold: [
      'Create scene/module structure and gameplay loop skeleton.',
      'Set up input, state, and save/load boundaries.',
      'Add profiling baseline and frame-time budgets.',
    ],
    architecture: [
      'Separate gameplay, rendering, and data systems.',
      'Define deterministic core loop for testability.',
      'Plan content pipeline with naming/versioning conventions.',
    ],
    verify: ['play-mode tests', 'performance profile', 'build export checks'],
  },
};

export function getProfileBlueprint(profile = 'general') {
  const bp = BLUEPRINTS[profile];
  if (!bp) return null;
  return {
    ...bp,
    profile,
    asText: lines([
      `[Blueprint: ${profile}]`,
      bp.stack?.length ? `- Stack: ${bp.stack.join(', ')}` : '',
      bp.scaffold?.length ? `- Scaffold:\n${bp.scaffold.map(item => `  - ${item}`).join('\n')}` : '',
      bp.architecture?.length ? `- Architecture:\n${bp.architecture.map(item => `  - ${item}`).join('\n')}` : '',
      bp.verify?.length ? `- Verify:\n${bp.verify.map(item => `  - ${item}`).join('\n')}` : '',
    ]),
  };
}

