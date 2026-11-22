import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FORMAT_VERSION = 1;

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

  list() {
    return [];
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

    if (document.formatVersion !== FORMAT_VERSION || document.name !== name || !document.tables || typeof document.tables !== "object") {
      throw new Error(`Database "${name}" uses an unsupported or invalid storage format.`);
    }

    const tables = new Map();
    for (const [tableName, savedTable] of Object.entries(document.tables)) {
      if (!savedTable || !savedTable.columns || typeof savedTable.columns !== "object" || !Array.isArray(savedTable.rows)) {
        throw new Error(`Database "${name}" contains an invalid table "${tableName}".`);
      }
      tables.set(tableName, {
        columns: new Map(Object.entries(savedTable.columns)),
        rows: savedTable.rows
      });
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
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    renameSync(temporary, destination);
  }
}
