import { classifyTask, TASK_CATEGORIES, TASK_TYPES } from './prompts/task-classifier.js';

function hasAny(text, keywords) {
  return keywords.some(kw => text.includes(kw));
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

function detectTechnology(text, signals) {
  const hasSignal = (regex) => [...signals].some(s => regex.test(s));

  return {
    web: hasAny(text, ['webapp', 'web app', 'website', 'landing page', 'dashboard', 'frontend', 'trang web']) || hasSignal(/(next|react|vite|vue|svelte|angular|nuxt|remix)/),
    mobile: hasAny(text, ['mobile app', 'app mobile', 'react native', 'expo', 'flutter', 'ios', 'android', 'ứng dụng di động']) || hasSignal(/(react-native|expo|flutter|swift|kotlin)/),
    desktop: hasAny(text, ['desktop app', 'ứng dụng desktop', 'electron', 'tauri', 'wpf', 'winforms', 'qt']) || hasSignal(/(electron|tauri|wpf|winforms|qt)/),
    backend: hasAny(text, ['backend', 'api', 'server', 'microservice', 'graphql', 'rest', 'auth', 'database']) || hasSignal(/(express|nestjs|fastapi|spring|django|laravel|rails|go|gin)/),
    data: hasAny(text, ['etl', 'pipeline', 'data warehouse', 'analytics', 'bi', 'spark', 'kafka', 'airflow', 'dbt']) || hasSignal(/(spark|kafka|airflow|dbt|pandas|warehouse|bigquery|snowflake)/),
    devops: hasAny(text, ['devops', 'ci/cd', 'docker', 'kubernetes', 'helm', 'terraform', 'ansible', 'deployment']) || hasSignal(/(docker|k8s|kubernetes|helm|terraform|github-actions|gitlab-ci)/),
    game: hasAny(text, ['game', 'unity', 'unreal', 'godot', 'multiplayer']) || hasSignal(/(unity|unreal|godot)/),
    ai: hasAny(text, ['ai agent', 'llm', 'rag', 'embedding', 'inference', 'model serving', 'mcp']) || hasSignal(/(langchain|llamaindex|embedding|transformer|onnx|mcp)/),
  };
}

function buildTechnologySuggestions(tech) {
  const suggestions = [];
  if (tech.web) suggestions.push('Web: React/Next.js/Vite, Tailwind CSS, shadcn/ui, Playwright');
  if (tech.mobile) suggestions.push('Mobile: React Native + Expo hoặc Flutter, offline cache, crash analytics');
  if (tech.desktop) suggestions.push('Desktop: Electron hoặc Tauri, auto-update, secure local storage');
  if (tech.backend) suggestions.push('Backend: NestJS/FastAPI/Spring, PostgreSQL/Redis, OpenAPI, auth (JWT/OAuth2)');
  if (tech.data) suggestions.push('Data: Airflow/dbt/Kafka/Spark, data contracts, quality checks');
  if (tech.devops) suggestions.push('DevOps: Docker + CI/CD + IaC (Terraform), observability/logging');
  if (tech.game) suggestions.push('Game: Unity/Unreal/Godot, profiling, asset pipeline');
  if (tech.ai) suggestions.push('AI: RAG pipeline, vector DB, evals, prompt/version control');
  return suggestions;
}

function buildVerificationStrategy(tech, taskInfo) {
  const checks = ['unit tests'];
  if (tech.web || tech.mobile || tech.desktop) checks.push('UI smoke tests');
  if (tech.backend) checks.push('API integration tests');
  if (tech.data) checks.push('data quality tests');
  if (tech.devops) checks.push('build + deploy dry-run checks');
  if (taskInfo.category === TASK_CATEGORIES.DEBUG) checks.push('reproduce bug before and after fix');
  return uniq(checks);
}

export function selectWorkflow({ taskText = '', projectSignals = [], skillCatalog = [] } = {}) {
  const text = String(taskText || '').toLowerCase();
  const signals = new Set((projectSignals || []).map(s => String(s || '').toLowerCase()));
  const catalog = new Set((skillCatalog || []).map(s => String(s || '')));

  const taskInfo = classifyTask(text);
  const tech = detectTechnology(text, signals);

  const recommendedSkills = [];
  const recommendedPlugins = [];
  const recommendedRules = [];
  const recommendedResources = [];

  // Base skills for any non-trivial task
  recommendedSkills.push('coding');
  if ([TASK_CATEGORIES.DEBUG, TASK_CATEGORIES.TEST, TASK_CATEGORIES.REVIEW].includes(taskInfo.category)) {
    recommendedSkills.push('debug', 'test');
  }
  if ([TASK_CATEGORIES.REFACTOR].includes(taskInfo.category)) {
    recommendedSkills.push('refactor', 'test');
  }
  if ([TASK_CATEGORIES.PLAN, TASK_CATEGORIES.GENERATE].includes(taskInfo.category)) {
    recommendedSkills.push('coding', 'test');
  }

  const wantsUiWork = taskInfo.category === TASK_CATEGORIES.UI || taskInfo.category === TASK_CATEGORIES.DESIGN;
  const anyUiProduct = wantsUiWork || tech.web || tech.mobile || tech.desktop;

  if (anyUiProduct) {
    recommendedSkills.push('design', 'frontend-design', 'web-design-guidelines');
    recommendedResources.push('awesome-design-md');
  }
  if (tech.web) {
    recommendedSkills.push('vercel-react-best-practices');
  }

  if (tech.mobile) {
    recommendedSkills.push('debug', 'test', 'performance', 'security');
  }

  if (tech.desktop) {
    recommendedSkills.push('debug', 'test', 'performance', 'security');
  }

  if (tech.backend) {
    recommendedSkills.push('security', 'performance', 'test');
  }
  if (tech.data) {
    recommendedSkills.push('performance', 'test');
  }
  if (tech.devops) {
    recommendedSkills.push('security', 'performance', 'test');
  }
  if (tech.ai) {
    recommendedSkills.push('coding', 'debug', 'test');
    recommendedResources.push('ecc');
  }

  // When user mentions browser automation or interacting with websites, point at page-agent
  if (hasAny(text, ['browser', 'automation', 'crawl', 'scrape', 'form fill', 'e2e', 'playwright', 'selenium', 'page agent'])) {
    recommendedResources.push('page-agent');
    recommendedPlugins.push('page-agent');
  }

  // Required rule families (already injected by ContextLoader); we keep them as explicit reminders.
  recommendedRules.push('Required Local Resource Rules');
  recommendedRules.push('Project instruction files (winter.md / CLAUDE.md / rule.md / design.md / skill.md)');

  const filteredSkills = uniq(recommendedSkills).filter(skill => catalog.size === 0 || catalog.has(skill));

  // Execution profile: guide agent depth and verification intensity
  const depth = taskInfo.type === TASK_TYPES.DEEP || taskInfo.type === TASK_TYPES.COMPLEX ? 'deep' : 'standard';
  const isDebug = taskInfo.category === TASK_CATEGORIES.DEBUG;
  // IMPORTANT: prefer platform-specific app types over generic signals.
  const profile = tech.mobile
    ? (isDebug ? 'mobile-debug' : 'mobile-build')
    : tech.desktop
      ? (isDebug ? 'desktop-debug' : 'desktop-build')
      : tech.web
        ? (isDebug ? 'webapp-debug' : 'webapp-build')
        : tech.backend
          ? (isDebug ? 'backend-debug' : 'backend-build')
          : tech.data
            ? (isDebug ? 'data-debug' : 'data-build')
            : tech.devops
              ? (isDebug ? 'devops-debug' : 'devops-build')
              : tech.game
                ? (isDebug ? 'game-debug' : 'game-build')
                : tech.ai
                  ? (isDebug ? 'ai-debug' : 'ai-build')
          : (isDebug ? 'debug' : 'general');

  return {
    taskInfo,
    profile,
    depth,
    detectedTechnologies: tech,
    technologySuggestions: buildTechnologySuggestions(tech),
    verificationStrategy: buildVerificationStrategy(tech, taskInfo),
    recommendedSkills: filteredSkills,
    recommendedPlugins: uniq(recommendedPlugins),
    recommendedRules: uniq(recommendedRules),
    recommendedResources: uniq(recommendedResources),
  };
}

