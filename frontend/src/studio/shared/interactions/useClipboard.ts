import { useState, useCallback } from 'react';
import { DraggableResizableItem } from './types';

export interface ClipboardState {
  hasClipboardContent: boolean;
  clipboardSize: number;
  isCutOperation: boolean;
}

export interface UseClipboardOptions<T extends DraggableResizableItem> {
  onCopy?: (items: T[]) => void;
  onCut?: (items: T[]) => void;
  onPaste?: (items: T[], position?: { x: number; y: number }) => void;
}

export function useClipboard<T extends DraggableResizableItem>(options: UseClipboardOptions<T>) {
  const { onCopy, onCut, onPaste } = options;
  const [clipboard, setClipboard] = useState<T[]>([]);
  const [isCutOperation, setIsCutOperation] = useState(false);

  const copy = useCallback((items: T[]) => {
    setClipboard([...items]);
    setIsCutOperation(false);
    onCopy?.(items);
  }, [onCopy]);

  const cut = useCallback((items: T[]) => {
    setClipboard([...items]);
    setIsCutOperation(true);
    onCut?.(items);
  }, [onCut]);

  const paste = useCallback((position?: { x: number; y: number }) => {
    if (clipboard.length === 0) return;
    
    // Pass items as-is, let the parent decide if IDs need to be changed
    // For tracks: keep same IDs
    // For notes: parent will generate new IDs
    onPaste?.(clipboard, position);
    
    // Clear clipboard if it was a cut operation
    if (isCutOperation) {
      setClipboard([]);
      setIsCutOperation(false);
    }
  }, [clipboard, isCutOperation, onPaste]);

  const hasClipboardContent = clipboard.length > 0;

  return {
    copy,
    cut,
    paste,
    hasClipboardContent,
    clipboardSize: clipboard.length,
    isCutOperation
  };
}