import type { RefObject } from 'react';
import {
  wrapSelection, prefixLines, insertAtCursor, insertLink,
  type TextareaState,
} from './editorUtils';

interface ToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  isPreview: boolean;
  onTogglePreview: () => void;
}

interface ToolDef {
  key: string;
  title: string;
  icon: React.ReactNode;
  action: (state: TextareaState) => { newValue: string; newStart: number; newEnd: number };
}

const EditorToolbar = ({ textareaRef, value, onChange, isPreview, onTogglePreview }: ToolbarProps) => {

  const applyTool = (fn: ToolDef['action']) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const state: TextareaState = {
      value,
      selectionStart: ta.selectionStart,
      selectionEnd:   ta.selectionEnd,
    };
    const { newValue, newStart, newEnd } = fn(state);
    onChange(newValue);
    // 다음 렌더 후 커서 복원
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newStart, newEnd);
    });
  };

  const TOOLS: (ToolDef | 'sep')[] = [
    {
      key: 'heading',
      title: '제목 (Heading)',
      icon: <span className="font-bold text-[13px]">H</span>,
      action: (s) => prefixLines(s, '## '),
    },
    {
      key: 'bold',
      title: '굵게 (Bold)',
      icon: <span className="font-extrabold text-[13px]">B</span>,
      action: (s) => wrapSelection(s, '**', '**'),
    },
    {
      key: 'italic',
      title: '기울임 (Italic)',
      icon: <span className="italic font-semibold text-[13px]">I</span>,
      action: (s) => wrapSelection(s, '*', '*'),
    },
    {
      key: 'quote',
      title: '인용 (Blockquote)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="15" y2="18"/>
        </svg>
      ),
      action: (s) => prefixLines(s, '> '),
    },
    {
      key: 'code',
      title: '코드 (Code)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      ),
      action: (s) => {
        const selected = s.value.slice(s.selectionStart, s.selectionEnd);
        if (selected.includes('\n')) return wrapSelection(s, '```\n', '\n```');
        return wrapSelection(s, '`', '`');
      },
    },
    {
      key: 'link',
      title: '링크 삽입 (Link)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      ),
      action: insertLink,
    },
    'sep',
    {
      key: 'ul',
      title: '글머리 목록 (Unordered list)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="9"  y1="6"  x2="20" y2="6"/>
          <line x1="9"  y1="12" x2="20" y2="12"/>
          <line x1="9"  y1="18" x2="20" y2="18"/>
          <circle cx="4" cy="6"  r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/>
        </svg>
      ),
      action: (s) => prefixLines(s, '- '),
    },
    {
      key: 'ol',
      title: '번호 목록 (Ordered list)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6"  x2="21" y2="6"/>
          <line x1="10" y1="12" x2="21" y2="12"/>
          <line x1="10" y1="18" x2="21" y2="18"/>
          <text x="2" y="8"  fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">1</text>
          <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">2</text>
          <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none" fontWeight="bold">3</text>
        </svg>
      ),
      action: (s) => prefixLines(s, '1. '),
    },
    {
      key: 'task',
      title: '할일 목록 (Task list)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="6" height="6" rx="1"/>
          <polyline points="4.5 8 6 9.5 8 7"/>
          <line x1="12" y1="8"  x2="21" y2="8"/>
          <rect x="3" y="14" width="6" height="6" rx="1"/>
          <line x1="12" y1="17" x2="21" y2="17"/>
        </svg>
      ),
      action: (s) => prefixLines(s, '- [ ] '),
    },
    'sep',
    {
      key: 'mention',
      title: '@멘션',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
        </svg>
      ),
      action: (s) => insertAtCursor(s, '@'),
    },
    {
      key: 'undo',
      title: '실행취소 (Ctrl+Z)',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 14 4 9 9 4"/>
          <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
        </svg>
      ),
      action: (s) => ({ newValue: s.value, newStart: s.selectionStart, newEnd: s.selectionEnd }), // 브라우저 undo 사용
    },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
      {TOOLS.map((tool, idx) => {
        if (tool === 'sep') {
          return <span key={`sep-${idx}`} className="w-px h-4 bg-gray-300 mx-1" />;
        }
        return (
          <button
            key={tool.key}
            type="button"
            title={tool.title}
            disabled={isPreview}
            onMouseDown={(e) => {
              e.preventDefault(); // blur 방지
              if (tool.key === 'undo') {
                textareaRef.current?.focus();
                document.execCommand('undo');
              } else {
                applyTool(tool.action);
              }
            }}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {tool.icon}
          </button>
        );
      })}

      {/* Preview toggle */}
      <button
        type="button"
        title={isPreview ? '편집 모드' : '미리보기'}
        onMouseDown={(e) => { e.preventDefault(); onTogglePreview(); }}
        className={`ml-auto flex items-center gap-1 px-2.5 h-7 rounded text-xs font-medium transition-colors ${
          isPreview
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
        }`}
      >
        {isPreview ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            편집
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            미리보기
          </>
        )}
      </button>
    </div>
  );
};

export default EditorToolbar;
