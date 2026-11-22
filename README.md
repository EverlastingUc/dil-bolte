# HEART

**HEART** is a beginner-friendly database programming language built around clear, basic-English instructions.

Its source files use the **`.hrt`** extension.

> Make databases feel like giving simple instructions.

## Project direction

HEART is being designed as both:
- A standalone language with its own database engine.
- A language that can offer SQL compatibility as the project matures.

The long-term architecture includes a lexer, parser, query planner, execution engine, storage engine, transactions, indexes, and relational operations.

## Current status: v0.8.0 — relational data and atomic transactions

HEART currently includes:
- A JavaScript interpreter running on Node.js 20+.\n- A tokenizer (lexer), syntax parser, and AST-based interpreter pipeline.
- An in-memory engine and optional JSON-backed disk storage.
- Database and table creation.
- `text`, `number`, and `boolean` columns.
- Adding, displaying, counting, changing, and removing rows.
- Equality, inequality, numeric comparison, and text matching filters with column-type validation.
- Stable ascending and descending sorting that does not mutate stored row order.\n- Compound `AND` / `OR` filters, parentheses, and explicit operator precedence.\n- `LIMIT` and `OFFSET` pagination for table scans and filtered queries.\n- Primary-key, unique, and required-column constraints with persistent enforcement.\n- Foreign-key constraints with referential-integrity checks on inserts, updates, and deletes.\n- Inner joins between tables using an in-memory lookup index.\n- Atomic transactions with `begin`, `commit`, and `rollback` instructions.
- Table-column inspection and database listing.
- Automatic persistence in the CLI.
- A public JavaScript API exported from `src/index.js`.
- Automated tests and a Node.js 20/22/24 GitHub Actions matrix.

**Storage behavior:** the CLI saves each database under `.heart/databases/` in the current working directory. Changes are written automatically. The engine can run in memory-only mode when created without a storage directory. The JSON format is an early development format, not yet a stable interchange or backup format. Do not manually edit database files while HEART is running.

## Quick start

Requirements: Node.js 20 or newer.

```sh
npm test
npm start -- examples/school.hrt
npm start
```

The first example creates the School database; the second demonstrates foreign keys and joins in a separate University database. To reset the demos and run them again, stop HEART and remove the local `.heart/` directory.

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
change rows in Students set age = 19 where name is "Ever"
remove rows from Students where name is "Alex"
count rows in Students
show columns from Students
show databases
```

## JavaScript API

The engine and interpreter can also be imported by other Node.js programs:

```js
import { HeartEngine, HeartInterpreter } from "./src/index.js";

