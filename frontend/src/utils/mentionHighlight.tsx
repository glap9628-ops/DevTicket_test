import { ReactNode } from 'react';

/**
 * 텍스트 내 @username 패턴을 하이라이트 span으로 변환합니다.
 */
export function highlightMentions(text: string): ReactNode[] {
  if (!text) return [];

  const parts = text.split(/(@[a-zA-Z0-9._-]+)/g);
  return parts.map((part, idx) => {
    if (/^@[a-zA-Z0-9._-]+$/.test(part)) {
      return (
        <span
          key={idx}
          className="mention-tag text-blue-600 bg-blue-50 px-1 rounded font-medium cursor-default"
          title={part}
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}
