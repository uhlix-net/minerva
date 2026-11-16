import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useEffect, useMemo } from "react";
import { buildExtensions } from "./extensions";

export interface DocContent {
  body: unknown | null;
  body_md: string | null;
}

/** Content for setContent: stored ProseMirror JSON, else the Markdown source. */
export function contentOf(c: DocContent): { content: any; contentType: "json" | "markdown" } {
  if (c.body) return { content: c.body, contentType: "json" };
  return { content: c.body_md ?? "", contentType: "markdown" };
}

/** Read-only rendering of a page, using the same schema as the editor so pages look identical. */
export function DocView({ doc, pageId, spaceKey }: { doc: DocContent; pageId?: number; spaceKey?: string }) {
  const extensions = useMemo(() => buildExtensions({ pageId, spaceKey }), [pageId, spaceKey]);
  const init = contentOf(doc);
  const editor = useEditor({
    extensions,
    editable: false,
    content: init.content,
    contentType: init.contentType,
    editorProps: { attributes: { class: "doc" } },
  } as any);
  useEffect(() => {
    if (!editor) return;
    const c = contentOf(doc);
    editor.commands.setContent(c.content, { contentType: c.contentType, emitUpdate: false } as any);
  }, [editor, doc]);
  return <EditorContent editor={editor} />;
}

export function useDocEditor(doc: DocContent & { id?: number; space_key?: string }, onChange?: (e: Editor) => void) {
  const extensions = useMemo(() => buildExtensions({ pageId: doc.id, spaceKey: doc.space_key }), [doc.id, doc.space_key]);
  const init = contentOf(doc);
  return useEditor({
    extensions,
    content: init.content,
    contentType: init.contentType,
    autofocus: "start",
    editorProps: { attributes: { class: "doc editable", spellcheck: "true" } },
    onUpdate: ({ editor }: { editor: Editor }) => onChange?.(editor),
  } as any);
}
