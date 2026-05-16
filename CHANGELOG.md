# Changelog

All notable changes to Winter CLI will be documented in this file.

## [2026.5.26] - 2026-05-16

### Changed
- Added GitHub Actions CI workflow to run the test suite on Node.js 18 and 20.
- Tightened the Bash security blocklist so PowerShell `-Format` arguments are no longer blocked.
- Added a regression test for PowerShell `Get-Date -Format` usage.

### Added
- `CHANGELOG.md` for release tracking.
