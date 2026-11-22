# Changelog

## [0.6.0] - 2026-11-23

### Added
- Primary-key, unique, and required-column constraints.
- Constraint inspection through HEART instructions.
- Constraint enforcement during inserts and updates.
- Existing-row validation before adding constraints.
- Persistent constraint metadata and validation when loading database files.


## [0.5.0] - 2026-11-23

### Added
- LIMIT and OFFSET clauses for table scans and filtered queries.
- Validation for duplicate, negative, fractional, and unsafe pagination values.


## [0.4.0] - 2026-11-23

### Added
- Dedicated tokenizer and parser that produce line-numbered AST nodes.
- AST-based interpreter execution.
- Compound WHERE expressions with AND, OR, parentheses, and explicit precedence.
- Full expression validation before row evaluation.


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
