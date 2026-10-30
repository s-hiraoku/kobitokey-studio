import { describe, expect, it } from "vitest";
import { neighborKeyIndex } from "./kobitokeyPhysicalLayout";

describe("neighborKeyIndex", () => {
  it("moves along a row and across the split", () => {
    expect(neighborKeyIndex(0, "right")).toBe(1);
    expect(neighborKeyIndex(4, "right")).toBe(5);
    expect(neighborKeyIndex(5, "left")).toBe(4);
    expect(neighborKeyIndex(9, "left")).toBe(8);
  });

  it("moves between rows on the same column", () => {
    expect(neighborKeyIndex(0, "down")).toBe(10);
    expect(neighborKeyIndex(12, "up")).toBe(2);
    expect(neighborKeyIndex(22, "up")).toBe(12);
  });

  it("stays put at the outer edges", () => {
    expect(neighborKeyIndex(0, "left")).toBe(0);
    expect(neighborKeyIndex(9, "right")).toBe(9);
    expect(neighborKeyIndex(2, "up")).toBe(2);
  });
});
