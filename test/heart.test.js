import test from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeartEngine } from "../src/engine.js";
import { HeartInterpreter } from "../src/interpreter.js";
import { HeartEngine as PublicEngine, HeartInterpreter as PublicInterpreter } from "../src/index.js";
import { tokenize } from "../src/lexer.js";
import { parseLine, parseProgram } from "../src/parser.js";

function createClassroom(heart = new HeartInterpreter()) {
  heart.execute([
    "make database School", "use database School", "make table Students",
    "add column name as text to Students", "add column age as number to Students",
    'add row to Students name = "Ever", age = 18',
    'add row to Students name = "Alex", age = 17'
  ].join("\n"));
  return heart;
}

test("creates a database, table, columns, and rows", () => {
  const heart = new HeartInterpreter();
  const output = heart.execute([
    "make database School", "use database School", "make table Students",
    "add column name as text to Students", "add column age as number to Students",
    'add row to Students name = "Ever", age = 18', "show all from Students"
  ].join("\n"));
  assert.deepEqual(output.at(-1), [{ name: "Ever", age: 18 }]);
});

test("finds rows with a matching value", () => {
  const heart = createClassroom();
  assert.deepEqual(heart.execute("find from Students where age is 18")[0], [{ name: "Ever", age: 18 }]);
});

test("reports a useful error for unknown instructions", () => {
  const heart = new HeartInterpreter();
  assert.throws(() => heart.execute("do magic"), /Line 1: I do not understand/);
});

