#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { HeartInterpreter } from "./interpreter.js";

async function runFile(filePath) {
  if (!filePath.endsWith(".hrt")) throw new Error("HEART source files must use the .hrt extension.");
  const source = await readFile(resolve(filePath), "utf8");
  const interpreter = new HeartInterpreter();
  for (const result of interpreter.execute(source)) {
    console.log(Array.isArray(result) ? JSON.stringify(result, null, 2) : result);
  }
}

async function runPrompt() {
  const interpreter = new HeartInterpreter();
  const prompt = createInterface({ input: process.stdin, output: process.stdout, prompt: "heart> " });
  console.log("HEART v0.1 — type one instruction per line; type exit to quit.");
  prompt.prompt();
  for await (const line of prompt) {
    if (line.trim().toLowerCase() === "exit") break;
    if (line.trim()) {
      try {
        const results = interpreter.execute(line);
        for (const result of results) console.log(Array.isArray(result) ? JSON.stringify(result, null, 2) : result);
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