const engine = new HeartEngine(); // in-memory mode
const heart = new HeartInterpreter(engine);
heart.execute("make database Demo\nuse database Demo");
```

Pass `{ storageDir: "./.heart/databases" }` to `HeartEngine` to enable disk-backed storage.\n\nJoin results are returned as nested objects keyed by table name, for example `{ Students: { ... }, Enrollments: { ... } }`.

## Current command reference

| Instruction | Purpose |
|---|---|
| `make database NAME` | Create a database |
| `use database NAME` | Select a database (loads it from disk when available) |\n| `begin transaction` | Start a transaction for the active database |\n| `commit transaction` | Atomically persist the transaction |\n| `rollback transaction` | Discard all uncommitted changes |
| `show databases` | List known databases and the active one |
| `make table NAME` | Create a table |
| `add column NAME as TYPE to TABLE` | Add a typed column |\n| `add constraint primary key on TABLE COLUMN` | Set the table primary key (unique and required) |\n| `add constraint unique on TABLE COLUMN` | Reject duplicate non-null values |\n| `add constraint required on TABLE COLUMN` | Reject missing or null values |\n| `add constraint foreign key on TABLE COLUMN references OTHER_TABLE OTHER_COLUMN` | Link a column to a unique or primary-key column in another table |\n| `show constraints on TABLE` | Inspect table constraints |\n| `join TABLE with OTHER_TABLE on TABLE COLUMN equals OTHER_TABLE COLUMN` | Return matching rows from both tables as nested objects |
| `add row to TABLE field = value` | Insert a row |
| `show columns from TABLE` | Inspect table columns and types |
| `show all from TABLE` | Display every row |\n| `show all from TABLE limit N` | Return at most N rows |\n| `show all from TABLE limit N offset M` | Skip M rows, then return at most N rows |
| `find from TABLE where FIELD is VALUE` | Find rows with an exact match |
| `find from TABLE where FIELD is not VALUE` | Find rows that do not match |
| `find from TABLE where FIELD greater than VALUE` | Numeric greater-than filter |
| `find from TABLE where FIELD less than VALUE` | Numeric less-than filter |
| `find from TABLE where FIELD at least VALUE` | Numeric greater-than-or-equal filter |
| `find from TABLE where FIELD at most VALUE` | Numeric less-than-or-equal filter |
| `find from TABLE where FIELD contains VALUE` | Text substring filter |
| `find from TABLE where FIELD starts with VALUE` | Text prefix filter |
| `find from TABLE where FIELD ends with VALUE` | Text suffix filter |\n| `find from TABLE where CONDITION and CONDITION` | Require both conditions |\n| `find from TABLE where CONDITION or CONDITION` | Match either condition |\n| `find from TABLE where (CONDITION or CONDITION) and CONDITION` | Group conditions with parentheses; AND has higher precedence than OR |\n| `find from TABLE where CONDITION limit N offset M` | Paginate filtered results |
| `sort rows in TABLE by FIELD ascending` | Sort rows in ascending order |
| `sort rows in TABLE by FIELD descending` | Sort rows in descending order |
| `change rows in TABLE set field = value where FIELD is VALUE` | Change matching rows |
| `remove rows from TABLE where FIELD is VALUE` | Remove matching rows |
| `count rows in TABLE` | Count rows |

Supported column types: `text`, `number`, `boolean`. Missing fields in inserted rows are stored as `null`. Text values must be double-quoted; numbers and booleans are written directly.

Lines beginning with `#` are comments. Use one instruction per line. Identifiers that collide with JavaScript object prototype properties are reserved.

## Development principles

1. Keep the language readable for beginners.
2. Prefer clear English commands over punctuation-heavy syntax.
3. Give helpful errors that identify the source line.
4. Validate a complete operation before changing stored rows.
5. Preserve a path toward SQL compatibility without making SQL knowledge a requirement.
6. Never silently claim durability: storage writes must be tested and documented.\n7. Keep transaction boundaries explicit; database switching is prohibited during a transaction.

## Planned milestones

- [x] v0.1: interpreter, in-memory engine, core commands, CLI, tests.
- [x] v0.2 foundation: JSON persistence, automatic CLI saves, database listing.
- [x] v0.2 data operations: update, delete, count, and schema inspection.
- [x] v0.2 hardening foundation: rollback on failed writes and clear corruption diagnostics.
- [x] v0.3 query foundation: typed comparison filters, text matching, and stable sorting.
- [x] v0.3 project packaging: public JS exports, MIT license, changelog, and CI matrix.\n- [x] v0.3 language frontend: tokenizer, parser, AST nodes, and source-line diagnostics.\n- [x] v0.4 query expressions: AND, OR, parentheses, precedence, and full expression validation.\n- [x] v0.5 query pagination: LIMIT and OFFSET on table scans and filtered queries.\n- [x] v0.6 schema constraints: primary keys, unique values, required columns, and persistent validation.\n- [x] v0.7 relational foundation: foreign keys, referential integrity, and indexed inner joins.\n- [x] v0.8 transaction foundation: atomic commit, rollback, commit-failure recovery, and transaction scope.
- [ ] v0.3 follow-up: compound conditions (AND/OR), pagination, and query planning.
- [ ] v0.4: constraints, defaults, and safer schema changes.
- [ ] v0.5: table relations and joins.
- [ ] v1.0: stable engine and a documented SQL compatibility layer.

The roadmap is provisional and will evolve as the language design is tested.

## License

MIT
