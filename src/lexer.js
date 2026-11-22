const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?/;

/** Convert one HEART instruction into typed tokens. */
export function tokenize(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const rest = source.slice(position);
    if (/^\s+/.test(rest)) {
      position += rest.match(/^\s+/)[0].length;
      continue;
    }
    const character = source[position];
    if (character === '"') {
      let end = position + 1;
      let escaped = false;
      for (; end < source.length; end++) {
        const current = source[end];
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === '"') break;
      }
      if (end >= source.length) throw new Error("Unterminated text value.");
      const raw = source.slice(position, end + 1);
      let value;
      try { value = JSON.parse(raw); }
      catch { throw new Error("Invalid text value " + raw + "."); }
      tokens.push({ type: "string", value });
      position = end + 1;
      continue;
    }
    if (character === "=" || character === ",") {
      tokens.push({ type: character, value: character });
      position++;
      continue;
    }
    const number = rest.match(NUMBER);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      position += number[0].length;
      continue;
    }
    const identifier = rest.match(IDENTIFIER);
    if (identifier) {
      const word = identifier[0];
      const lower = word.toLowerCase();
      tokens.push({
        type: lower === "true" || lower === "false" ? "boolean" : "identifier",
        value: lower === "true" ? true : lower === "false" ? false : word
      });
      position += word.length;
      continue;
    }
    throw new Error('Unexpected character "' + character + '" at column ' + (position + 1) + ".");
  }
  return tokens;
}
