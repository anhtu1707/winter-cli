import test from 'node:test';
import assert from 'node:assert/strict';

import { selectWorkflow } from './workflow-selector.js';

test('selectWorkflow recommends webapp UI skills for resort review app idea', () => {
  const workflow = selectWorkflow({
    taskText: 'Tạo một dự án webapp review resort, UI đẹp, responsive, dùng React',
    projectSignals: ['node', 'react', 'tsx'],
    skillCatalog: [
      'coding',
      'debug',
      'test',
      'design',
      'frontend-design',
      'web-design-guidelines',
      'vercel-react-best-practices',
    ],
  });

  assert.equal(workflow.profile, 'webapp-build');
  assert(workflow.recommendedSkills.includes('frontend-design'));
  assert(workflow.recommendedSkills.includes('web-design-guidelines'));
  assert(workflow.recommendedSkills.includes('vercel-react-best-practices'));
  assert(workflow.recommendedResources.includes('awesome-design-md'));
});

test('selectWorkflow recommends mobile profile for react native apps', () => {
  const workflow = selectWorkflow({
    taskText: 'Làm app mobile review resort bằng React Native (Expo), cần plan + debug tốt',
    projectSignals: ['expo', 'react-native'],
    skillCatalog: ['coding', 'debug', 'test', 'design', 'frontend-design', 'web-design-guidelines', 'security', 'performance'],
  });

  assert.equal(workflow.profile, 'mobile-debug');
  assert(workflow.recommendedSkills.includes('debug'));
  assert(workflow.recommendedSkills.includes('security'));
});

test('selectWorkflow recommends desktop profile for electron apps', () => {
  const workflow = selectWorkflow({
    taskText: 'Tạo ứng dụng desktop quản lý resort bằng Electron, cần UI đẹp',
    projectSignals: ['electron', 'node'],
    skillCatalog: ['coding', 'debug', 'test', 'design', 'frontend-design', 'web-design-guidelines', 'security', 'performance'],
  });

  assert.equal(workflow.profile, 'desktop-build');
  assert(workflow.recommendedSkills.includes('design'));
});

test('selectWorkflow recommends backend profile for api tasks', () => {
  const workflow = selectWorkflow({
    taskText: 'Thiết kế backend API cho resort review, có auth, database postgres',
    projectSignals: ['node', 'postgres'],
    skillCatalog: ['coding', 'debug', 'test', 'security', 'performance'],
  });

  assert.equal(workflow.profile, 'backend-build');
  assert(workflow.recommendedSkills.includes('security'));
});

test('selectWorkflow supports devops and data engineering technology analysis', () => {
  const workflow = selectWorkflow({
    taskText: 'Thiết kế pipeline data với Kafka + Spark + Airflow và CI/CD Docker Kubernetes Terraform',
    projectSignals: ['kafka', 'spark', 'airflow', 'docker', 'kubernetes', 'terraform'],
    skillCatalog: ['coding', 'debug', 'test', 'security', 'performance'],
  });

  assert.equal(workflow.profile, 'data-build');
  assert.equal(workflow.detectedTechnologies.data, true);
  assert.equal(workflow.detectedTechnologies.devops, true);
  assert(workflow.technologySuggestions.some(item => item.includes('Airflow')));
  assert(workflow.verificationStrategy.includes('data quality tests'));
});

test('selectWorkflow supports ai engineering tasks', () => {
  const workflow = selectWorkflow({
    taskText: 'Xây hệ thống RAG với embeddings, vector db và mcp tools',
    projectSignals: ['embedding', 'mcp'],
    skillCatalog: ['coding', 'debug', 'test'],
  });

  assert.equal(workflow.profile, 'ai-build');
  assert.equal(workflow.detectedTechnologies.ai, true);
  assert(workflow.technologySuggestions.some(item => item.includes('RAG')));
});

