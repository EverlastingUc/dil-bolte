import { HeartEngine } from "./engine.js";
import { parseProgram } from "./parser.js";

export class HeartInterpreter {
  constructor(engine = new HeartEngine()) {
    this.engine = engine;
  }

  execute(source) {
    return parseProgram(source).map(node => {
      try {
        switch (node.type) {
          case "makeDatabase": return this.engine.makeDatabase(node.name);
          case "useDatabase": return this.engine.useDatabase(node.name);
          case "showDatabases": return this.engine.listDatabases();
          case "beginTransaction": return this.engine.beginTransaction();
          case "commitTransaction": return this.engine.commitTransaction();
          case "rollbackTransaction": return this.engine.rollbackTransaction();
          case "makeTable": return this.engine.makeTable(node.name);
          case "addColumn": return this.engine.addColumn(node.table, node.name, node.columnType);
          case "addConstraint": return this.engine.addConstraint(node.table, node.constraintType, node.column);
          case "addForeignKey": return this.engine.addForeignKey(node.table, node.column, node.referencedTable, node.referencedColumn);
          case "showConstraints": return this.engine.showConstraints(node.table);
          case "addIndex": return this.engine.addIndex(node.table, node.column);
          case "removeIndex": return this.engine.removeIndex(node.table, node.column);
          case "showIndexes": return this.engine.showIndexes(node.table);
          case "addRow": return this.engine.addRow(node.table, node.values);
          case "showColumns": return this.engine.showColumns(node.table);
          case "countRows": return this.engine.countRows(node.table);
          case "showRows": return this.engine.showRows(node.table, node);
          case "findRows": return this.engine.queryRows(node.table, node.expression, node);
          case "sortRows": return this.engine.sortRows(node.table, node.column, node.direction);
          case "joinRows": return this.engine.joinRows(node.leftTable, node.rightTable, node.leftColumn, node.rightColumn);
          case "changeRows": return this.engine.changeRows(node.table, node.changes, node.column, node.value);
          case "removeRows": return this.engine.removeRows(node.table, node.column, node.value);
          default: throw new Error(`Unknown syntax node "${node.type}".`);
        }
      } catch (error) {
        throw new Error(`Line ${node.line}: ${error.message}`, { cause: error });
      }
    });
  }
}
