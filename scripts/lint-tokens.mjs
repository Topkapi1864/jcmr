// Fails if a colour or font-family literal appears under src/ (spec §3.4).
import fs from "node:fs";
import path from "node:path";
const roots = ["src"];
const bad = [];
const hex = /#[0-9a-fA-F]{3,8}\b/;
const fn = /\b(rgba?|hsla?)\(/;
const fontFamily = /font-family\s*:(?!\s*(var\(|inherit))/;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(css|tsx?|jsx?)$/.test(e.name)) {
      const lines = fs.readFileSync(p, "utf8").split("\n");
      lines.forEach((l, i) => {
        if (l.includes("tokens-ok")) return;
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        if (hex.test(l) && !/href=|url\(|#\/|"#"|'#'|`#/.test(l)) bad.push(`${p}:${i + 1}: ${l.trim()}`);
        else if (fn.test(l)) bad.push(`${p}:${i + 1}: ${l.trim()}`);
        else if (fontFamily.test(l)) bad.push(`${p}:${i + 1}: ${l.trim()}`);
      });
    }
  }
}
roots.forEach(walk);
if (bad.length) { console.error("Colour/font literals outside design/tokens.css:\n" + bad.join("\n")); process.exit(1); }
console.log("tokens: clean");
