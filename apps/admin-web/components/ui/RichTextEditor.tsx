'use client';

import dynamic from 'next/dynamic';

const ReactQuill = dynamic(
  async () => {
    await import('react-quill/dist/quill.snow.css');
    const mod = await import('react-quill');
    return mod.default;
  },
  { ssr: false, loading: () => <div className="h-[200px] rounded border border-gray-300 bg-gray-50 animate-pulse" /> }
);

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

const QUILL_FORMATS = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'list', 'bullet',
  'link',
];

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '내용을 입력하세요',
  className = '',
  minHeight = '200px',
}: RichTextEditorProps) {
  return (
    <div className={`rich-text-editor [&_.ql-toolbar]:rounded-t [&_.ql-container]:rounded-b [&_.ql-editor]:min-h-[200px] ${className}`}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        modules={QUILL_MODULES}
        formats={QUILL_FORMATS}
      />
    </div>
  );
}
