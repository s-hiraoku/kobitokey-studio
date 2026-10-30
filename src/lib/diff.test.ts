import { describe, expect, it } from "vitest";
import { summarizeChangedLines } from "./diff";

describe("summarizeChangedLines", () => {
  it("returns paired removed and added lines", () => {
    expect(summarizeChangedLines("a\nb\nc", "a\nB\nc")).toEqual(["-b", "+B"]);
  });

  it("caps long diffs", () => {
    const before = Array.from({ length: 100 }, (_, index) => `a${index}`).join("\n");
    const after = Array.from({ length: 100 }, (_, index) => `b${index}`).join("\n");

    expect(summarizeChangedLines(before, after)).toHaveLength(81);
    const changes = summarizeChangedLines(before, after);
    expect(changes[changes.length - 1]).toBe("...");
  });
});

describe("summarizeChangedLines alignment", () => {
  it("reports an inserted line without marking the following lines as changed", () => {
    expect(summarizeChangedLines("a\nb\nc\nd", "a\nNEW\nb\nc\nd")).toEqual(["+NEW"]);
  });

  it("reports a deleted line without a phantom empty addition", () => {
    expect(summarizeChangedLines("a\nb\nc", "a\nc")).toEqual(["-b"]);
    expect(summarizeChangedLines("a", "a\nb")).toEqual(["+b"]);
  });
});
