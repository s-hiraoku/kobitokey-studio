export type KeymapLayer = {
  id: string;
  label: string;
  bindings: string[];
  blockStart: number;
  blockEnd: number;
};

export type ParsedKeymap = {
  layers: KeymapLayer[];
  combos: KeymapCombo[];
};

export type KeymapCombo = {
  id: string;
  binding: string;
  keyPositions: number[];
  timeoutMs: number;
  blockStart: number;
  blockEnd: number;
};

export type KeymapComboInput = {
  id: string;
  binding: string;
  keyPositions: number[];
  timeoutMs: number;
};

const KEY_COUNT = 40;
const LAYER_PATTERN =
  /(?<id>[A-Za-z0-9_]+)\s*\{(?<body>[\s\S]*?bindings\s*=\s*<(?<bindings>[\s\S]*?)>\s*;[\s\S]*?)\};/g;
const COMBO_PATTERN = /(?<id>[A-Za-z_][A-Za-z0-9_-]*)\s*\{(?<body>[\s\S]*?)\};/g;

export function parseKeymap(source: string): ParsedKeymap {
  const keymapBlock = extractKeymapBody(source);
  const keymapSource = keymapBlock.body;
  const offset = keymapBlock.bodyStart;
  const layers: KeymapLayer[] = [];

  for (const match of keymapSource.matchAll(LAYER_PATTERN)) {
    const id = match.groups?.id ?? `layer${layers.length}`;
    const body = match.groups?.body ?? "";
    const bindingsSource = match.groups?.bindings ?? "";
    const bindings = tokenizeBindings(bindingsSource);

    if (bindings.length !== KEY_COUNT) {
      continue;
    }

    layers.push({
      id,
      label: parseLabel(body) ?? defaultLayerLabel(id, layers.length),
      bindings,
      blockStart: offset + (match.index ?? 0),
      blockEnd: offset + (match.index ?? 0) + match[0].length,
    });
  }

  return { layers, combos: parseCombos(source) };
}

function parseCombos(source: string): KeymapCombo[] {
  const combosBlock = extractNamedBody(source, "combos");
  if (!combosBlock) {
    return [];
  }

  const combos: KeymapCombo[] = [];
  for (const match of combosBlock.body.matchAll(COMBO_PATTERN)) {
    const id = match.groups?.id;
    const body = match.groups?.body ?? "";
    const keyPositions = parseNumberList(readAngleProperty(body, "key-positions"));
    const binding = tokenizeBindings(readAngleProperty(body, "bindings") ?? "")[0] ?? "";
    const timeoutMs = Number(readAngleProperty(body, "timeout-ms") ?? 0);

    if (!id || keyPositions.length === 0 || !binding) {
      continue;
    }

    combos.push({
      id,
      binding,
      keyPositions,
      timeoutMs,
      blockStart: combosBlock.bodyStart + (match.index ?? 0),
      blockEnd: combosBlock.bodyStart + (match.index ?? 0) + match[0].length,
    });
  }

  return combos;
}

function readAngleProperty(source: string, propertyName: string): string | undefined {
  return source.match(new RegExp(`${propertyName}\\s*=\\s*<([^>]+)>`))?.[1];
}

function parseNumberList(source: string | undefined): number[] {
  return source
    ?.trim()
    .split(/\s+/)
    .map(Number)
    .filter((value) => Number.isFinite(value)) ?? [];
}

function extractKeymapBody(source: string): { body: string; bodyStart: number } {
  return extractNamedBody(source, "keymap") ?? { body: source, bodyStart: 0 };
}

function extractNamedBody(source: string, name: string): { body: string; bodyStart: number } | undefined {
  const escapedName = escapeRegExp(name);
  const nodePattern = new RegExp(`(?:^|[\\s;{}])(?:[A-Za-z_][A-Za-z0-9_-]*\\s*:\\s*)?${escapedName}\\s*\\{`);
  const match = source.match(nodePattern);
  if (!match || match.index === undefined) {
    return undefined;
  }

  const openBrace = source.indexOf("{", match.index);
  if (openBrace < 0) {
    return undefined;
  }

  return extractBodyAtBrace(source, openBrace);
}

