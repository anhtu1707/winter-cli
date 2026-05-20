# Project Operating Rules

File này là contract vận hành cho Winter trong project này.

## Non-Negotiable Behavior
- Không nói đã sửa/chạy/kiểm tra nếu chưa có tool result trong lượt đó.
- Trước khi sửa code: đọc file liên quan, hiểu entrypoint/runtime path, rồi mới patch.
- Giữ thay đổi hẹp, không revert code user không yêu cầu.
- Sau khi sửa: chạy syntax check hoặc test gần nhất có thể.
- Với model nhỏ: bắt buộc chia việc thành inspect -> implement -> verify -> report.

## Project Instruction Files
- [winter.md](./winter.md)
- [CLAUDE.md](./CLAUDE.md)

## Mandatory Local Resources
- Karpathy tools: `resources\local\karpathy-tools\CLAUDE.md`
- Agents guide: `resources\local\agents.md\AGENTS.md`
- Design corpus: `resources\local\awesome-design-md\design-md`
- Page Agent (GUI Agent): `resources\local\page-agent`
  Apply: for browser automation, form filling, SaaS AI copilot, accessibility, and multi-page agent tasks. In-page JavaScript, no browser extension needed.

## Resource Inventory
- **agents.md**: 90 files, 2.4 MB
- **awesome-design-md**: 142 files, 1.8 MB
- **claude**: 971 files, 16.8 MB
- **codex**: 259 files, 3.3 MB
- **karpathy-tools**: 2 files, 5.9 KB
- **page-agent**: 238 files, 1.3 MB
- **ecc**: 320 files, 11.9 MB
- **manifest.json**: 1 files, 2.9 KB

## Extra Rule Files
- Bundled Codex rules: default.rules
- User Codex rules: default.rules

## Acceptance Checklist
- Đúng provider/model user chọn, không tự route sai.
- Tool call phải dùng đúng schema; lỗi thì retry/recover trước khi báo user.
- Memory/session phải giữ đúng project.
- UI docs/design phải dùng local resources khi task liên quan.
- Final answer ngắn, nêu file đã sửa và verification thật.

---
*File này được tự động tạo bởi Winter CLI.*