import { useRef, useState } from 'react';
import { useMention } from '@/components/mention/useMention';
import MentionDropdown from '@/components/mention/MentionDropdown';
import EditorToolbar from './EditorToolbar';
import MarkdownPreview from './MarkdownPreview';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  /** Ctrl+Enter 핸들러 */
  onCtrlEnter?: () => void;
  disabled?: boolean;
  /** 미리보기 상태를 외부에서 제어할 때 사용 */
  isPreview?: boolean;
  onPreviewChange?: (v: boolean) => void;
}

const MarkdownEditor = ({
  value,
  onChange,
  placeholder = '내용을 입력하세요... (@username으로 멘션 가능)',
  rows = 5,
  onCtrlEnter,
  disabled,
  isPreview: isPreviewProp,
  onPreviewChange,
}: Props) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPreviewInternal, setIsPreviewInternal] = useState(false);

  // 외부 controlled prop이 있으면 그것을 사용, 없으면 내부 state
  const isPreview = isPreviewProp !== undefined ? isPreviewProp : isPreviewInternal;
  const setIsPreview = (v: boolean) => {
    if (onPreviewChange) onPreviewChange(v);
    else setIsPreviewInternal(v);
  };

  const {
    isOpen, users, isLoading, selectedIndex,
    handleKeyDown: mentionKeyDown, selectUser, close,
  } = useMention({ inputRef: textareaRef, value, onChange });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter → 제출
    if (onCtrlEnter && e.ctrlKey && e.key === 'Enter' && !isOpen) {
      e.preventDefault();
      onCtrlEnter();
      return;
    }
    mentionKeyDown(e);
  };

  // textarea 최소 높이 계산 (rows 기반)
  const minHeight = rows * 24;

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-300 transition-all">
      {/* 툴바 */}
      <EditorToolbar
        textareaRef={textareaRef}
        value={value}
        onChange={onChange}
        isPreview={isPreview}
        onTogglePreview={() => setIsPreview(!isPreview)}
      />

      {/* 에디터 / 미리보기 */}
      <div className="relative bg-white">
        {isPreview ? (
          <MarkdownPreview value={value} minHeight={minHeight} />
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(close, 150)}
              placeholder={placeholder}
              disabled={disabled}
              rows={rows}
              className="block w-full px-3 py-2.5 text-sm text-gray-800 bg-transparent placeholder-gray-400 resize-y outline-none border-0 leading-relaxed"
              style={{ minHeight }}
            />
            {isOpen && (
              <MentionDropdown
                users={users}
                isLoading={isLoading}
                selectedIndex={selectedIndex}
                onSelect={selectUser}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MarkdownEditor;