function extractBodyAtBrace(source: string, openBrace: number): { body: string; bodyStart: number } | undefined {
  if (openBrace < 0) {
    return undefined;
  }

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(openBrace + 1, index),
          bodyStart: openBrace + 1,
        };
      }
    }
  }

  return {
    body: source.slice(openBrace + 1),
    bodyStart: openBrace + 1,
  };
}

export function updateLayerBinding(
  source: string,
  layer: KeymapLayer,
  keyIndex: number,
  nextBinding: string,
): string {
  const nextBindings = [...layer.bindings];
  nextBindings[keyIndex] = normalizeBinding(nextBinding);

  const block = source.slice(layer.blockStart, layer.blockEnd);
  const nextBlock = block.replace(
    /bindings\s*=\s*<[\s\S]*?>\s*;/,
    `bindings = <\n${formatBindings(nextBindings)}\n            >;`,
  );

  return source.slice(0, layer.blockStart) + nextBlock + source.slice(layer.blockEnd);
}

export function updateCombo(source: string, combo: KeymapCombo, input: KeymapComboInput): string {
  const nextBlock = formatComboBlock(input);
  return source.slice(0, combo.blockStart) + nextBlock + source.slice(combo.blockEnd);
}

export function deleteCombo(source: string, combo: KeymapCombo): string {
  return source.slice(0, combo.blockStart).replace(/\s*$/, "\n") + source.slice(combo.blockEnd);
}

export function addCombo(source: string, input: KeymapComboInput): string {
  const combosBlock = extractNamedBody(source, "combos");
  if (!combosBlock) {
    return addComboBlock(source, input);
  }

  const insertAt = combosBlock.bodyStart + combosBlock.body.length;
  return `${source.slice(0, insertAt)}\n\n${indent(formatComboBlock(input), 8)}${source.slice(insertAt)}`;
}

function addComboBlock(source: string, input: KeymapComboInput): string {
  const comboBlock = [
    "    combos {",
    "        compatible = \"zmk,combos\";",
    "",
    indent(formatComboBlock(input), 8),
    "    };",
  ].join("\n");
  const rootEnd = source.lastIndexOf("};");

  if (rootEnd < 0) {
    return `${source.trimEnd()}\n\n${comboBlock}\n`;
  }

  return `${source.slice(0, rootEnd).trimEnd()}\n\n${comboBlock}\n${source.slice(rootEnd)}`;
}

function formatComboBlock(input: KeymapComboInput): string {
  return [
    `${input.id} {`,
    `    timeout-ms = <${input.timeoutMs}>;`,
    `    key-positions = <${input.keyPositions.join(" ")}>;`,
    `    bindings = <${input.binding}>;`,
    `};`,
  ].join("\n");
}

function indent(value: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

export function formatBindings(bindings: string[]): string {
  const rows: string[] = [];
  const maxLength = Math.max(...bindings.map((binding) => binding.length), 7);

  for (let row = 0; row < 4; row += 1) {
    const cells = bindings
      .slice(row * 10, row * 10 + 10)
      .map((binding) => binding.padEnd(maxLength, " "));
    rows.push(cells.join("  ").trimEnd());
  }

  return rows.join("\n");
}

export function tokenizeBindings(source: string): string[] {
  const tokens = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const bindings: string[] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("&")) {
      if (current.length > 0) {
        bindings.push(current.join(" "));
      }
      current = [token];
    } else if (current.length > 0) {
      current.push(token);
    }
  }

  if (current.length > 0) {
    bindings.push(current.join(" "));
  }

  return bindings;
}

function parseLabel(layerBody: string): string | undefined {
  return layerBody.match(/label\s*=\s*"([^"]+)"/)?.[1];
}

function defaultLayerLabel(id: string, index: number): string {
  return id === "default_layer" ? "DEFAULT" : `Layer ${index}`;
}

function normalizeBinding(binding: string): string {
  const normalized = binding.trim().replace(/\s+/g, " ");
  return normalized.startsWith("&") ? normalized : `&kp ${normalized}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
