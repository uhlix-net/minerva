/**
 * Markdown round trip for the page elements: parse -> ProseMirror JSON -> markdown -> parse
 * must give the same document. Run: npx tsx web/test/markdown-roundtrip.ts
 */
import { getSchema } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Node as PMNode } from "@tiptap/pm/model";
import { buildExtensions } from "../src/editor/extensions";

const extensions = buildExtensions().filter((e) => e.name !== "markdown");
const md = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

const SRC = `{{toc}}

## Status

| Task | Status |
|---|---|
| Deploy | {{status:green:Done}} 2026-11-16 |
| LDAP | {{status:grey:Not started}} |

> [!WARNING]
> Renew the **certificate** before 2028.
>
> - item one
> - item two

> plain quote stays a quote

> [!INFO]
> alias for note

<details>
<summary>Rollback steps</summary>

1. Scale down
2. Restore

<details>
<summary>Nested & more</summary>

inner text

</details>

</details>

{{children}}
`;

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) {
    failed++;
    if (detail !== undefined) console.log(typeof detail === "string" ? detail : JSON.stringify(detail, null, 1));
  }
};

const j1 = md.parse(SRC);
PMNode.fromJSON(schema, j1).check();
const types: string[] = [];
const walk = (n: any) => {
  types.push(n.type);
  (n.content ?? []).forEach(walk);
};
walk(j1);
const count = (t: string) => types.filter((x) => x === t).length;
check("toc parsed", count("toc") === 1);
check("children parsed", count("children") === 1);
check("2 status labels", count("status") === 2);
check("2 callouts (warning + info alias)", count("callout") === 2);
check("plain blockquote kept", count("blockquote") === 1);
check("2 expand sections (nested)", count("expand") === 2);
const callouts = JSON.stringify(j1).match(/"kind":"[a-z]+"/g);
check("callout kinds", JSON.stringify(callouts) === JSON.stringify(['"kind":"warning"', '"kind":"note"']), callouts);
check("expand titles", JSON.stringify(j1).includes('"title":"Rollback steps"') && JSON.stringify(j1).includes('"title":"Nested & more"'));

const out = md.serialize(j1);
const j2 = md.parse(out);
check("round trip is stable", JSON.stringify(j1) === JSON.stringify(j2), out);
check("serialized syntax", ["{{toc}}", "{{children}}", "{{status:green:Done}}", "> [!WARNING]", "> [!NOTE]", "<summary>Nested &amp; more</summary>"].every((s) => out.includes(s)), out);

console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
