import { useState, useEffect } from 'react';
import { marked } from 'marked';

marked.use({ breaks: true });

/** @멘션 강조 (HTML 후처리) */
function applyMentionHighlight(html: string): string {
  return html.replace(
    /(@[a-zA-Z0-9._-]+)/g,
    '<span class="mention-tag">$1</span>',
  );
}

interface Props {
  value: string;
  minHeight?: number;
}

const MarkdownPreview = ({ value, minHeight = 120 }: Props) => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    if (!value.trim()) {
      setHtml('');
      return;
    }
    // async: false → 동기적으로 string 반환 보장
    const result = marked.parse(value, { async: false }) as string;
    setHtml(applyMentionHighlight(result));
  }, [value]);

  // dangerouslySetInnerHTML과 children을 절대 같은 요소에 두지 않음 (React 에러 방지)
  if (html) {
    return (
      <div
        className="markdown-preview px-3 py-3 text-sm text-gray-800 overflow-auto"
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div
      className="markdown-preview px-3 py-3 text-sm text-gray-800 overflow-auto"
      style={{ minHeight }}
    >
      <span className="text-gray-400 text-xs">미리볼 내용이 없습니다.</span>
    </div>
  );
};

export default MarkdownPreview;
