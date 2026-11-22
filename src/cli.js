#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { HeartEngine } from "./engine.js";
import { HeartInterpreter } from "./interpreter.js";

const storageDir = resolve(process.cwd(), ".heart", "databases");

function createInterpreter() {
  return new HeartInterpreter(new HeartEngine({ storageDir }));
}

function printResults(results) {
  for (const result of results) {
    console.log(Array.isArray(result) ? JSON.stringify(result, null, 2) : result);
  }
}

async function runFile(filePath) {
  if (!filePath.endsWith(".hrt")) throw new Error("HEART source files must use the .hrt extension.");
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(resolve(filePath), "utf8");
  printResults(createInterpreter().execute(source));
}

async function runPrompt() {
  const interpreter = createInterpreter();
  const prompt = createInterface({ input: process.stdin, output: process.stdout, prompt: "heart> " });
  console.log("HEART v0.3.0 — databases are saved automatically; type one instruction per line; type exit to quit.");
  prompt.prompt();
  for await (const line of prompt) {
    if (line.trim().toLowerCase() === "exit") break;
    if (line.trim()) {
      try {
        printResults(interpreter.execute(line));
      } catch (error) {
        console.error(error.message);
      }
    }
    prompt.prompt();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    if (process.argv[2]) await runFile(process.argv[2]);
    else await runPrompt();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
