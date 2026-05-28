# Skill Guidance

File này định nghĩa cách Winter chọn và áp dụng skill. Không chỉ liệt kê tên skill.

## Default Rule
- Luôn đọc yêu cầu, repo context, và file liên quan trước khi quyết định skill.
- Skill là operational context: áp dụng vào hành động thật, không chỉ nhắc lại trong câu trả lời.
- Model nhỏ vẫn phải theo cùng tiêu chuẩn: inspect, edit bằng tool, verify, rồi mới kết luận.

## Core Skills
- **coding**: Inspect source first, make focused code changes, and verify syntax/tests.
- **debug**: Trace the concrete failing path, explain the first hard blocker, then patch it.
- **design**: Use awesome-design-md before inventing UI style, spacing, or brand language.
- **refactor**: Keep behavior stable while reducing complexity in small, reviewable steps.
- **test**: Add regression coverage near the changed behavior and run the narrow test first.
- **security**: Protect secrets, validate inputs, avoid unsafe shell/file operations.
- **performance**: Measure or reason from the hot path before optimizing.

## Available Local Skills (48)
- claude-code
- codebase-inspection
- codex
- codex-primary-runtime
- coding
- debug
- debugging-hermes-tui-commands
- DESCRIPTION
- design
- github-auth
- github-code-review
- github-issues
- github-pr-workflow
- github-repo-management
- gsap
- gsap-core
- gsap-frameworks
- gsap-performance
- gsap-plugins
- gsap-react
- gsap-scrolltrigger
- gsap-timeline
- gsap-utils
- hermes-agent
- hermes-agent-skill-authoring
- hermes-s6-container-supervision
- kanban-codex-lane
- learned
- llms.txt
- native-mcp
- node-inspect-debugger
- opencode
- performance
- plan
- python-debugpy
- refactor
- requesting-code-review
- security
- skill-creator
- spike
- subagent-driven-development
- systematic-debugging
- test
- test-driven-development
- vercel-react-best-practices
- vibefigma
- web-design-guidelines
- writing-plans

## When To Apply
- Code change: coding + test, thêm debug nếu có lỗi cụ thể.
- UI/page/component: design + coding + test.
- Bug/runtime log: debug trước, coding sau.
- Refactor lớn: refactor + test, giữ behavior stable.
- Security/config/secret: security bắt buộc.
- Performance/flicker/slow tool call: performance + debug.

---
*File này được tự động tạo bởi Winter CLI.*