test("persists databases and rows across engine instances", () => {
  const directory = mkdtempSync(join(tmpdir(), "heart-test-"));
  try {
    const first = new HeartInterpreter(new HeartEngine({ storageDir: directory }));
    first.execute([
      "make database School", "use database School", "make table Students",
      "add column name as text to Students", 'add row to Students name = "Ever"'
    ].join("\n"));

    const second = new HeartInterpreter(new HeartEngine({ storageDir: directory }));
    assert.deepEqual(second.execute("use database School\nshow all from Students")[1], [{ name: "Ever" }]);
    assert.deepEqual(second.execute("show databases")[0], [{ name: "School", active: true }]);
    second.execute('change rows in Students set name = "Everlasting" where name is "Ever"');
    const third = new HeartInterpreter(new HeartEngine({ storageDir: directory }));
    assert.deepEqual(third.execute(["use database School", "show all from Students"].join("\n"))[1], [{ name: "Everlasting" }]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects duplicate fields in one row", () => {
  const heart = new HeartInterpreter();
  heart.execute("make database DuplicateTest\nuse database DuplicateTest\nmake table Items\nadd column name as text to Items");
  assert.throws(() => heart.execute('add row to Items name = "A", name = "B"'), /provided more than once/);
});

test("adding a column keeps existing rows valid", () => {
  const heart = new HeartInterpreter();
  heart.execute('make database SchemaTest\nuse database SchemaTest\nmake table Items\nadd column name as text to Items\nadd row to Items name = "A"\nadd column score as number to Items');
  assert.deepEqual(heart.execute("show all from Items")[0], [{ name: "A", score: null }]);
});

test("changes every matching row and persists the new values", () => {
  const heart = createClassroom();
  assert.match(heart.execute('change rows in Students set age = 19 where name is "Ever"')[0], /1 row\(s\) changed/);
  assert.deepEqual(heart.execute("find from Students where age is 19")[0], [{ name: "Ever", age: 19 }]);
});

test("validates all changed values before modifying any row", () => {
  const heart = createClassroom();
  assert.throws(
    () => heart.execute('change rows in Students set age = 20, name = 42 where name is "Ever"'),
    /expects a text value/
  );
  assert.deepEqual(heart.execute("find from Students where name is \"Ever\"")[0], [{ name: "Ever", age: 18 }]);
});

test("removes matching rows and reports row counts", () => {
  const heart = createClassroom();
  assert.match(heart.execute('remove rows from Students where name is "Alex"')[0], /1 row\(s\) removed/);
  assert.equal(heart.execute("count rows in Students")[0], 1);
  assert.deepEqual(heart.execute("show columns from Students")[0], [
    { name: "name", type: "text" }, { name: "age", type: "number" }
  ]);
});

test("rejects a filter value with the wrong column type", () => {
  const heart = createClassroom();
  assert.throws(() => heart.execute('find from Students where age is "eighteen"'), /expects a number value/);
});

test("rejects corrupted database files with a useful error", () => {
  const directory = mkdtempSync(join(tmpdir(), "heart-corrupt-"));
  try {
    writeFileSync(join(directory, "Broken.json"), "{ this is not JSON");
    const heart = new HeartInterpreter(new HeartEngine({ storageDir: directory }));
    assert.throws(() => heart.execute("use database Broken"), /not valid JSON/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rolls back an insert when the disk write fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "heart-rollback-"));
  try {
    const engine = new HeartEngine({ storageDir: directory });
    const heart = createClassroom(new HeartInterpreter(engine));
    const blockedPath = join(directory, "not-a-directory");
    writeFileSync(blockedPath, "file");
    engine.storage.directory = blockedPath;

    assert.throws(() => heart.execute('add row to Students name = "Sam", age = 16'), /Could not save database/);
    assert.equal(heart.execute("count rows in Students")[0], 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("supports numeric comparison operators", () => {
  const heart = createClassroom();
  assert.deepEqual(heart.execute("find from Students where age greater than 17")[0], [{ name: "Ever", age: 18 }]);
  assert.deepEqual(heart.execute("find from Students where age at most 17")[0], [{ name: "Alex", age: 17 }]);
  assert.deepEqual(heart.execute("find from Students where age is not 18")[0], [{ name: "Alex", age: 17 }]);
});

test("supports text contains, starts with, and ends with filters", () => {
  const heart = createClassroom();
  assert.deepEqual(heart.execute('find from Students where name contains "ve"')[0], [{ name: "Ever", age: 18 }]);
  assert.deepEqual(heart.execute('find from Students where name starts with "A"')[0], [{ name: "Alex", age: 17 }]);
  assert.deepEqual(heart.execute('find from Students where name ends with "x"')[0], [{ name: "Alex", age: 17 }]);
});

test("sorts rows without changing the stored row order", () => {
  const heart = createClassroom();
  assert.deepEqual(heart.execute("sort rows in Students by age descending")[0], [
    { name: "Ever", age: 18 }, { name: "Alex", age: 17 }
  ]);
  assert.deepEqual(heart.execute("show all from Students")[0], [
    { name: "Ever", age: 18 }, { name: "Alex", age: 17 }
  ]);
});

test("rejects numeric comparisons on text columns", () => {
  const heart = createClassroom();
  assert.throws(() => heart.execute('find from Students where name greater than "Alex"'), /requires a number column/);
});

test("rejects prototype-sensitive identifiers", () => {
  const heart = new HeartInterpreter();
  assert.throws(() => heart.execute("make database Safe\nuse database Safe\nmake table Items\nadd column constructor as text to Items"), /Invalid column name/);
});

test("exports the public engine and interpreter API", () => {
  const interpreter = new PublicInterpreter(new PublicEngine());
  assert.deepEqual(interpreter.execute("make database PublicApi"), ['Database "PublicApi" created.']);
});

test("runs the example through the CLI and reloads its saved database", () => {
  const directory = mkdtempSync(join(tmpdir(), "heart-cli-"));
  try {
    const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
    const examplePath = fileURLToPath(new URL("../examples/school.hrt", import.meta.url));
    const created = spawnSync(process.execPath, [cliPath, examplePath], { cwd: directory, encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /1 row\(s\) removed/);
    const reopened = spawnSync(process.execPath, [cliPath], {
      cwd: directory,
      input: ["use database School", "count rows in Students", "exit"].join("\n"),
      encoding: "utf8"
    });
    assert.equal(reopened.status, 0, reopened.stderr);
    assert.match(reopened.stdout, /heart> 1/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tokenizes strings with escaped quotes, numbers, booleans, and punctuation", () => {
  assert.deepEqual(tokenize('name = "A, \\"B\\"" , score = -2.5, active = true'), [
    { type: "identifier", value: "name" }, { type: "=", value: "=" },
    { type: "string", value: 'A, "B"' }, { type: ",", value: "," },
    { type: "identifier", value: "score" }, { type: "=", value: "=" },
    { type: "number", value: -2.5 }, { type: ",", value: "," },
    { type: "identifier", value: "active" }, { type: "=", value: "=" },
    { type: "boolean", value: true }
  ]);
});

test("parses HEART instructions into abstract syntax tree nodes", () => {
  assert.deepEqual(parseLine('find from Students where age greater than 17'), {
    type: "findRows", table: "Students", column: "age", operator: "greater than", value: 17
  });
  assert.deepEqual(parseLine('add row to Students name = "Ever", age = 18'), {
    type: "addRow", table: "Students", values: { name: "Ever", age: 18 }
  });
});

test("parses an entire source program and preserves line numbers", () => {
  assert.deepEqual(parseProgram(["# comment", "make database School", "", "use database School"].join("\n")), [
    { type: "makeDatabase", name: "School", line: 2 },
    { type: "useDatabase", name: "School", line: 4 }
  ]);
});

test("reports lexer and parser errors with source line numbers", () => {
  assert.throws(() => parseProgram(["make database Demo", 'add row to Items name = "unfinished'].join("\n")), /Line 2: Unterminated text value/);
  assert.throws(() => parseLine("make database"), /Expected a name/);
});

test("parses update assignments separately from their WHERE clause", () => {
  const ast = parseLine('change rows in Students set name = "Everlasting", age = 19 where name is "Ever"');
  assert.deepEqual(ast, {
    type: "changeRows", table: "Students",
    changes: { name: "Everlasting", age: 19 },
    column: "name", value: "Ever"
  });
});
