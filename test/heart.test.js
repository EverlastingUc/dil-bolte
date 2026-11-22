import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeartEngine } from "../src/engine.js";
import { HeartInterpreter } from "../src/interpreter.js";

test("creates a database, table, columns, and rows", () => {
  const heart = new HeartInterpreter();
  const output = heart.execute([
    "make database School",
    "use database School",
    "make table Students",
    "add column name as text to Students",
    "add column age as number to Students",
    'add row to Students name = "Ever", age = 18',
    "show all from Students"
  ].join("\n"));
  assert.deepEqual(output.at(-1), [{ name: "Ever", age: 18 }]);
});

test("finds rows with a matching value", () => {
  const heart = new HeartInterpreter();
  heart.execute([
    "make database School", "use database School", "make table Students",
    "add column age as number to Students", "add row to Students age = 18", "add row to Students age = 17"
  ].join("\n"));
  assert.deepEqual(heart.execute("find from Students where age is 18")[0], [{ age: 18 }]);
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
