"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignLeft,
  Bold,
  Eraser,
  Italic,
  List,
  ListOrdered,
  Underline as UnderlineIcon,
} from "lucide-react";

type BudgetCompilationEditorProps = {
  value: string;
  onChange: (html: string) => void;
};

const toolbarButtonClass = "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-surface-600 transition hover:bg-white hover:text-surface-900 disabled:cursor-not-allowed disabled:opacity-35";

export default function BudgetCompilationEditor({ value, onChange }: BudgetCompilationEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "budget-compilation-editor-content min-h-[280px] px-4 py-3 text-sm leading-7 text-surface-900 outline-none",
        "data-placeholder": "填写预算编制说明、计价口径、施工边界或需要随报价书输出的说明内容",
      },
    },
    onUpdate: ({ editor: nextEditor }) => onChange(nextEditor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const nextValue = value || "";
    if (editor.getHTML() !== nextValue) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="quota-template-rich-editor flex min-h-[340px] items-center justify-center rounded-lg border border-surface-200 bg-white text-sm text-surface-400">
        编辑器加载中
      </div>
    );
  }

  return (
    <div className="quota-template-rich-editor relative rounded-lg border border-surface-200 bg-white">
      <div className="quota-template-rich-toolbar flex flex-wrap items-center gap-1 border-b border-surface-200 bg-[#F8FAFC] px-2 py-2">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={toolbarButtonClass} title="加粗" aria-label="加粗">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={toolbarButtonClass} title="斜体" aria-label="斜体">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()} className={toolbarButtonClass} title="下划线" aria-label="下划线">
          <UnderlineIcon className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()} className={toolbarButtonClass} title="无序列表" aria-label="无序列表">
          <List className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={toolbarButtonClass} title="有序列表" aria-label="有序列表">
          <ListOrdered className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().setTextAlign("left").run()} className={toolbarButtonClass} title="左对齐" aria-label="左对齐">
          <AlignLeft className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().setTextAlign("center").run()} className={toolbarButtonClass} title="居中" aria-label="居中">
          <AlignCenter className="h-4 w-4" />
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={toolbarButtonClass} title="清除格式" aria-label="清除格式">
          <Eraser className="h-4 w-4" />
        </button>

      </div>

      <div className="max-h-[70vh] min-h-[280px] resize-y overflow-auto">
        <EditorContent editor={editor} />
      </div>

      <style jsx global>{`
        .budget-compilation-editor-content p {
          margin: 0 0 8px;
        }
        .budget-compilation-editor-content ul,
        .budget-compilation-editor-content ol {
          margin: 0 0 8px 20px;
          padding: 0;
        }
        .budget-compilation-editor-content li {
          margin: 0 0 4px;
        }
      `}</style>
    </div>
  );
}
