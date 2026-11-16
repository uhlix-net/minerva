import { one, q, tx } from "./db.js";

/** Plain text of a Markdown document, for search. */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\{\{(?:toc|children)\}\}/g, " ")
    .replace(/\{\{status:[a-z]+:([^}\n]*)\}\}/gi, "$1")
    .replace(/\[!(?:NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]/gi, " ")
    .replace(/<\/?(?:details|summary)\b[^>]*>/gi, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findPageByTitle(spaceId: number, parentId: number | null, title: string) {
  return one(
    `SELECT id, version FROM pages WHERE space_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND title = $3`,
    [spaceId, parentId, title],
  );
}

export async function createPage(
  p: { spaceId: number; parentId: number | null; title: string; body?: unknown; bodyMd?: string | null; bodyText?: string },
  userId: number,
): Promise<number> {
  const text = p.bodyText ?? (p.bodyMd ? markdownToText(p.bodyMd) : "");
  return tx(async (c) => {
    const pos = (
      await c.query(`SELECT coalesce(max(position), -1) + 1 AS p FROM pages WHERE space_id = $1 AND parent_id IS NOT DISTINCT FROM $2`, [
        p.spaceId,
        p.parentId,
      ])
    ).rows[0].p;
    const r = await c.query(
      `INSERT INTO pages(space_id, parent_id, title, body, body_md, body_text, position, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
      [p.spaceId, p.parentId, p.title, p.body ?? null, p.bodyMd ?? null, text, pos, userId],
    );
    const id = r.rows[0].id;
    await c.query(`INSERT INTO page_versions(page_id, version, title, body, body_md, updated_by) VALUES ($1, 1, $2, $3, $4, $5)`, [
      id,
      p.title,
      p.body ?? null,
      p.bodyMd ?? null,
      userId,
    ]);
    return id;
  });
}

export class VersionConflict extends Error {}

/** Save a new version. `version` is the version the editor started from (optimistic locking). */
export async function updatePage(
  id: number,
  p: { title: string; body: unknown; bodyMd: string | null; bodyText?: string; version: number },
  userId: number,
) {
  const text = p.bodyText ?? (p.bodyMd ? markdownToText(p.bodyMd) : "");
  return tx(async (c) => {
    const cur = (await c.query(`SELECT version FROM pages WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!cur) throw new Error("not found");
    if (cur.version !== p.version) throw new VersionConflict(`page changed (now v${cur.version})`);
    const v = cur.version + 1;
    await c.query(
      `UPDATE pages SET title = $2, body = $3, body_md = $4, body_text = $5, version = $6, updated_by = $7, updated_at = now() WHERE id = $1`,
      [id, p.title, p.body ?? null, p.bodyMd, text, v, userId],
    );
    await c.query(`INSERT INTO page_versions(page_id, version, title, body, body_md, updated_by) VALUES ($1, $2, $3, $4, $5, $6)`, [
      id,
      v,
      p.title,
      p.body ?? null,
      p.bodyMd,
      userId,
    ]);
    return { version: v };
  });
}

export async function pageTree(spaceId: number) {
  return q(
    `SELECT id, parent_id, title, position FROM pages WHERE space_id = $1 ORDER BY parent_id NULLS FIRST, position, title`,
    [spaceId],
  );
}
