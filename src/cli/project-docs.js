import { promises as fs } from 'fs';
import path from 'path';

const GENERATED_MARKER = 'File này được tự động tạo bởi Winter CLI.';

const CORE_SKILLS = [
  ['coding', 'Inspect source first, make focused code changes, and verify syntax/tests.'],
  ['debug', 'Trace the concrete failing path, explain the first hard blocker, then patch it.'],
  ['design', 'Use awesome-design-md before inventing UI style, spacing, or brand language.'],
  ['refactor', 'Keep behavior stable while reducing complexity in small, reviewable steps.'],
  ['test', 'Add regression coverage near the changed behavior and run the narrow test first.'],
  ['security', 'Protect secrets, validate inputs, avoid unsafe shell/file operations.'],
  ['performance', 'Measure or reason from the hot path before optimizing.'],
];

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

async function listEntries(target, { directories = true, files = false, limit = 100 } = {}) {
  try {
    const entries = await fs.readdir(target, { withFileTypes: true });
    return entries
      .filter(entry => (directories && entry.isDirectory()) || (files && entry.isFile()))
      .map(entry => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function getResource(manifest, name) {
  return (manifest?.localResources || []).find(resource => resource.name === name);
}

function bulletList(items, emptyText) {
  if (!items.length) return `- ${emptyText}`;
  return items.map(item => `- ${item}`).join('\n');
}

function generatedFooter() {
  return `---\n*${GENERATED_MARKER}*`;
}

export function isWinterGeneratedProjectDoc(content = '') {
  return /File n(?:ày|Ã y) .*Winter CLI/i.test(content)
    || /được tự động tạo bởi Winter CLI/i.test(content)
    || /Ä‘Æ°á»£c tá»± Ä‘á»™ng táº¡o bá»Ÿi Winter CLI/i.test(content);
}

export async function buildDesignDoc({ projectPath, resourcePaths }) {
  const manifest = await readJsonIfExists(resourcePaths.manifest);
  const designResource = getResource(manifest, 'awesome-design-md');
  const brandNames = await listEntries(resourcePaths.designs, { directories: true, limit: 40 });
  const relativeDesignPath = path.relative(projectPath, resourcePaths.designs) || resourcePaths.designs;
  const relativeReadmePath = path.join(path.relative(projectPath, path.dirname(resourcePaths.designs)), 'README.md');
  const corpusStatus = brandNames.length > 0
    ? `Corpus local sẵn sàng tại \`${relativeDesignPath}\`.`
    : 'Corpus chi tiết chưa có trong working tree hiện tại. Dùng manifest để biết index, hoặc cài/copy resource pack đầy đủ trước khi làm UI/brand task.';

  return `# Design Guidance

File này không phải danh bạ trang trí. Đây là checklist bắt buộc khi Winter xử lý UI, brand, landing page, dashboard, hoặc component.

## Resource Status
- Source: \`${relativeReadmePath}\`
- Corpus: \`${relativeDesignPath}\`
- Manifest: ${designResource ? `${designResource.files} files, ${formatBytes(designResource.bytes)}` : 'không có entry awesome-design-md'}
- Status: ${corpusStatus}

## How Winter Must Use This
1. Khi task liên quan UI/design/brand, tìm brand hoặc style gần nhất trong \`awesome-design-md/design-md\` trước khi viết code.
2. Nếu user nêu brand cụ thể, ưu tiên đúng brand đó; nếu không có, chọn brand gần nhất theo domain và nói rõ giả định.
3. Không tự bịa palette, spacing, typography, tone khi local design guide có dữ liệu phù hợp.
4. Với app/work tool, ưu tiên layout rõ, dense, dễ scan; không dùng hero marketing nếu user đang cần tool thật.
5. Sau khi sửa UI, kiểm tra responsive và text overflow nếu có thể chạy app.

## Available Brand Samples (${brandNames.length}${brandNames.length >= 40 ? '+' : ''})
${bulletList(brandNames, 'Chưa tìm thấy brand folder trong working tree hiện tại.')}

## Useful Commands
- \`/designs\` để liệt kê hoặc tìm design systems.
- \`/read resources/local/awesome-design-md/README.md\` để đọc overview.
- \`/grep <brand> resources/local/awesome-design-md/design-md\` để tìm brand/style guide.

${generatedFooter()}`;
}

export async function buildSkillDoc({ contextLoader }) {
  const catalog = await contextLoader.getStartupSkillCatalog();
  const skills = [...catalog]
    .filter(skill => skill && !skill.startsWith('.'))
    .sort((a, b) => a.localeCompare(b));

  return `# Skill Guidance

File này định nghĩa cách Winter chọn và áp dụng skill. Không chỉ liệt kê tên skill.

## Default Rule
- Luôn đọc yêu cầu, repo context, và file liên quan trước khi quyết định skill.
- Skill là operational context: áp dụng vào hành động thật, không chỉ nhắc lại trong câu trả lời.
- Model nhỏ vẫn phải theo cùng tiêu chuẩn: inspect, edit bằng tool, verify, rồi mới kết luận.

## Core Skills
${CORE_SKILLS.map(([name, description]) => `- **${name}**: ${description}`).join('\n')}

## Available Local Skills (${skills.length})
${bulletList(skills, 'Chưa tìm thấy skill local ngoài core skills.')}

## When To Apply
- Code change: coding + test, thêm debug nếu có lỗi cụ thể.
- UI/page/component: design + coding + test.
- Bug/runtime log: debug trước, coding sau.
- Refactor lớn: refactor + test, giữ behavior stable.
- Security/config/secret: security bắt buộc.
- Performance/flicker/slow tool call: performance + debug.

${generatedFooter()}`;
}

export async function buildRuleDoc({ projectPath, resourcePaths, userResourcePaths, readProjectInstructionFiles }) {
  const manifest = await readJsonIfExists(resourcePaths.manifest);
  const resources = manifest?.localResources || [];
  const instructionFiles = (await readProjectInstructionFiles())
    .map(file => file.relativePath)
    .filter(relativePath => relativePath !== 'rule.md');
  const bundledRuleFiles = await listEntries(resourcePaths.codex.rules, { directories: false, files: true, limit: 30 });
  const userRuleFiles = await listEntries(userResourcePaths?.codexRules, { directories: false, files: true, limit: 30 });
  const karpathyPath = path.relative(projectPath, path.join(resourcePaths.karpathy, 'CLAUDE.md'));
  const agentsPath = path.relative(projectPath, path.join(resourcePaths.agents, 'AGENTS.md'));

  return `# Project Operating Rules

File này là contract vận hành cho Winter trong project này.

## Non-Negotiable Behavior
- Không nói đã sửa/chạy/kiểm tra nếu chưa có tool result trong lượt đó.
- Trước khi sửa code: đọc file liên quan, hiểu entrypoint/runtime path, rồi mới patch.
- Giữ thay đổi hẹp, không revert code user không yêu cầu.
- Sau khi sửa: chạy syntax check hoặc test gần nhất có thể.
- Với model nhỏ: bắt buộc chia việc thành inspect -> implement -> verify -> report.

## Project Instruction Files
${instructionFiles.length ? instructionFiles.map(file => `- [${file}](./${file})`).join('\n') : '- Chưa có instruction file khác.'}

## Mandatory Local Resources
- Karpathy tools: \`${karpathyPath}\`
- Agents guide: \`${agentsPath}\`
- Design corpus: \`${path.relative(projectPath, resourcePaths.designs)}\`

## Resource Inventory
${resources.length ? resources.map(resource => `- **${resource.name}**: ${resource.files} files, ${formatBytes(resource.bytes)}`).join('\n') : '- Không đọc được manifest resource.'}

## Extra Rule Files
- Bundled Codex rules: ${bundledRuleFiles.length ? bundledRuleFiles.join(', ') : 'none found'}
- User Codex rules: ${userRuleFiles.length ? userRuleFiles.join(', ') : 'none found'}

## Acceptance Checklist
- Đúng provider/model user chọn, không tự route sai.
- Tool call phải dùng đúng schema; lỗi thì retry/recover trước khi báo user.
- Memory/session phải giữ đúng project.
- UI docs/design phải dùng local resources khi task liên quan.
- Final answer ngắn, nêu file đã sửa và verification thật.

${generatedFooter()}`;
}

export async function buildProjectDocs(options) {
  return [
    { filename: 'design.md', content: await buildDesignDoc(options) },
    { filename: 'skill.md', content: await buildSkillDoc(options) },
    { filename: 'rule.md', content: await buildRuleDoc(options) },
  ];
}
