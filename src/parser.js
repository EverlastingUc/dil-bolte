import { tokenize } from "./lexer.js";

class LineParser {
  constructor(source) {
    this.tokens = tokenize(source);
    this.position = 0;
  }

  parse() {
    if (this.tokens.length === 0) return null;
    let node;
    if (this.takeWords("make", "database")) node = { type: "makeDatabase", name: this.identifier() };
    else if (this.takeWords("use", "database")) node = { type: "useDatabase", name: this.identifier() };
    else if (this.takeWords("show", "databases")) node = { type: "showDatabases" };
    else if (this.takeWords("make", "table")) node = { type: "makeTable", name: this.identifier() };
    else if (this.takeWords("add", "column")) {
      const name = this.identifier();
      this.expectWord("as");
      const columnType = this.identifier().toLowerCase();
      this.expectWord("to");
      node = { type: "addColumn", name, columnType, table: this.identifier() };
    } else if (this.takeWords("add", "row", "to")) {
      node = { type: "addRow", table: this.identifier(), values: this.assignments() };
    } else if (this.takeWords("show", "columns", "from")) {
      node = { type: "showColumns", table: this.identifier() };
    } else if (this.takeWords("count", "rows", "in")) {
      node = { type: "countRows", table: this.identifier() };
    } else if (this.takeWords("show", "all", "from")) {
      node = { type: "showRows", table: this.identifier() };
    } else if (this.takeWords("find", "from")) {
      const table = this.identifier();
      this.expectWord("where");
      const column = this.identifier();
      const operator = this.operator();
      node = { type: "findRows", table, column, operator, value: this.value() };
    } else if (this.takeWords("sort", "rows", "in")) {
      const table = this.identifier();
      this.expectWord("by");
      const column = this.identifier();
      let direction = "ascending";
      if (this.peekWord("ascending") || this.peekWord("descending")) direction = this.identifier().toLowerCase();
      node = { type: "sortRows", table, column, direction };
    } else if (this.takeWords("change", "rows", "in")) {
      const table = this.identifier();
      this.expectWord("set");
      const changes = this.assignments(["where"]);
      this.expectWord("where");
      const column = this.identifier();
      this.expectWord("is");
      node = { type: "changeRows", table, changes, column, value: this.value() };
    } else if (this.takeWords("remove", "rows", "from")) {
      const table = this.identifier();
      this.expectWord("where");
      const column = this.identifier();
      this.expectWord("is");
      node = { type: "removeRows", table, column, value: this.value() };
    } else {
      throw new Error("I do not understand this instruction.");
    }

    if (this.position !== this.tokens.length) {
      const token = this.tokens[this.position];
      throw new Error('Unexpected token "' + String(token.value) + '".');
    }
    return node;
  }

  assignments(stopWords = []) {
    const values = {};
    while (this.position < this.tokens.length && !stopWords.some(word => this.peekWord(word))) {
      const name = this.identifier();
      if (Object.hasOwn(values, name)) throw new Error('Field "' + name + '" was provided more than once.');
      this.expect("=");
      values[name] = this.value();
      if (this.position === this.tokens.length || stopWords.some(word => this.peekWord(word))) break;
      this.expect(",");
      if (this.position === this.tokens.length) throw new Error("Expected a field assignment after comma.");
    }
    if (Object.keys(values).length === 0) throw new Error("Provide at least one field assignment.");
    return values;
  }

  operator() {
    for (const words of [["is", "not"], ["greater", "than"], ["less", "than"], ["at", "least"], ["at", "most"], ["contains"], ["starts", "with"], ["ends", "with"], ["is"]]) {
      if (this.takeWords(...words)) return words.join(" ");
    }
    throw new Error("Expected a supported search operator.");
  }

  value() {
    const token = this.tokens[this.position++];
    if (!token || !["string", "number", "boolean"].includes(token.type)) {
      this.position--;
      throw new Error("Expected a quoted text value, number, true, or false.");
    }
    return token.value;
  }

  identifier() {
    const token = this.tokens[this.position++];
    if (!token || token.type !== "identifier") {
      this.position--;
      throw new Error("Expected a name.");
    }
    return token.value;
  }

  expectWord(word) {
    if (!this.takeWords(word)) throw new Error('Expected "' + word + '".');
  }

  expect(type) {
    const token = this.tokens[this.position++];
    if (!token || token.type !== type) {
      this.position--;
      throw new Error('Expected "' + type + '".');
    }
  }

  peekWord(word) {
    const token = this.tokens[this.position];
    return token?.type === "identifier" && token.value.toLowerCase() === word;
  }

  takeWords(...words) {
    const start = this.position;
    for (const word of words) {
      if (!this.peekWord(word)) {
        this.position = start;
        return false;
      }
      this.position++;
    }
    return true;
  }
}

export function parseLine(source) {
  return new LineParser(source).parse();
}

export function parseProgram(source) {
  return source.split(/\r?\n/).flatMap((original, index) => {
    const line = original.trim();
    if (!line || line.startsWith("#")) return [];
    try {
      const node = parseLine(line);
      return node ? [{ ...node, line: index + 1 }] : [];
    } catch (error) {
      throw new Error("Line " + (index + 1) + ": " + error.message, { cause: error });
    }
  });
}
