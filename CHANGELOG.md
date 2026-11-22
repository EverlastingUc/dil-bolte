# Changelog

All notable HEART changes are documented here.

## [0.3.0] - 2026-11-23

### Added
- JSON-backed database persistence for CLI usage.
- Database listing and table schema inspection.
- Row updates, row deletion, and row counts.
- Equality, inequality, numeric comparison, and text matching filters.
- Stable ascending and descending row sorting.
- Typed input validation, stored-schema validation, and rollback when disk writes fail.
- GitHub Actions test matrix for Node.js 20, 22, and 24.
- Public JavaScript entry point at src/index.js.

### Changed
- CLI stores databases under .heart/databases/.
- Local database files are excluded from Git.
- Package version advanced to 0.3.0.

## [0.1.0] - 2026-11-22

### Added
- Initial HEART interpreter and in-memory database engine.
- Database/table creation, typed columns, row insertion, row listing, and equality search.
- .hrt CLI runner, school example, and Node.js built-in tests.
