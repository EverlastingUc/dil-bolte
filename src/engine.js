import { readdirSync } from "node:fs";
import { HeartStorage } from "./storage.js";

const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype", "toString", "toLocaleString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);

function buildIndex(rows, column) {
  const index = new Map();
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    if (!index.has(value)) index.set(value, new Set());
    index.get(value).add(row);
  }
  return index;
}

function cloneDatabase(database) {
  return new Map([...database].map(([tableName, table]) => {
    const rows = table.rows.map(row => ({ ...row }));
    return [tableName, {
      columns: new Map(table.columns),
      rows,
      indexes: new Map([...(table.indexes ?? new Map()).keys()].map(column => [column, buildIndex(rows, column)])),
      constraints: {
        primaryKey: table.constraints.primaryKey,
        unique: [...table.constraints.unique],
        required: [...table.constraints.required],
        foreignKeys: (table.constraints.foreignKeys ?? []).map(key => ({ ...key }))
      }
    }];
  }));
}

export class HeartEngine {
  constructor({ storageDir = null } = {}) {
    this.databases = new Map();
    this.activeDatabase = null;
    this.storage = storageDir ? new HeartStorage(storageDir) : null;
    this.transaction = null;
  }

  makeDatabase(name) {
    if (this.transaction) throw new Error("Cannot create a database during an active transaction.");
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
    if (this.transaction) throw new Error("Cannot switch databases during an active transaction.");
    this.#assertName(name, "database");
    if (!this.databases.has(name)) {
      const loaded = this.storage?.load(name);
      if (!loaded) throw new Error(`Database "${name}" does not exist.`);
      this.databases.set(name, loaded);
    }
    this.activeDatabase = name;
    return `Now using database "${name}".`;
  }

  beginTransaction() {
    if (this.transaction) throw new Error("A transaction is already active.");
    const database = this.#requireDatabase();
    this.transaction = {
      databaseName: this.activeDatabase,
      snapshot: cloneDatabase(database)
    };
    return 'Transaction started for "' + this.activeDatabase + '".';
  }

  commitTransaction() {
    if (!this.transaction) throw new Error("There is no active transaction to commit.");
    const { databaseName, snapshot } = this.transaction;
    try {
      if (this.storage) this.storage.save(databaseName, this.databases.get(databaseName));
    } catch (error) {
      this.databases.set(databaseName, snapshot);
      this.transaction = null;
      throw new Error("Transaction commit failed; all changes were rolled back: " + error.message, { cause: error });
    }
    this.transaction = null;
    return "Transaction committed.";
  }

  rollbackTransaction() {
    if (!this.transaction) throw new Error("There is no active transaction to roll back.");
    const { databaseName, snapshot } = this.transaction;
    this.databases.set(databaseName, snapshot);
    this.transaction = null;
    return "Transaction rolled back.";
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
    database.set(name, { columns: new Map(), rows: [], constraints: { primaryKey: null, unique: [], required: [], foreignKeys: [] }, indexes: new Map() });
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
    this.#assertConstraints(table, [...table.rows, row]);
    this.#assertDatabaseIntegrity(this.activeDatabase, new Map([[tableName, [...table.rows, row]]]));
    table.rows.push(row);
    this.#rebuildIndexes(table);
    try {
      this.#persistActive();
    } catch (error) {
      table.rows.pop();
      this.#rebuildIndexes(table);
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

  showIndexes(tableName) {
    const table = this.#requireTable(tableName);
    return [...table.indexes.keys()].map(column => ({ column, type: "hash" }));
  }

  addIndex(tableName, columnName) {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, columnName);
    if (table.indexes.has(columnName)) throw new Error('An index already exists for "' + tableName + "." + columnName + '".');
    table.indexes.set(columnName, buildIndex(table.rows, columnName));
    try {
      this.#persistActive();
    } catch (error) {
      table.indexes.delete(columnName);
      throw error;
    }
    return 'Created hash index on "' + tableName + "." + columnName + '".';
  }

  removeIndex(tableName, columnName) {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, columnName);
    if (!table.indexes.has(columnName)) throw new Error('No index exists for "' + tableName + "." + columnName + '".');
    const previous = table.indexes.get(columnName);
    table.indexes.delete(columnName);
    try {
      this.#persistActive();
    } catch (error) {
      table.indexes.set(columnName, previous);
      throw error;
    }
    return 'Removed index from "' + tableName + "." + columnName + '".';
  }

