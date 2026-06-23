import { useRef } from 'react';
import { useMention } from './useMention';
import MentionDropdown from './MentionDropdown';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  /** Ctrl+Enter 핸들러 (CommentSection 등에서 제출 단축키로 사용) */
  onCtrlEnter?: () => void;
}

/**
 * @멘션 자동완성을 지원하는 textarea 래퍼.
 * 기존 textarea를 이 컴포넌트로 교체하면 됩니다.
 */
const MentionInput = ({ value, onChange, placeholder, rows = 3, className, disabled, onCtrlEnter }: Props) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { isOpen, users, isLoading, selectedIndex, handleKeyDown, selectUser, close } =
    useMention({ inputRef: textareaRef, value, onChange });

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl+Enter → 제출 콜백 (드롭다운 없을 때만)
          if (onCtrlEnter && e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            onCtrlEnter();
            return;
          }
          handleKeyDown(e);
        }}
        onBlur={() => {
          // 약간의 딜레이 후 닫기 (onMouseDown 먼저 처리되도록)
          setTimeout(close, 150);
        }}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className ?? 'dt-textarea w-full'}
      />
      {isOpen && (
        <MentionDropdown
          users={users}
          isLoading={isLoading}
          selectedIndex={selectedIndex}
          onSelect={selectUser}
        />
      )}
    </div>
  );
};

export default MentionInput;
