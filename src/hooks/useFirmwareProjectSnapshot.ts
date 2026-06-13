import React from "react";
import { summarizeChangedLines } from "../lib/diff";
import type { ProjectFiles } from "../lib/projectFiles";

export type FileDiff = {
  filename: string;
  lines: string[];
};

type FirmwareProjectSnapshot = Pick<ProjectFiles, "keymap" | "leftOverlay" | "rightOverlay">;

const EMPTY_SNAPSHOT: FirmwareProjectSnapshot = {
  keymap: "",
  leftOverlay: "",
  rightOverlay: "",
};

export function useFirmwareProjectSnapshot(files: ProjectFiles | null) {
  const [savedProject, setSavedProject] = React.useState<FirmwareProjectSnapshot>(EMPTY_SNAPSHOT);

  const captureSavedProject = React.useCallback((project: FirmwareProjectSnapshot) => {
    setSavedProject({
      keymap: project.keymap,
      leftOverlay: project.leftOverlay,
      rightOverlay: project.rightOverlay,
    });
  }, []);

  const clearSavedProject = React.useCallback(() => {
    setSavedProject(EMPTY_SNAPSHOT);
  }, []);

  const keymapDiff = React.useMemo(
    () =>
      [
        fileDiff("KobitoKey.keymap", savedProject.keymap, files?.keymap ?? ""),
        fileDiff("KobitoKey_left.overlay", savedProject.leftOverlay, files?.leftOverlay ?? ""),
        fileDiff("KobitoKey_right.overlay", savedProject.rightOverlay, files?.rightOverlay ?? ""),
      ].filter((diff) => diff.lines.length > 0),
    [files?.keymap, files?.leftOverlay, files?.rightOverlay, savedProject],
  );

  return {
    captureSavedProject,
    clearSavedProject,
    keymapDiff,
    savedProject,
  };
}

function fileDiff(filename: string, before: string, after: string): FileDiff {
  return {
    filename,
    lines: summarizeChangedLines(before, after),
  };
}