  showConstraints(tableName) {
    const { primaryKey, unique, required } = this.#requireTable(tableName).constraints;
    const result = [];
    if (primaryKey) result.push({ type: "primary key", column: primaryKey });
    for (const column of unique) result.push({ type: "unique", column });
    for (const column of required) result.push({ type: "required", column });
    for (const foreignKey of this.#requireTable(tableName).constraints.foreignKeys ?? []) {
      result.push({ type: "foreign key", column: foreignKey.column, references: foreignKey.referencedTable + "." + foreignKey.referencedColumn });
    }
    return result;
  }

  addConstraint(tableName, constraintType, columnName) {
    const table = this.#requireTable(tableName);
    this.#requireColumn(table, tableName, columnName);
    const constraints = table.constraints;
    if (!["primary key", "unique", "required"].includes(constraintType)) {
      throw new Error('Unknown constraint "' + constraintType + '". Use primary key, unique, or required.');
    }
    if (constraintType === "primary key" && constraints.primaryKey) {
      throw new Error('Table "' + tableName + '" already has a primary key.');
    }
    if (constraintType === "unique" && constraints.unique.includes(columnName)) {
      throw new Error('Column "' + columnName + '" already has a unique constraint.');
    }
    if (constraintType === "required" && constraints.required.includes(columnName)) {
      throw new Error('Column "' + columnName + '" is already required.');
    }

    const previous = {
      primaryKey: constraints.primaryKey,
      unique: [...constraints.unique],
      required: [...constraints.required]
    };
    if (constraintType === "primary key") constraints.primaryKey = columnName;
    if (constraintType === "unique") constraints.unique.push(columnName);
    if (constraintType === "required") constraints.required.push(columnName);

    try {
      this.#assertConstraints(table, table.rows);
      this.#persistActive();
    } catch (error) {
      table.constraints = previous;
      throw error;
    }
    return 'Added ' + constraintType + ' constraint to "' + tableName + '.' + columnName + '".';
  }

  addForeignKey(tableName, columnName, referencedTableName, referencedColumnName) {
    const database = this.#requireDatabase();
    const table = this.#requireTable(tableName);
    const referencedTable = database.get(referencedTableName);
    if (!referencedTable) throw new Error('Referenced table "' + referencedTableName + '" does not exist.');
    this.#requireColumn(table, tableName, columnName);
    this.#requireColumn(referencedTable, referencedTableName, referencedColumnName);
    if (table.columns.get(columnName) !== referencedTable.columns.get(referencedColumnName)) {
      throw new Error("Foreign-key and referenced columns must have the same type.");
    }
    const targetIsUnique = referencedTable.constraints.primaryKey === referencedColumnName
      || referencedTable.constraints.unique.includes(referencedColumnName);
    if (!targetIsUnique) throw new Error('Referenced column "' + referencedTableName + "." + referencedColumnName + '" must be a primary key or unique.');
    const foreignKeys = table.constraints.foreignKeys ?? [];
    if (foreignKeys.some(key => key.column === columnName)) {
      throw new Error('Column "' + columnName + '" already has a foreign-key constraint.');
    }
    const previous = [...foreignKeys];
    table.constraints.foreignKeys = [...foreignKeys, { column: columnName, referencedTable: referencedTableName, referencedColumn: referencedColumnName }];
    try {
      this.#assertDatabaseIntegrity(this.activeDatabase);
      this.#persistActive();
    } catch (error) {
      table.constraints.foreignKeys = previous;
      throw error;
    }
    return 'Added foreign key "' + tableName + "." + columnName + '" referencing "' + referencedTableName + "." + referencedColumnName + '".';
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
    const indexed = this.#indexedCandidates(table, expression);\n    const sourceRows = indexed ?? table.rows;\n    const rows = sourceRows.filter(row => matches(row, expression)).map(row => ({ ...row }));
    return this.#paginate(rows, pagination);
  }

