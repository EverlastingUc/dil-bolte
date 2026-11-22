import { readdirSync } from "node:fs";
import { HeartStorage } from "./storage.js";

export class HeartEngine {
  constructor({ storageDir = null } = {}) {
    this.databases = new Map();
    this.activeDatabase = null;
    this.storage = storageDir ? new HeartStorage(storageDir) : null;
  }

  makeDatabase(name) {
    this.#assertName(name, "database");
    if (this.databases.has(name) || this.storage?.exists(name)) throw new Error(`Database "${name}" already exists.`);
    this.databases.set(name, new Map());
    try {
      this.#persist(name);
    } catch (error) {
      this.databases.delete(name);
      throw error;
    }
    return `Database "${name}" created.`;
  }

  useDatabase(name) {
    this.#assertName(name, "database");
    if (!this.databases.has(name)) {
      const loaded = this.storage?.load(name);
      if (!loaded) throw new Error(`Database "${name}" does not exist.`);
      this.databases.set(name, loaded);
    }
    this.activeDatabase = name;
    return `Now using database "${name}".`;
  }

  listDatabases() {
    const names = new Set(this.databases.keys());
    if (this.storage) {
      for (const entry of readdirSync(this.storage.directory, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          const name = entry.name.slice(0, -5);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
        }
      }
    }
    return [...names].sort().map(name => ({ name, active: name === this.activeDatabase }));
  }

  makeTable(name) {
    const database = this.#requireDatabase();
    this.#assertName(name, "table");
    if (database.has(name)) throw new Error(`Table "${name}" already exists.`);
    database.set(name, { columns: new Map(), rows: [] });
    try {
      this.#persistActive();
    } catch (error) {
      database.delete(name);
      throw error;
    }
    return `Table "${name}" created.`;
  }

  addColumn(tableName, columnName, type) {
    const table = this.#requireTable(tableName);
    this.#assertName(columnName, "column");
    const normalizedType = String(type).toLowerCase();
    if (!["text", "number", "boolean"].includes(normalizedType)) throw new Error(`Unknown type "${type}". Use text, number, or boolean.`);
    if (table.columns.has(columnName)) throw new Error(`Column "${columnName}" already exists.`);
    table.columns.set(columnName, normalizedType);
    for (const row of table.rows) row[columnName] = null;
    try {
      this.#persistActive();
    } catch (error) {
      table.columns.delete(columnName);
      for (const row of table.rows) delete row[columnName];
      throw error;
    }
    return `Column "${columnName}" added to "${tableName}".`;
  }

  addRow(tableName, values) {
    const table = this.#requireTable(tableName);
    const row = {};
    for (const [key, value] of Object.entries(values)) {
      if (!table.columns.has(key)) throw new Error(`Column "${key}" does not exist in "${tableName}".`);
      row[key] = this.#validateValue(key, value, table.columns.get(key));
    }
    for (const key of table.columns.keys()) if (!(key in row)) row[key] = null;
    table.rows.push(row);
    try {
      this.#persistActive();
    } catch (error) {
      table.rows.pop();
      throw error;
    }
    return `1 row added to "${tableName}".`;
  }

  showRows(tableName) {
    return this.#requireTable(tableName).rows.map(row => ({ ...row }));
  }

  showColumns(tableName) {
    const table = this.#requireTable(tableName);
    return [...table.columns].map(([name, type]) => ({ name, type }));
  }

  countRows(tableName) {
    return this.#requireTable(tableName).rows.length;
  }

  findRows(tableName, columnName, expected) {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, columnName);
    this.#validateValue(columnName, expected, table.columns.get(columnName));
    return table.rows.filter(row => row[columnName] === expected).map(row => ({ ...row }));
  }

  changeRows(tableName, changes, whereColumn, expected) {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, whereColumn);
    this.#validateValue(whereColumn, expected, table.columns.get(whereColumn));
    const entries = Object.entries(changes);
    if (entries.length === 0) throw new Error("Provide at least one field to change.");
    for (const [columnName, value] of entries) {
      this.#requireColumn(table, tableName, columnName);
      this.#validateValue(columnName, value, table.columns.get(columnName));
    }

    const matchingRows = table.rows.filter(row => row[whereColumn] === expected);
    const originals = matchingRows.map(row => ({ ...row }));
    for (const row of matchingRows) {
      for (const [columnName, value] of entries) row[columnName] = value;
    }
    if (matchingRows.length) {
      try {
        this.#persistActive();
      } catch (error) {
        matchingRows.forEach((row, index) => Object.assign(row, originals[index]));
        throw error;
      }
    }
    const changed = matchingRows.length;
    return `${changed} row(s) changed in "${tableName}".`;
  }

  removeRows(tableName, whereColumn, expected) {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, whereColumn);
    this.#validateValue(whereColumn, expected, table.columns.get(whereColumn));
    const remaining = table.rows.filter(row => row[whereColumn] !== expected);
    const removed = table.rows.length - remaining.length;
    if (removed) {
      const originalRows = table.rows;
      table.rows = remaining;
      try {
        this.#persistActive();
      } catch (error) {
        table.rows = originalRows;
        throw error;
      }
    }
    return `${removed} row(s) removed from "${tableName}".`;
  }

  #requireColumn(table, tableName, columnName) {
    if (!table.columns.has(columnName)) throw new Error(`Column "${columnName}" does not exist in "${tableName}".`);
  }

  #persist(name, tables = this.databases.get(name)) {
    if (this.storage && tables) this.storage.save(name, tables);
  }

  #persistActive() {
    if (this.activeDatabase) this.#persist(this.activeDatabase);
  }

  #requireDatabase() {
    if (!this.activeDatabase) throw new Error("Choose a database first with: use database NAME");
    return this.databases.get(this.activeDatabase);
  }

  #requireTable(name) {
    const table = this.#requireDatabase().get(name);
    if (!table) throw new Error(`Table "${name}" does not exist.`);
    return table;
  }

  #assertName(name, kind) {
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid ${kind} name "${name}". Use letters, numbers, and underscores; do not start with a number.`);
    }
  }

  #validateValue(name, value, type) {
    const valid = type === "text" ? typeof value === "string"
      : type === "number" ? typeof value === "number" && Number.isFinite(value)
      : typeof value === "boolean";
    if (!valid) throw new Error(`Column "${name}" expects a ${type} value.`);
    return value;
  }
}
