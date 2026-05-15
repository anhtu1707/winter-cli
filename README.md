# Winter - Advanced AI Coding Assistant / Tro ly Lap trinh AI Nang cao

Winter is a powerful, AI-driven CLI coding assistant designed to supercharge your development workflow directly from the terminal. Inspired by state-of-the-art tools like Claude Code, Winter brings a beautiful Cyberpunk aesthetic, smart session management, and autonomous agent capabilities to your local environment.

*Winter la mot tro ly lap trinh CLI manh me duoc dieu khien boi AI, duoc thiet ke de tang toc quy trinh phat trien cua ban truc tiep tu terminal. Lay cam hung tu cac cong cu hang dau nhu Claude Code, Winter mang den giao dien Cyberpunk dep mat, quan ly phien lam viec thong minh va kha nang chay agent tu tri vao moi truong cuc bo cua ban.*


## Key Features / Tinh nang noi bat

- **Immersive Cyberpunk CLI**: Stunning ASCII art banner and intuitive terminal interface.
  *(Giao dien Cyberpunk: Banner ASCII dep mat va giao dien terminal truc quan.)*
- **Smart Session Management**: Isolated sessions with memory persistence. Resume any session anytime.
  *(Quan ly phien thong minh: Cac phien lam viec doc lap voi bo nho duoc luu tru. Tiep tuc bat ky phien nao bat cu luc nao.)*
- **Auto-Context Loading**: Automatically reads project rules from winter.md and system resources on startup.
  *(Tu dong nap ngu canh: Tu dong doc cac quy tac du an tu winter.md va tai nguyen he thong khi khoi dong.)*
- **Autonomous Agents**: Built-in Browser Subagent for web searching and complex task solving.
  *(Agent tu tri: Tich hop Browser Subagent de tim kiem web va giai quyet cac tac vu phuc tap.)*
- **Git Auto-Pilot**: Automatic commit message generation and AI-powered code reviews.
  *(Tu dong hoa Git: Tu dong tao commit message va review code bang AI.)*
- **Auto-Healing Mode**: TDD-style loop where AI runs tests and automatically fixes errors until success.
  *(Che do Tu sua loi: Vong lap kieu TDD noi AI chay test va tu dong sua loi cho den khi thanh cong.)*

## Installation / Cai dat

To install Winter globally in your system, clone the repository and run:
*De cai dat Winter tren toan he thong, hay clone repository va chay:*

```bash
npm install -g winter-super-cli@latest.
```

*(Or run directly without installation using node bin/winter.js)*
*(Hoac chay truc tiep khong can cai dat bang lenh node bin/winter.js)*

## Getting Started / Huong dan su dung

To start a new session in your current project directory:
*De bat dau mot phien lam viec moi trong thu muc du an hien tai:*

```bash
winter
```

To resume a specific session later:
*De tiep tuc mot phien lam viec cu the sau nay:*

```bash
winter --session <session-id>
```

## Project Rules (winter.md) / Quy tac du an

When you start Winter in a new project, it will automatically generate a winter.md file at the root. You can customize this file to define specific rules, tech stacks, and guidelines for the AI to follow in that specific project.

*Khi ban khoi dong Winter trong mot du an moi, no se tu dong tao file winter.md o thu muc goc. Ban co the tuy chinh file nay de dinh nghia cac quy tac, cong nghe su dung va huong dan cho AI tuan theo trong du an do.*

## Slash Commands / Cac lenh Slash

While in the REPL, you can use the following commands:
*Khi dang trong giao dien REPL, ban co the su dung cac lenh sau:*

- `/help` - Show all available commands. *(Hien thi tat ca cac lenh.)*
- `/clear` - Clear the terminal screen. *(Xoa man hinh terminal.)*
- `/commit` - Automatically generate a commit message and commit staged changes. *(Tu dong tao commit message va commit.)*
- `/review` - AI reviews your current git diff for bugs and clean code. *(AI review cac thay doi git hien tai.)*
- `/auto <task>` - Run a task in Auto-Healing mode. *(Chay tac vu trong che do tu sua loi.)*
- `/agent browser "<prompt>"` - Trigger the browser subagent to browse the web. *(Kich hoat agent duyet web.)*
- `/plans` - View or manage active execution plans. *(Xem hoac quan ly cac ke hoach thuc thi.)*
- `/forget` - Clear the current session memory. *(Xoa bo nho cua phien hien tai.)*

## Core Philosophy / Triet ly cot loi

Winter operates on three core principles:
*Winter hoat dong dua tren ba nguyen tac cot loi:*

1. **Think Before Coding**: Explicit assumptions, push back on ambiguity. *(Nghi truoc khi code: Neu ro cac gia dinh, lam ro cac diem mo ho.)*
2. **Simplicity First**: Minimum code to solve the problem, no over-engineering. *(Don gian la tren het: Viet luong code toi thieu de giai quyet van de, khong ve them viec.)*
3. **Surgical Changes**: Touch only what you must, match existing style. *(Sua doi chinh xac: Chi cham vao nhung gi can thiet, tuan thu phong cach code co san.)*

---
*Built by Atus | fb: iam.anhtu | github: anhtu1707*