  joinRows(leftTableName, rightTableName, leftColumn, rightColumn) {
    const database = this.#requireDatabase();
    const leftTable = database.get(leftTableName);
    const rightTable = database.get(rightTableName);
    if (!leftTable) throw new Error('Table "' + leftTableName + '" does not exist.');
    if (!rightTable) throw new Error('Table "' + rightTableName + '" does not exist.');
    this.#requireColumn(leftTable, leftTableName, leftColumn);
    this.#requireColumn(rightTable, rightTableName, rightColumn);
    if (leftTable.columns.get(leftColumn) !== rightTable.columns.get(rightColumn)) {
      throw new Error("Join columns must have the same type.");
    }
    const rightIndex = new Map();
    for (const row of rightTable.rows) {
      const value = row[rightColumn];
      if (value === null) continue;
      if (!rightIndex.has(value)) rightIndex.set(value, []);
      rightIndex.get(value).push(row);
    }
    const result = [];
    for (const leftRow of leftTable.rows) {
      const value = leftRow[leftColumn];
      if (value === null) continue;
      for (const rightRow of rightIndex.get(value) ?? []) {
        result.push({
          [leftTableName]: { ...leftRow },
          [rightTableName]: { ...rightRow }
        });
      }
    }
    return result;
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
    const candidateRows = table.rows.map(row => matchingRows.includes(row) ? { ...row, ...Object.fromEntries(entries) } : row);
    this.#assertConstraints(table, candidateRows);
    this.#assertDatabaseIntegrity(this.activeDatabase, new Map([[tableName, candidateRows]]));
    const originals = matchingRows.map(row => ({ ...row }));
    for (const row of matchingRows) {
      for (const [columnName, value] of entries) row[columnName] = value;
    }
    if (matchingRows.length) {
      this.#rebuildIndexes(table);
      try {
        this.#persistActive();
      } catch (error) {
        matchingRows.forEach((row, index) => Object.assign(row, originals[index]));
        this.#rebuildIndexes(table);
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
      this.#assertDatabaseIntegrity(this.activeDatabase, new Map([[tableName, remaining]]));
      const originalRows = table.rows;
      table.rows = remaining;
      this.#rebuildIndexes(table);
      try {
        this.#persistActive();
      } catch (error) {
        table.rows = originalRows;
        this.#rebuildIndexes(table);
        throw error;
      }
    }
    return `${removed} row(s) removed from "${tableName}".`;
  }

  #rebuildIndexes(table) {
    for (const column of table.indexes.keys()) {
      table.indexes.set(column, buildIndex(table.rows, column));
    }
  }

  #indexedCandidates(table, expression) {
    if (expression.type === "condition") {
      if (expression.operator !== "is" || !table.indexes.has(expression.column)) return null;
      return table.indexes.get(expression.column).get(expression.value) ?? new Set();
    }
    if (expression.type === "and") {
      const left = this.#indexedCandidates(table, expression.left);
      const right = this.#indexedCandidates(table, expression.right);
      if (left && right) {
        const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
        return new Set([...smaller].filter(row => larger.has(row)));
      }
      return left ?? right;
    }
    if (expression.type === "or") {
      const left = this.#indexedCandidates(table, expression.left);
      const right = this.#indexedCandidates(table, expression.right);
      if (!left || !right) return null;
      return new Set([...left, ...right]);
    }
    return null;
  }

  #assertDatabaseIntegrity(databaseName, rowOverrides = new Map()) {
    const database = this.databases.get(databaseName);
    for (const [childName, childTable] of database) {
      const childRows = rowOverrides.get(childName) ?? childTable.rows;
      for (const foreignKey of childTable.constraints.foreignKeys ?? []) {
        const parentTable = database.get(foreignKey.referencedTable);
        if (!parentTable) throw new Error('Foreign key on "' + childName + '" references missing table "' + foreignKey.referencedTable + '".');
        const parentRows = rowOverrides.get(foreignKey.referencedTable) ?? parentTable.rows;
        const allowed = new Set(parentRows.map(row => row[foreignKey.referencedColumn]).filter(value => value !== null));
        for (const row of childRows) {
          const value = row[foreignKey.column];
          if (value !== null && !allowed.has(value)) {
            throw new Error('Foreign key violation: "' + childName + "." + foreignKey.column + '" has no matching value in "' + foreignKey.referencedTable + "." + foreignKey.referencedColumn + '".');
          }
        }
      }
    }
  }

  #assertConstraints(table, rows) {
    const constraints = table.constraints ?? { primaryKey: null, unique: [], required: [], foreignKeys: [] };
    const requiredColumns = new Set([...constraints.required, ...(constraints.primaryKey ? [constraints.primaryKey] : [])]);
    for (const column of requiredColumns) {
      if (rows.some(row => row[column] === null || row[column] === undefined)) {
        throw new Error('Column "' + column + '" cannot be empty because it has a required constraint.');
      }
    }
    const uniqueColumns = new Set([...constraints.unique, ...(constraints.primaryKey ? [constraints.primaryKey] : [])]);
    for (const column of uniqueColumns) {
      const seen = new Set();
      for (const row of rows) {
        const value = row[column];
        if (value === null || value === undefined) continue;
        if (seen.has(value)) throw new Error('Duplicate value for unique column "' + column + '".');
        seen.add(value);
      }
    }
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
    if (this.transaction?.databaseName === name) return;
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
