/** Parse markdown files with the editor schema and fail on invalid documents.
 *  Run: npx tsx web/test/validate-markdown.ts <file.md>... */
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Node as PMNode } from "@tiptap/pm/model";
import { readFileSync } from "node:fs";
import { buildExtensions } from "../src/editor/extensions";
const ex = buildExtensions().filter((e) => e.name !== "markdown");
const md = new MarkdownManager({ extensions: ex }); const schema = getSchema(ex);
let bad = 0;
for (const f of process.argv.slice(2)) {
  try { PMNode.fromJSON(schema, md.parse(readFileSync(f, "utf8"))).check(); }
  catch (e) { bad++; console.log("FAIL", f, (e as Error).message); }
}
console.log(process.argv.length - 2, "files,", bad, "failed");
