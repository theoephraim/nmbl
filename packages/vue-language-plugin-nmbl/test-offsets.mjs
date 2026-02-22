import * as CompilerDOM from "@vue/compiler-dom";
const html = '<h1 class="title">NMBL + Vue Example</h1>';

const ast = CompilerDOM.parse(html, { comments: true });

const el = ast.children[0];
console.log("Element:", el.tag);
console.log("Element loc:", el.loc.start.offset, "-", el.loc.end.offset);

for (const prop of el.props) {
  console.log("\nProp:", prop.name || prop.type);
  console.log("  prop.loc.start.offset:", prop.loc.start.offset);
  console.log("  prop.loc.end.offset:", prop.loc.end.offset);
  if (prop.value) {
    console.log("  value.loc.start.offset:", prop.value.loc.start.offset);
    console.log("  value.loc.end.offset:", prop.value.loc.end.offset);
    console.log("  value.content:", prop.value.content);
  }
}

// Find all offset values in the AST
function findOffsets(obj, path, visited) {
  if (obj == null || typeof obj !== "object") return;
  if (visited.has(obj)) return;
  visited.add(obj);
  if ("offset" in obj && typeof obj.offset === "number") {
    console.log("  offset at", path, "=", obj.offset, "-> html char:", JSON.stringify(html[obj.offset]));
  }
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (Array.isArray(val)) {
      val.forEach((item, i) => findOffsets(item, path + "." + key + "[" + i + "]", visited));
    } else if (val != null && typeof val === "object") {
      findOffsets(val, path + "." + key, visited);
    }
  }
}

console.log("\nAll offsets in AST:");
findOffsets(ast, "root", new Set());
