# HEART

**HEART** is a beginner-friendly database programming language built around clear, basic-English instructions.

Its source files use the **`.hrt`** extension.

> Make databases feel like giving simple instructions.

## Project direction

HEART is being designed as both:
- A standalone language with its own database engine.
- A language that can offer SQL compatibility as the project matures.

The long-term plan includes a lexer, parser, query planner, execution engine, storage engine, transactions, indexes, and relational operations.

## Current status: v0.1 foundation

The first implementation is intentionally small. It includes:
- A JavaScript interpreter running on Node.js 20+.
- An in-memory database engine.
- Database and table creation.
- `text`, `number`, and `boolean` columns.
- Adding rows, showing rows, and finding rows.
- A command-line runner for `.hrt` files.
- Automated tests using Node's built-in test runner.

**Important:** v0.1 stores data in memory only. Data is lost when the process exits. Disk persistence, SQL compatibility, update/delete, joins, transactions, and indexes are not implemented yet.

## Quick start

Requirements: Node.js 20 or newer.

```sh
npm test
npm start -- examples/school.hrt
```

Run the interactive prompt:

```sh
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
```

## Current command reference

| Instruction | Purpose |
|---|---|
| `make database NAME` | Create a database |
| `use database NAME` | Select the active database |
| `make table NAME` | Create a table |
| `add column NAME as TYPE to TABLE` | Add a typed column |
| `add row to TABLE field = value` | Insert a row |
| `show all from TABLE` | Display every row |
| `find from TABLE where FIELD is VALUE` | Find matching rows |

Supported column types: `text`, `number`, `boolean`.

Lines beginning with `#` are comments. Use one instruction per line.

## Development principles

1. Keep the language readable for beginners.
2. Prefer clear English commands over punctuation-heavy syntax.
3. Give helpful errors that identify the source line.
4. Build a working foundation before adding advanced database features.
5. Preserve a path toward SQL compatibility without making SQL knowledge a requirement.

## Planned milestones

- [x] v0.1 foundation: interpreter, in-memory engine, core commands, CLI, tests.
- [ ] v0.2: persistent database files and stronger schema management.
- [ ] v0.3: richer search and filtering.
- [ ] v0.4: update and delete operations.
- [ ] v0.5: table relations and joins.
- [ ] v1.0: stable engine and a documented SQL compatibility layer.

The roadmap is provisional and will evolve as the language design is tested.

## License

MIT
