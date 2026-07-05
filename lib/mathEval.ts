/**
 * Safe math expression evaluator.
 *
 * Parses a restricted arithmetic grammar (caller-provided variables plus a
 * whitelist of functions/constants) into an AST and evaluates it. There is NO use of
 * `eval` or `new Function`, so model-supplied `expr` strings can never execute
 * arbitrary code. Anything outside the grammar throws at parse time; the public
 * helpers swallow that and yield NaN so a bad expression renders as "no curve"
 * rather than crashing.
 */

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "unary"; op: "-"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "call"; fn: keyof typeof FUNCTIONS; a: Node };

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
} as const;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

type Token =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
      const num = Number(src.slice(i, j));
      if (!Number.isFinite(num)) throw new Error("bad number");
      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i + 1;
      while (j < src.length && (isAlpha(src[j]) || isDigit(src[j]))) j++;
      tokens.push({ t: "name", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/^(),".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`unexpected char '${c}'`);
  }
  return tokens;
}

/** Recursive-descent parser with standard precedence. */
function parse(src: string, boundNames: Set<string>): Node {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v?: string) => {
    const tok = tokens[pos];
    if (!tok) throw new Error("unexpected end");
    if (v && !(tok.t === "op" && tok.v === v)) throw new Error(`expected '${v}'`);
    pos++;
    return tok;
  };

  // expr := term (('+'|'-') term)*
  function expr(): Node {
    let left = term();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = eat().v as "+" | "-";
      left = { k: "bin", op, a: left, b: term() };
    }
    return left;
  }
  // term := unary (('*'|'/') unary)*
  function term(): Node {
    let left = unary();
    while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const op = eat().v as "*" | "/";
      left = { k: "bin", op, a: left, b: unary() };
    }
    return left;
  }
  // unary := '-' unary | power   (exponent binds tighter than unary minus: -x^2 == -(x^2))
  function unary(): Node {
    if (peek()?.t === "op" && peek()!.v === "-") {
      eat("-");
      return { k: "unary", op: "-", a: unary() };
    }
    return power();
  }
  // power := primary ('^' unary)?   (right-assoc; right side allows unary so 2^-1 works)
  function power(): Node {
    const base = primary();
    if (peek()?.t === "op" && peek()!.v === "^") {
      eat("^");
      return { k: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  // primary := num | '(' expr ')' | name | name '(' expr ')'
  function primary(): Node {
    const tok = peek();
    if (!tok) throw new Error("unexpected end");
    if (tok.t === "num") {
      eat();
      return { k: "num", v: tok.v };
    }
    if (tok.t === "op" && tok.v === "(") {
      eat("(");
      const e = expr();
      eat(")");
      return e;
    }
    if (tok.t === "name") {
      eat();
      const name = tok.v;
      // function call (Object.hasOwn so inherited props like "constructor" can't match)
      if (peek()?.t === "op" && peek()!.v === "(") {
        if (!Object.hasOwn(FUNCTIONS, name)) throw new Error(`unknown function '${name}'`);
        eat("(");
        const arg = expr();
        eat(")");
        return { k: "call", fn: name as keyof typeof FUNCTIONS, a: arg };
      }
      if (boundNames.has(name)) return { k: "var", name };
      if (Object.hasOwn(CONSTANTS, name)) return { k: "num", v: CONSTANTS[name] };
      throw new Error(`unknown identifier '${name}'`);
    }
    throw new Error("unexpected token");
  }

  const ast = expr();
  if (pos !== tokens.length) throw new Error("trailing tokens");
  return ast;
}

function evalNode(n: Node, vars: Record<string, number>): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var":
      return vars[n.name] ?? NaN;
    case "unary":
      return -evalNode(n.a, vars);
    case "bin": {
      const a = evalNode(n.a, vars);
      const b = evalNode(n.b, vars);
      switch (n.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return Math.pow(a, b);
      }
    }
    // falls through (unreachable)
    case "call":
      return FUNCTIONS[n.fn](evalNode(n.a, vars));
  }
}

export type ExprInput = number | Record<string, number>;
export type CompiledExpr = (input: ExprInput) => number;

/**
 * Compile an expression to a safe numeric function. The default accepts the
 * existing `(x) => number` call shape; callers can pass more bound variable
 * names and evaluate with a record, e.g. `fn({ t, a, b })`.
 *
 * Returns null if the expression is invalid, so callers can render nothing
 * instead of crashing.
 */
export function compileExpr(expr: string, variables: readonly string[] = ["x"]): CompiledExpr | null {
  if (typeof expr !== "string" || expr.length > 200) return null;
  const names = variables.map((v) => v.toLowerCase()).filter(Boolean);
  if (!names.length) return null;
  const boundNames = new Set(names);
  try {
    const ast = parse(expr, boundNames);
    return (input: ExprInput) => {
      const vars = typeof input === "number" ? { [names[0]]: input } : input;
      return evalNode(ast, vars);
    };
  } catch {
    return null;
  }
}
