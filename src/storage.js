import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FORMAT_VERSION = 1;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COLUMN_TYPES = new Set(["text", "number", "boolean"]);
const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype", "toString", "toLocaleString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateStoredValue(value, type) {
  if (value === null) return true;
  if (type === "text") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

export class HeartStorage {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
  }

  fileFor(name) {
    return join(this.directory, `${name}.json`);
  }

  exists(name) {
    return existsSync(this.fileFor(name));
  }

  load(name) {
    const path = this.fileFor(name);
    if (!existsSync(path)) return null;

    let document;
    try {
      document = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(`Could not read database "${name}": its data file is not valid JSON.`, { cause: error });
    }

    if (!isRecord(document) || document.formatVersion !== FORMAT_VERSION || document.name !== name || !isRecord(document.tables)) {
      throw new Error(`Database "${name}" uses an unsupported or invalid storage format.`);
    }

    const tables = new Map();
    for (const [tableName, savedTable] of Object.entries(document.tables)) {
      if (!NAME_PATTERN.test(tableName) || RESERVED_NAMES.has(tableName) || !isRecord(savedTable) || !isRecord(savedTable.columns) || !Array.isArray(savedTable.rows)) {
        throw new Error(`Database "${name}" contains an invalid table "${tableName}".`);
      }

      const columns = new Map(Object.entries(savedTable.columns));
      for (const [columnName, type] of columns) {
        if (!NAME_PATTERN.test(columnName) || RESERVED_NAMES.has(columnName) || !COLUMN_TYPES.has(type)) {
          throw new Error(`Database "${name}" contains an invalid column definition in "${tableName}".`);
        }
      }

      const rows = savedTable.rows.map((row, index) => {
        if (!isRecord(row)) throw new Error(`Database "${name}", table "${tableName}": row ${index + 1} is invalid.`);
        for (const [columnName, value] of Object.entries(row)) {
          const type = columns.get(columnName);
          if (!type || !validateStoredValue(value, type)) {
            throw new Error(`Database "${name}", table "${tableName}": invalid value for column "${columnName}" in row ${index + 1}.`);
          }
        }
        for (const columnName of columns.keys()) {
          if (!Object.hasOwn(row, columnName)) {
            throw new Error(`Database "${name}", table "${tableName}": row ${index + 1} is missing column "${columnName}".`);
          }
        }
        return row;
      });

      tables.set(tableName, { columns, rows });
    }
    return tables;
  }

  save(name, tables) {
    const document = {
      formatVersion: FORMAT_VERSION,
      name,
      tables: Object.fromEntries(
        [...tables].map(([tableName, table]) => [
          tableName,
          { columns: Object.fromEntries(table.columns), rows: table.rows }
        ])
      )
    };

    const destination = this.fileFor(name);
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "w" });
      renameSync(temporary, destination);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw new Error(`Could not save database "${name}": ${error.message}`, { cause: error });
    }
  }
}
