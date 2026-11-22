import { useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { useSession } from "../App";
import { DocView } from "../editor/Doc";

/** One markdown example: the source on the left, rendered by the real page renderer on the right. */
function Example({ md, note }: { md: string; note?: ReactNode }) {
  const doc = useMemo(() => ({ body: null, body_md: md }), [md]);
  return (
    <>
      {note && <p style={{ margin: "10px 0 0" }}>{note}</p>}
      <div className="help-example">
        <div>
          <div className="help-label">Markdown</div>
          <pre className="help-src">{md}</pre>
        </div>
        <div>
          <div className="help-label">Result</div>
          <div className="help-out">
            <DocView doc={doc} />
          </div>
        </div>
      </div>
    </>
  );
}

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "editing",
    title: "Editing pages",
    body: (
      <>
        <ul>
          <li>
            Open a page and click <strong>Edit</strong>. Save with <strong>Publish</strong> (or Ctrl+S). Every save keeps the previous version in{" "}
            <strong>Page history</strong> (clock icon on the page).
          </li>
          <li>
            The editor has two views: <strong>Visual</strong> (word processor, with a toolbar) and <strong>Markdown</strong> (the source). Switch at any time;
            the page is the same. Your default view is under Preferences (account menu, top right).
          </li>
          <li>
            In the visual view you can type markdown shortcuts and they turn into formatting as you type: <code># </code> for a heading, <code>- </code> for a
            list, <code>**bold**</code>, <code>```</code> for a code block, <code>&gt; </code> for a quote.
          </li>
          <li>
            The <strong>Insert…</strong> menu at the end of the toolbar adds the page elements described below (table of contents, panels, expand sections,
            status labels, child page list).
          </li>
          <li>
            Leave a blank line between blocks (paragraphs, lists, tables, panels). Without it, markdown often joins them together.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "text",
    title: "Text formatting",
    body: (
      <>
        <Example md={"**Bold**, *italic*, ~~strikethrough~~, <u>underline</u>,\n==highlight== and `inline code`."} />
        <Example
          md={"First line,  \nsecond line of the same paragraph.\n\nA new paragraph."}
          note={
            <>
              A line break inside a paragraph needs two spaces at the end of the line. A blank line starts a new paragraph.
            </>
          }
        />
        <Example md={"Show a literal \\*asterisk\\* or \\_underscore\\_ with a backslash."} note="Put a backslash before a character to stop it formatting." />
        <p className="muted">Text color and alignment (left / center / right) are set with the toolbar; they have no markdown form.</p>
      </>
    ),
  },
  {
    id: "headings",
    title: "Headings",
    body: (
      <>
        <Example md={"# Heading 1\n## Heading 2\n### Heading 3\n#### Heading 4"} />
        <p className="muted">
          Use <code>#</code> to <code>######</code>. The page title is shown above the page, so sections usually start at Heading 2. Headings are what the
          table of contents lists.
        </p>
      </>
    ),
  },
  {
    id: "links",
    title: "Links and images",
    body: (
      <>
        <Example md={"[Minerva on Docker Hub](https://hub.docker.com/r/uhlix/minerva)\n\nBare URLs link too: https://example.com"} />
        <Example
          md={"![Minerva logo](/minerva-mark.png)"}
          note={
            <>
              Images: <code>![alt text](url)</code>. In the visual editor, the Image button uploads a file and attaches it to the page.
            </>
          }
        />
        <p className="muted">
          To link to another Minerva page, open it and copy its address (for example <code>/s/HOMELAB/p/24</code>) into a normal link.
        </p>
      </>
    ),
  },
  {
    id: "lists",
    title: "Lists and task lists",
    body: (
      <>
        <Example md={"- Bullet\n- Another bullet\n  - Nested (indent two spaces)\n\n1. First\n2. Second\n   - Nested under a number (indent three)"} />
        <Example md={"- [ ] Task to do\n- [x] Task done"} note="Task lists show check boxes that can be ticked in the editor." />
      </>
    ),
  },
  {
    id: "tables",
    title: "Tables",
    body: (
      <>
        <Example md={"| Server | Role | Status |\n|---|---|---|\n| web01 | Web server | {{status:green:Up}} |\n| dc01 | Domain controller | {{status:yellow:Patching}} |"} />
        <p className="muted">
          The first row is the header; the second row of dashes is required. Columns don't need to line up. In the visual editor, the Table button inserts a
          table and the table toolbar adds or deletes rows and columns.
        </p>
      </>
    ),
  },
  {
    id: "code",
    title: "Code blocks and diagrams",
    body: (
      <>
        <Example md={"```bash\nkubectl -n minerva get pods\n```"} note="Name the language after the opening fence for syntax highlighting (bash, yaml, json, python, sql, ...)." />
        <Example
          md={"```mermaid\nflowchart LR\n  user[Browser] --> traefik[Traefik]\n  traefik --> minerva[Minerva]\n  minerva --> db[(PostgreSQL)]\n```"}
          note={
            <>
              A <code>mermaid</code> code block is drawn as a diagram (flowcharts, sequence diagrams, and the other{" "}
              <a href="https://mermaid.js.org/intro/" target="_blank" rel="noopener noreferrer">
                Mermaid
              </a>{" "}
              types).
            </>
          }
        />
      </>
    ),
  },
  {
    id: "quotes",
    title: "Quotes and dividers",
    body: (
      <>
        <Example md={"> A quoted paragraph.\n\nText above a divider.\n\n---\n\nText below it."} />
      </>
    ),
  },
  {
    id: "toc",
    title: "Table of contents",
    body: (
      <>
        <Example md={"{{toc}}\n\n## Install\n\n### Prerequisites\n\n## Upgrade"} note={<><code>{"{{toc}}"}</code> on its own line lists every heading on the page, as links. It updates by itself.</>} />
      </>
    ),
  },
  {
    id: "children",
    title: "Child page list",
    body: (
      <>
        <Example md={"{{children}}"} note={<><code>{"{{children}}"}</code> on its own line lists the pages directly under this one in the page tree.</>} />
      </>
    ),
  },
  {
    id: "panels",
    title: "Panels (callouts)",
    body: (
      <>
        <Example md={"> [!NOTE]\n> Background information.\n\n> [!TIP]\n> A helpful hint.\n\n> [!IMPORTANT]\n> Key information.\n\n> [!WARNING]\n> Something to be careful about.\n\n> [!CAUTION]\n> Risk of losing data or breaking things."} />
        <p className="muted">
          Same syntax as GitHub alerts. <code>[!INFO]</code> also works (shown as Note) and <code>[!DANGER]</code> (shown as Caution). A panel can hold any
          content: lists, code, tables. Keep every line of the panel starting with <code>&gt;</code>; use a line with just <code>&gt;</code> for a blank line
          inside it.
        </p>
      </>
    ),
  },
  {
    id: "expand",
    title: "Expand sections",
    body: (
      <>
        <Example md={"<details>\n<summary>Rollback steps</summary>\n\n1. Scale the deployment to 0\n2. Restore the snapshot\n\n</details>"} />
        <p className="muted">
          Collapsed until the reader clicks the title; always open while editing. Leave blank lines around the content. Expand sections can be nested.
        </p>
      </>
    ),
  },
  {
    id: "status",
    title: "Status labels",
    body: (
      <>
        <Example md={"{{status:grey:Not started}} {{status:blue:In progress}} {{status:green:Done}}\n{{status:yellow:Waiting}} {{status:red:Blocked}} {{status:purple:Review}}"} />
        <p className="muted">
          <code>{"{{status:color:Text}}"}</code>, inline anywhere (often in table cells). Colors: grey, blue, green, yellow, red, purple.
        </p>
      </>
    ),
  },
];

function UserGuide() {
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        How to write pages: the markdown syntax and the Minerva page elements. Each example shows the markdown on the left and how the page shows it on the
        right.
      </p>
      <div className="help-toc">
        {SECTIONS.map((s) => (
          <a key={s.id} className="lozenge" href={`#help-${s.id}`}>
            {s.title}
          </a>
        ))}
      </div>
      {SECTIONS.map((s) => (
        <section key={s.id} id={`help-${s.id}`} className="help-section">
          <h2>{s.title}</h2>
          {s.body}
        </section>
      ))}
    </>
  );
}

