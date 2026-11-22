import { HeartEngine } from "./engine.js";

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  throw new Error(`Invalid value "${value}". Use quoted text, a number, true, or false.`);
}

function parseAssignments(source) {
  const result = {};
  const pattern = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("(?:[^"\\\\]|\\\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?|true|false)/gy;
  let position = 0;
  while (position < source.length) {
    while (source[position] === " " || source[position] === ",") position++;
    if (position >= source.length) break;
    pattern.lastIndex = position;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Could not read a field assignment near "${source.slice(position)}".`);
    result[match[1]] = parseValue(match[2]);
    position = pattern.lastIndex;
  }
  return result;
}

export class HeartInterpreter {
  constructor(engine = new HeartEngine()) {
    this.engine = engine;
  }

  execute(source) {
    const output = [];
    for (const [index, originalLine] of source.split(/\r?\n/).entries()) {
      const line = originalLine.trim();
      if (!line || line.startsWith("#")) continue;
      try {
        output.push(this.#executeLine(line));
      } catch (error) {
        throw new Error(`Line ${index + 1}: ${error.message}`, { cause: error });
      }
    }
    return output;
  }

  #executeLine(line) {
    let match;
    if ((match = line.match(/^make database ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      return this.engine.makeDatabase(match[1]);
    }
    if ((match = line.match(/^use database ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      return this.engine.useDatabase(match[1]);
    }
    if ((match = line.match(/^make table ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      return this.engine.makeTable(match[1]);
    }
    if ((match = line.match(/^add column ([A-Za-z_][A-Za-z0-9_]*) as (text|number|boolean) to ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      return this.engine.addColumn(match[3], match[1], match[2]);
    }
    if ((match = line.match(/^add row to ([A-Za-z_][A-Za-z0-9_]*) (.+)$/i))) {
      return this.engine.addRow(match[1], parseAssignments(match[2]));
    }
    if ((match = line.match(/^show all from ([A-Za-z_][A-Za-z0-9_]*)$/i))) {
      return this.engine.showRows(match[1]);
    }
    if ((match = line.match(/^find from ([A-Za-z_][A-Za-z0-9_]*) where ([A-Za-z_][A-Za-z0-9_]*) is (.+)$/i))) {
      return this.engine.findRows(match[1], match[2], parseValue(match[3]));
    }
    throw new Error(`I do not understand this instruction: "${line}".`);
  }
}
