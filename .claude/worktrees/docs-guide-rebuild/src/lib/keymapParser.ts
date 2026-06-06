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
  layers?: number[];
  timeoutMs: number;
  blockStart: number;
  blockEnd: number;
};

export type KeymapComboInput = {
  id: string;
  binding: string;
  keyPositions: number[];
  layers?: number[];
  timeoutMs: number;
};

export type LayerReferenceSite =
  | {
      kind: "layer-binding";
      layerIndex: number;
      keyIndex: number;
      binding: string;
    }
  | {
      kind: "combo-binding";
      comboId: string;
      binding: string;
    }
  | {
      kind: "combo-layers";
      comboId: string;
      layers: number[];
    };

export type KeymapLayerInput = {
  id: string;
  label: string;
  bindings: string[];
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
    const layers = parseNumberList(readAngleProperty(body, "layers"));
    const binding = tokenizeBindings(readAngleProperty(body, "bindings") ?? "")[0] ?? "";
    const timeoutMs = Number(readAngleProperty(body, "timeout-ms") ?? 0);

    if (!id || keyPositions.length === 0 || !binding) {
      continue;
    }

    combos.push({
      id,
      binding,
      keyPositions,
      ...(layers.length > 0 ? { layers } : {}),
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

export function addLayer(source: string, input: KeymapLayerInput): string {
  const keymapBlock = extractKeymapBody(source);
  const insertAt = keymapBlock.bodyStart + keymapBlock.body.length;
  return `${source.slice(0, insertAt).trimEnd()}\n\n${indent(formatLayerBlock(input), 8)}\n${source.slice(insertAt)}`;
}

export function deleteLayer(source: string, layer: KeymapLayer): string {
  return source.slice(0, layer.blockStart).replace(/\s*$/, "\n") + source.slice(layer.blockEnd);
}

export function findLayerReferenceSites(parsed: ParsedKeymap, targetLayerIndex: number): LayerReferenceSite[] {
  if (!Number.isInteger(targetLayerIndex) || targetLayerIndex < 0) {
    return [];
  }

  const references: LayerReferenceSite[] = [];
  parsed.layers.forEach((layer, layerIndex) => {
    if (layerIndex === targetLayerIndex) {
      return;
    }

    layer.bindings.forEach((binding, keyIndex) => {
      if (bindingReferencesLayer(binding, targetLayerIndex)) {
        references.push({ kind: "layer-binding", layerIndex, keyIndex, binding });
      }
    });
  });

  parsed.combos.forEach((combo) => {
    if (bindingReferencesLayer(combo.binding, targetLayerIndex)) {
      references.push({ kind: "combo-binding", comboId: combo.id, binding: combo.binding });
    }
    if (combo.layers?.includes(targetLayerIndex)) {
      references.push({ kind: "combo-layers", comboId: combo.id, layers: combo.layers });
    }
  });

  return references;
}

export function nextLayerId(layers: KeymapLayer[], base = `layer${layers.length}`): string {
  const existingIds = new Set(layers.map((layer) => layer.id));
  const normalizedBase = sanitizeNodeId(base) || `layer${layers.length}`;

  if (!existingIds.has(normalizedBase)) {
    return normalizedBase;
  }

  for (let suffix = 1; suffix < 1000; suffix += 1) {
    const candidate = `${normalizedBase}_${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedBase}_${Date.now()}`;
}

export function updateCombo(source: string, combo: KeymapCombo, input: KeymapComboInput): string {
  const nextBlock = formatComboBlock({ ...input, layers: input.layers ?? combo.layers });
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
  const lines = [
    `${input.id} {`,
    `    timeout-ms = <${input.timeoutMs}>;`,
    `    key-positions = <${input.keyPositions.join(" ")}>;`,
  ];
  if (input.layers && input.layers.length > 0) {
    lines.push(`    layers = <${input.layers.join(" ")}>;`);
  }
  lines.push(`    bindings = <${input.binding}>;`, `};`);
  return lines.join("\n");
}

function formatLayerBlock(input: KeymapLayerInput): string {
  const bindings = Array.from({ length: KEY_COUNT }, (_, index) => input.bindings[index] ?? "&trans");
  return [
    `${sanitizeNodeId(input.id) || "layer"} {`,
    `    label = "${escapeDtsString(input.label)}";`,
    "    bindings = <",
    formatBindings(bindings),
    "    >;",
    "};",
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

function bindingReferencesLayer(binding: string, targetLayerIndex: number): boolean {
  const normalized = normalizeBinding(binding);
  const layerMatch =
    normalized.match(/^&lt\s+(\d+)(?:\s|$)/) ??
    normalized.match(/^&(?:mo|to|tog|sl)\s+(\d+)(?:\s|$)/);
  return layerMatch ? Number(layerMatch[1]) === targetLayerIndex : false;
}

function sanitizeNodeId(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z_]/.test(sanitized) ? sanitized : `layer_${sanitized}`;
}

function escapeDtsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