function About() {
  const { meta, me } = useSession();
  return (
    <>
      <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <img src="/minerva-mark.png" alt="" style={{ width: 56, height: 56 }} />
        <div>
          <h3 style={{ margin: 0 }}>{meta?.siteName ?? "Minerva"}</h3>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Minerva {meta?.version}: a self-hosted, Confluence-style wiki and knowledge base.
          </p>
        </div>
      </div>
      <ul>
        <li>
          <strong>Spaces</strong> group related pages; each space has a page tree in the left sidebar.
        </li>
        <li>
          <strong>Pages</strong> are written in a visual editor or as markdown, keep a full version history, and are searchable (top bar).
        </li>
        <li>
          <strong>Appearance</strong> (palette icon) and <strong>Preferences</strong> (account menu): theme, page width, spacing and default editor, saved per user.
        </li>
        <li>
          <strong>Sign-in methods</strong> on this site: Minerva accounts
          {meta?.providers.filter((p) => p.id !== "local").map((p) => `, ${p.label}`)}.
          {me?.is_admin && (
            <>
              {" "}
              Configure them under <Link to="/settings?tab=auth">Settings &gt; Authentication</Link>; users under <Link to="/settings?tab=users">Settings &gt; Users</Link>; server health under{" "}
              <Link to="/settings?tab=status">Settings &gt; System Status</Link>.
            </>
          )}
        </li>
      </ul>
      <p>
        New to writing pages? The <Link to="/help?tab=guide">User Guide</Link> tab shows all the markdown options and page elements.
      </p>
    </>
  );
}

/** Help: one tab per topic (?tab=...); About is the first and default. Add new tabs to HELP_TABS. */
const HELP_TABS: { id: string; label: string; view: () => ReactNode }[] = [
  { id: "about", label: "About", view: () => <About /> },
  { id: "guide", label: "User Guide", view: () => <UserGuide /> },
];

export function HelpView() {
  const [params, setParams] = useSearchParams();
  const tab = HELP_TABS.find((t) => t.id === params.get("tab")) ?? HELP_TABS[0];
  return (
    <div className="dash" style={{ maxWidth: 1100 }}>
      <h1 style={{ marginTop: 0 }}>Help</h1>
      <div className="tabs">
        {HELP_TABS.map((t) => (
          <button key={t.id} className={t.id === tab.id ? "on" : ""} onClick={() => setParams(t.id === HELP_TABS[0].id ? {} : { tab: t.id })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab.view()}
    </div>
  );
}

