import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeartEngine } from "../src/engine.js";
import { HeartInterpreter } from "../src/interpreter.js";

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
