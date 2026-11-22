/**
 * Minimal in-memory database engine for HEART v0.1.
 * Persistence, indexes, transactions, and SQL compatibility are future milestones.
 */

export class HeartEngine {
  constructor() {
    this.databases = new Map();
    this.activeDatabase = null;
  }

  makeDatabase(name) {
    this.#assertName(name, "database");
    if (this.databases.has(name)) throw new Error(`Database "${name}" already exists.`);
    this.databases.set(name, new Map());
    return `Database "${name}" created.`;
  }

  useDatabase(name) {
    if (!this.databases.has(name)) throw new Error(`Database "${name}" does not exist.`);
    this.activeDatabase = name;
    return `Now using database "${name}".`;
  }

  makeTable(name) {
    const database = this.#requireDatabase();
    this.#assertName(name, "table");
    if (database.has(name)) throw new Error(`Table "${name}" already exists.`);
    database.set(name, { columns: new Map(), rows: [] });
    return `Table "${name}" created.`;
  }

  addColumn(tableName, columnName, type) {
    const table = this.#requireTable(tableName);
    this.#assertName(columnName, "column");
    const normalizedType = String(type).toLowerCase();
    if (!["text", "number", "boolean"].includes(normalizedType)) {
      throw new Error(`Unknown type "${type}". Use text, number, or boolean.`);
    }
    if (table.columns.has(columnName)) throw new Error(`Column "${columnName}" already exists.`);
    table.columns.set(columnName, normalizedType);
    return `Column "${columnName}" added to "${tableName}".`;
  }

  addRow(tableName, values) {
    const table = this.#requireTable(tableName);
    const row = {};
    for (const [key, value] of Object.entries(values)) {
      if (!table.columns.has(key)) throw new Error(`Column "${key}" does not exist in "${tableName}".`);
      row[key] = this.#validateValue(key, value, table.columns.get(key));
    }
    for (const key of table.columns.keys()) {
      if (!(key in row)) row[key] = null;
    }
    table.rows.push(row);
    return `1 row added to "${tableName}".`;
  }

  showRows(tableName) {
    const table = this.#requireTable(tableName);
    return table.rows.length ? table.rows.map(row => ({ ...row })) : [];
  }

  findRows(tableName, columnName, expected) {
    const table = this.#requireTable(tableName);
    if (!table.columns.has(columnName)) throw new Error(`Column "${columnName}" does not exist in "${tableName}".`);
    return table.rows.filter(row => row[columnName] === expected).map(row => ({ ...row }));
  }

  #requireDatabase() {
    if (!this.activeDatabase) throw new Error("Choose a database first with: use database NAME");
    return this.databases.get(this.activeDatabase);
  }

  #requireTable(name) {
    const database = this.#requireDatabase();
    const table = database.get(name);
    if (!table) throw new Error(`Table "${name}" does not exist.`);
    return table;
  }

  #assertName(name, kind) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
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
