import { useState, useEffect, useRef, RefObject, useCallback } from 'react';
import { searchUsers, UserSearchResult } from './mentionApi';

interface UseMentionOptions {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
}

interface UseMentionReturn {
  query: string;
  isOpen: boolean;
  users: UserSearchResult[];
  isLoading: boolean;
  selectedIndex: number;
  triggerPos: { top: number; left: number } | null;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  selectUser: (user: UserSearchResult) => void;
  close: () => void;
}

export function useMention({ inputRef, value, onChange }: UseMentionOptions): UseMentionReturn {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPos, setTriggerPos] = useState<{ top: number; left: number } | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // value가 바뀔 때마다 커서 뒤 @query 감지
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const cursor = el.selectionStart ?? 0;
    const textBefore = value.slice(0, cursor);

    // @ 이후 연속 문자 탐지
    const match = textBefore.match(/@([a-zA-Z0-9._-]*)$/);
    if (match) {
      const q = match[1];
      setQuery(q);
      setMentionStart(cursor - match[0].length);
      setSelectedIndex(0);

      if (q.length >= 2) {
        setIsLoading(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          try {
            const results = await searchUsers(q);
            setUsers(results);
            setIsOpen(results.length > 0);
          } catch {
            setUsers([]);
            setIsOpen(false);
          } finally {
            setIsLoading(false);
          }
        }, 300);
      } else {
        setUsers([]);
        setIsOpen(false);
        setIsLoading(false);
      }

      // 드롭다운 위치 계산
      updateDropdownPosition(el, mentionStart >= 0 ? mentionStart : cursor);
    } else {
      close();
    }
  }, [value]);

  const updateDropdownPosition = useCallback((el: HTMLTextAreaElement, pos: number) => {
    // 간단한 textarea 내 커서 위치 근사치 계산
    const rect = el.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20;
    const lines = el.value.slice(0, pos).split('\n');
    const lineCount = lines.length;
    setTriggerPos({
      top: rect.top + lineCount * lineHeight + window.scrollY,
      left: rect.left,
    });
  }, []);

  const selectUser = useCallback((user: UserSearchResult) => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const cursor = el.selectionStart ?? 0;
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const newValue = `${before}@${user.username} ${after}`;
    onChange(newValue);

    // 커서를 삽입된 멘션 뒤로 이동
    const newCursor = mentionStart + user.username.length + 2; // "@" + username + " "
    requestAnimationFrame(() => {
      el.setSelectionRange(newCursor, newCursor);
      el.focus();
    });

    close();
  }, [inputRef, value, mentionStart, onChange]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setUsers([]);
    setIsLoading(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, users.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (users[selectedIndex]) selectUser(users[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }, [isOpen, users, selectedIndex, selectUser, close]);

  return { query, isOpen, users, isLoading, selectedIndex, triggerPos, handleKeyDown, selectUser, close };
}
