import React from "react";

const HISTORY_LIMIT = 100;

/**
 * Tracks every change to `value` as an undo step. Values set through `reset`
 * (project loads) become a fresh baseline instead of an undoable step.
 */
export function useUndoHistory<T>(
  value: T,
  setValue: (value: T) => void,
  isSame: (left: T, right: T) => boolean = Object.is,
) {
  const undoStackRef = React.useRef<T[]>([]);
  const redoStackRef = React.useRef<T[]>([]);
  const previousRef = React.useRef(value);
  const [, bumpVersion] = React.useReducer((version: number) => version + 1, 0);

  React.useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = value;
    if (previous === value || isSame(previous, value)) {
      return;
    }
    undoStackRef.current = [...undoStackRef.current, previous].slice(-HISTORY_LIMIT);
    redoStackRef.current = [];
    bumpVersion();
  }, [isSame, value]);

  const travel = React.useCallback(
    (from: React.MutableRefObject<T[]>, to: React.MutableRefObject<T[]>) => {
      if (from.current.length === 0) {
        return false;
      }
      const target = from.current[from.current.length - 1];
      from.current = from.current.slice(0, -1);
      to.current = [...to.current, previousRef.current];
      previousRef.current = target;
      setValue(target);
      bumpVersion();
      return true;
    },
    [setValue],
  );

  const undo = React.useCallback(() => travel(undoStackRef, redoStackRef), [travel]);
  const redo = React.useCallback(() => travel(redoStackRef, undoStackRef), [travel]);

  const reset = React.useCallback((baseline: T) => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    previousRef.current = baseline;
    bumpVersion();
  }, []);

  return {
    canRedo: redoStackRef.current.length > 0,
    canUndo: undoStackRef.current.length > 0,
    redo,
    reset,
    undo,
  };
}
