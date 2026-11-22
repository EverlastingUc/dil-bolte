# HEART

**HEART** is a beginner-friendly database programming language built around clear, basic-English instructions.

Its source files use the **`.hrt`** extension.

> Make databases feel like giving simple instructions.

## Project direction

HEART is being designed as both:
- A standalone language with its own database engine.
- A language that can offer SQL compatibility as the project matures.

The long-term architecture includes a lexer, parser, query planner, execution engine, storage engine, transactions, indexes, and relational operations.

## Current status: v0.2 — persistent storage foundation

HEART currently includes:
- A JavaScript interpreter running on Node.js 20+.
- A database engine with optional disk-backed storage.
- Database and table creation.
- `text`, `number`, and `boolean` columns.
- Adding rows, showing rows, and equality searches.
- Database listing.
- Automatic JSON persistence for the CLI.
- A command-line runner for `.hrt` files.
- Automated tests using Node's built-in test runner.

**Storage behavior:** the CLI saves each database under `.heart/databases/` in the current working directory. Database changes are written automatically. The engine can still run in memory-only mode when created without a storage directory. The JSON format is an early development format, not yet a stable interchange or backup format. Do not manually edit database files while HEART is running.

## Quick start

Requirements: Node.js 20 or newer.

```sh
npm test
npm start -- examples/school.hrt
npm start
```

## First HEART program

```heart
make database School
use database School

make table Students
add column name as text to Students
add column age as number to Students
add column active as boolean to Students

add row to Students name = "Ever", age = 18, active = true
show all from Students
find from Students where age is 18
show databases
```

## Current command reference

| Instruction | Purpose |
|---|---|
| `make database NAME` | Create a database |
| `use database NAME` | Select a database (loads it from disk when available) |
| `show databases` | List known databases and the active one |
| `make table NAME` | Create a table |
| `add column NAME as TYPE to TABLE` | Add a typed column |
| `add row to TABLE field = value` | Insert a row |
| `show all from TABLE` | Display every row |
| `find from TABLE where FIELD is VALUE` | Find matching rows |

Supported column types: `text`, `number`, `boolean`. Missing fields in an inserted row are stored as `null`.

Lines beginning with `#` are comments. Use one instruction per line.

## Development principles

1. Keep the language readable for beginners.
2. Prefer clear English commands over punctuation-heavy syntax.
3. Give helpful errors that identify the source line.
4. Build a working foundation before adding advanced database features.
5. Preserve a path toward SQL compatibility without making SQL knowledge a requirement.
6. Never silently claim durability: storage writes must be tested and documented.

## Planned milestones

- [x] v0.1: interpreter, in-memory engine, core commands, CLI, tests.
- [x] v0.2 foundation: JSON disk persistence, automatic CLI saves, database listing.
- [ ] v0.2 hardening: recovery, corruption diagnostics, schema validation, storage tests on Windows.
- [ ] v0.3: richer filtering and comparison operators.
- [ ] v0.4: update and delete operations.
- [ ] v0.5: table relations and joins.
- [ ] v1.0: stable engine and a documented SQL compatibility layer.

The roadmap is provisional and will evolve as the language design is tested.

## License

MIT
