// Safe arithmetic for the calculator (no eval): + - × ÷, brackets, unary
// minus and %. Like a desk calculator, "a + b%" / "a - b%" add or take off
// b percent OF a; elsewhere b% is b/100 ("200 × 15%" = 30).

type Factor = { value: number; pct: number | null }; // pct: the raw b when the factor was "b%"

export function evaluate(expr: string): number {
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, "").replace(/\s+/g, "");
  let i = 0;
  const peek = () => src[i];

  function number(): number {
    const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)/);
    if (!m) throw new Error("bad number");
    i += m[0].length;
    return Number(m[0]);
  }
  function factor(): Factor {
    let value: number;
    if (peek() === "-") {
      i++;
      const f = factor();
      return { value: -f.value, pct: f.pct == null ? null : -f.pct };
    }
    if (peek() === "+") {
      i++;
      return factor();
    }
    if (peek() === "(") {
      i++;
      value = expression();
      if (peek() === ")") i++; // tolerate a missing closing bracket
    } else value = number();
    if (peek() === "%") {
      i++;
      return { value: value / 100, pct: value };
    }
    return { value, pct: null };
  }
  function term(): Factor {
    let left = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++];
      const right = factor();
      left = { value: op === "*" ? left.value * right.value : left.value / right.value, pct: null };
    }
    return left;
  }
  function expression(): number {
    let left = term().value;
    while (peek() === "+" || peek() === "-") {
      const op = src[i++];
      const right = term();
      const amount = right.pct != null ? (left * right.pct) / 100 : right.value;
      left = op === "+" ? left + amount : left - amount;
    }
    return left;
  }

  if (src === "") return 0;
  const result = expression();
  if (i < src.length) throw new Error("unexpected input");
  if (!Number.isFinite(result)) throw new Error("not a number");
  return result;
}

// Up to 10 decimals, trailing zeros dropped, thousands separated.
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString("en-NG", { maximumFractionDigits: 10 });
}
