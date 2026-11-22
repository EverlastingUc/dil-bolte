import test from "node:test";
import assert from "node:assert/strict";
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
    "make database School",
    "use database School",
    "make table Students",
    "add column age as number to Students",
    "add row to Students age = 18",
    "add row to Students age = 17"
  ].join("\n"));

  assert.deepEqual(heart.execute("find from Students where age is 18")[0], [{ age: 18 }]);
});

test("reports a useful error for unknown instructions", () => {
  const heart = new HeartInterpreter();
  assert.throws(() => heart.execute("do magic"), /Line 1: I do not understand/);
});
