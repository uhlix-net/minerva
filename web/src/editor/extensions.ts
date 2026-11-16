import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { CodeBlockView } from "./CodeBlockView";

export const lowlight = createLowlight(common);

export function buildExtensions(opts: { placeholder?: string } = {}) {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } },
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: null }),
    TableKit.configure({ table: { resizable: true } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    Image.configure({ allowBase64: false }),
    Placeholder.configure({ placeholder: opts.placeholder ?? "Start writing, or type markdown like # or - ..." }),
    Markdown,
  ];
}
