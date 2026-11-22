import { readdirSync } from "node:fs";
import { HeartStorage } from "./storage.js";

const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype", "toString", "toLocaleString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

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

  showRows(tableName, pagination = {}) {
    const rows = this.#requireTable(tableName).rows.map(row => ({ ...row }));
    return this.#paginate(rows, pagination);
  }

  showColumns(tableName) {
    const table = this.#requireTable(tableName);
    return [...table.columns].map(([name, type]) => ({ name, type }));
  }

  countRows(tableName) {
    return this.#requireTable(tableName).rows.length;
  }

  findRows(tableName, columnName, expected, operator = "is") {
    return this.queryRows(tableName, { type: "condition", column: columnName, operator, value: expected });
  }

  queryRows(tableName, expression, pagination = {}) {
    const table = this.#requireTable(tableName);
    const validate = (node) => {
      if (!node || typeof node !== "object") throw new Error("Invalid query expression.");
      if (node.type === "and" || node.type === "or") {
        validate(node.left);
        validate(node.right);
        return;
      }
      if (node.type !== "condition") throw new Error("Unknown query expression node.");
      this.#requireColumn(table, tableName, node.column);
      const type = table.columns.get(node.column);
      const textOperators = new Set(["contains", "starts with", "ends with"]);
      const numericOperators = new Set(["greater than", "less than", "at least", "at most"]);
      if (textOperators.has(node.operator)) {
        if (type !== "text" || typeof node.value !== "string") throw new Error(`Operator "${node.operator}" requires a text column and text value.`);
      } else if (numericOperators.has(node.operator)) {
        if (type !== "number" || typeof node.value !== "number") throw new Error(`Operator "${node.operator}" requires a number column and number value.`);
      } else if (node.operator === "is" || node.operator === "is not") {
        this.#validateValue(node.column, node.value, type);
      } else {
        throw new Error(`Unknown search operator "${node.operator}".`);
      }
    };
    const matches = (row, node) => {
      if (node.type === "and") return matches(row, node.left) && matches(row, node.right);
      if (node.type === "or") return matches(row, node.left) || matches(row, node.right);
      const actual = row[node.column];
      switch (node.operator) {
        case "is": return actual === node.value;
        case "is not": return actual !== node.value;
        case "greater than": return actual !== null && actual > node.value;
        case "less than": return actual !== null && actual < node.value;
        case "at least": return actual !== null && actual >= node.value;
        case "at most": return actual !== null && actual <= node.value;
        case "contains": return actual !== null && actual.includes(node.value);
        case "starts with": return actual !== null && actual.startsWith(node.value);
        case "ends with": return actual !== null && actual.endsWith(node.value);
        default: return false;
      }
    };
    validate(expression);
    const rows = table.rows.filter(row => matches(row, expression)).map(row => ({ ...row }));
    return this.#paginate(rows, pagination);
  }

  sortRows(tableName, columnName, direction = "ascending") {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, columnName);
    const type = table.columns.get(columnName);
    if (type !== "number" && type !== "text") throw new Error("Sorting is supported for text and number columns only.");
    if (direction !== "ascending" && direction !== "descending") throw new Error(`Unknown sort direction "${direction}".`);
    const multiplier = direction === "ascending" ? 1 : -1;
    return table.rows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const a = left.row[columnName];
        const b = right.row[columnName];
        if (a === null && b === null) return left.index - right.index;
        if (a === null) return 1;
        if (b === null) return -1;
        const comparison = type === "number" ? a - b : a.localeCompare(b);
        return comparison === 0 ? left.index - right.index : comparison * multiplier;
      })
      .map(({ row }) => ({ ...row }));
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

  #paginate(rows, { limit, offset = 0 } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("OFFSET must be a non-negative whole number.");
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
      throw new Error("LIMIT must be a non-negative whole number.");
    }
    return rows.slice(offset, limit === undefined ? undefined : offset + limit);
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
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || RESERVED_NAMES.has(name)) {
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
