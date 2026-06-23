/**
 * textarea 커서 위치를 기준으로 텍스트를 삽입/래핑하는 유틸리티
 */

export interface TextareaState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface WrapResult {
  newValue: string;
  newStart: number;
  newEnd: number;
}

/** 선택 영역을 prefix/suffix로 래핑. 이미 래핑된 경우 해제 */
export function wrapSelection(
  state: TextareaState,
  prefix: string,
  suffix: string,
): WrapResult {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const selected = value.slice(start, end);
  const before   = value.slice(0, start);
  const after    = value.slice(end);

  // 이미 래핑됐으면 해제
  if (before.endsWith(prefix) && after.startsWith(suffix)) {
    const newValue = before.slice(0, -prefix.length) + selected + after.slice(suffix.length);
    return { newValue, newStart: start - prefix.length, newEnd: end - prefix.length };
  }

  const newValue = before + prefix + selected + suffix + after;
  return { newValue, newStart: start + prefix.length, newEnd: end + prefix.length };
}

/** 각 줄 앞에 prefix를 삽입. 이미 있으면 해제 */
export function prefixLines(
  state: TextareaState,
  prefix: string,
): WrapResult {
  const { value, selectionStart: start, selectionEnd: end } = state;

  // 선택 범위의 줄 시작/끝 찾기
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd   = value.indexOf('\n', end - 1);
  const blockEnd  = lineEnd === -1 ? value.length : lineEnd;

  const block   = value.slice(lineStart, blockEnd);
  const lines   = block.split('\n');
  const hasAll  = lines.every((l) => l.startsWith(prefix));
  const newLines = hasAll
    ? lines.map((l) => l.slice(prefix.length))
    : lines.map((l) => prefix + l);
  const newBlock = newLines.join('\n');

  const newValue = value.slice(0, lineStart) + newBlock + value.slice(blockEnd);
  const delta    = newBlock.length - block.length;
  return {
    newValue,
    newStart: lineStart,
    newEnd:   blockEnd + delta,
  };
}

/** 커서 위치에 텍스트 삽입 */
export function insertAtCursor(
  state: TextareaState,
  text: string,
): WrapResult {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const newValue = value.slice(0, start) + text + value.slice(end);
  return { newValue, newStart: start + text.length, newEnd: start + text.length };
}

/** 링크 삽입 */
export function insertLink(state: TextareaState): WrapResult {
  const { value, selectionStart: start, selectionEnd: end } = state;
  const selected = value.slice(start, end) || '텍스트';
  const template = `[${selected}](url)`;
  const newValue = value.slice(0, start) + template + value.slice(end);
  // 'url' 위치 선택
  const urlStart = start + selected.length + 3;
  return { newValue, newStart: urlStart, newEnd: urlStart + 3 };
}
