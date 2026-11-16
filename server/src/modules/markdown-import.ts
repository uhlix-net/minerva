import type { MinervaModule } from "./types.js";
import { requireAdmin } from "../auth.js";
import { createPage, findPageByTitle, updatePage } from "../pages.js";
import { one } from "../db.js";

/**
 * Admin API to create or update pages from Markdown (used to seed and sync documentation).
 * POST /api/import/markdown { space, parent?, title, markdown }  - upserts by (space, parent, title).
 */
const mod: MinervaModule = {
  id: "markdown-import",
  name: "Markdown import",
  description: "Admin API to create or update pages from Markdown, e.g. documentation kept in Git.",
  kind: "feature",
  async register(ctx) {
    ctx.app!.post("/api/import/markdown", { preHandler: requireAdmin }, async (req, reply) => {
      const b = req.body as { space: string; parent?: string; title: string; markdown: string };
      if (!b?.space || !b.title || typeof b.markdown !== "string") return reply.code(400).send({ error: "space, title and markdown are required" });
      const space = await one(`SELECT id FROM spaces WHERE key = $1`, [b.space]);
      if (!space) return reply.code(404).send({ error: `space ${b.space} not found` });
      let parentId: number | null = null;
      if (b.parent) {
        const p = await findPageByTitle(space.id, null, b.parent);
        if (!p) return reply.code(404).send({ error: `parent page ${b.parent} not found` });
        parentId = p.id;
      }
      const user = (req as any).user;
      const existing = await findPageByTitle(space.id, parentId, b.title);
      if (existing) {
        const r = await updatePage(existing.id, { title: b.title, body: null, bodyMd: b.markdown, version: existing.version }, user.id);
        return { id: existing.id, version: r.version, action: "updated" };
      }
      const id = await createPage({ spaceId: space.id, parentId, title: b.title, bodyMd: b.markdown }, user.id);
      return { id, version: 1, action: "created" };
    });
  },
};

export default mod;
