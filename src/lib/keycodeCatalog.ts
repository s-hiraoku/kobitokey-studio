export type KeyChoice = {
  value: string;
  label: string;
  hint?: string;
};

export type KeyChoiceGroup = {
  id: string;
  label: string;
  choices: KeyChoice[];
};

const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => ({
  value: letter,
  label: letter,
}));

const numbers: KeyChoice[] = [
  ["N1", "1"],
  ["N2", "2"],
  ["N3", "3"],
  ["N4", "4"],
  ["N5", "5"],
  ["N6", "6"],
  ["N7", "7"],
  ["N8", "8"],
  ["N9", "9"],
  ["N0", "0"],
].map(([value, label]) => ({ value, label }));

const editing: KeyChoice[] = [
  ["ESC", "Esc"],
  ["TAB", "Tab"],
  ["SPACE", "Space"],
  ["ENTER", "Enter"],
  ["BSPC", "Backspace"],
  ["DEL", "Delete"],
].map(([value, label]) => ({ value, label }));

const punctuation: KeyChoice[] = [
  ["MINUS", "-"],
  ["EQUAL", "="],
  ["LBKT", "["],
  ["RBKT", "]"],
  ["BSLH", "\\"],
  ["SEMI", ";"],
  ["APOS", "'"],
  ["APOSTROPHE", "Apostrophe"],
  ["GRAVE", "`"],
  ["COMMA", ","],
  ["CMMA", "Comma"],
  ["DOT", "."],
  ["SLASH", "/"],
  ["FSLH", "Slash"],
].map(([value, label]) => ({ value, label }));

const navigation: KeyChoice[] = [
  ["LEFT", "Left"],
  ["DOWN", "Down"],
  ["UP", "Up"],
  ["RIGHT", "Right"],
  ["HOME", "Home"],
  ["END", "End"],
  ["PG_UP", "Page Up"],
  ["PG_DN", "Page Down"],
  ["INS", "Insert"],
].map(([value, label]) => ({ value, label }));

const functionKeys = Array.from({ length: 24 }, (_, index) => {
  const value = `F${index + 1}`;
  return { value, label: value };
});

export const MODIFIER_CHOICES: KeyChoice[] = [
  ["LCTRL", "Left Ctrl"],
  ["RCTRL", "Right Ctrl"],
  ["LALT", "Left Alt"],
  ["RALT", "Right Alt"],
  ["LSHFT", "Left Shift"],
  ["RSHFT", "Right Shift"],
  ["LEFT_SHIFT", "Left Shift"],
  ["RIGHT_SHIFT", "Right Shift"],
  ["LEFT_META", "Left Meta"],
  ["RIGHT_META", "Right Meta"],
  ["LCMD", "Left Cmd"],
  ["RCMD", "Right Cmd"],
].map(([value, label]) => ({ value, label }));

const system: KeyChoice[] = [
  ["CAPS", "Caps Lock"],
  ["PSCRN", "Print Screen"],
  ["SCROLLLOCK", "Scroll Lock"],
  ["PAUSE_BREAK", "Pause"],
  ["C_VOL_UP", "Volume Up"],
  ["C_VOL_DN", "Volume Down"],
  ["C_MUTE", "Mute"],
  ["C_PLAY_PAUSE", "Play/Pause"],
  ["C_NEXT", "Next Track"],
  ["C_PREV", "Previous Track"],
].map(([value, label]) => ({ value, label }));

export const KEY_CHOICE_GROUPS: KeyChoiceGroup[] = [
  { id: "alpha", label: "英字", choices: alpha },
  { id: "number", label: "数字", choices: numbers },
  { id: "edit", label: "編集", choices: editing },
  { id: "symbol", label: "記号", choices: punctuation },
  { id: "nav", label: "移動", choices: navigation },
  { id: "mod", label: "修飾", choices: MODIFIER_CHOICES },
  { id: "fn", label: "Fキー", choices: functionKeys },
  { id: "system", label: "システム", choices: system },
];

export const LAYER_CHOICES: KeyChoice[] = Array.from({ length: 10 }, (_, index) => ({
  value: String(index),
  label: `Layer ${index}`,
}));

export const MOUSE_CHOICES: KeyChoice[] = [
  ["MB1", "Button 1"],
  ["MB2", "Button 2"],
  ["MB3", "Button 3"],
  ["MB4", "Button 4"],
  ["MB5", "Button 5"],
].map(([value, label]) => ({ value, label }));

export const BLUETOOTH_ACTION_CHOICES: KeyChoice[] = [
  ["BT_SEL", "Select profile"],
  ["BT_CLR", "Clear profile"],
  ["BT_CLR_ALL", "Clear all"],
  ["BT_NXT", "Next profile"],
  ["BT_PRV", "Previous profile"],
].map(([value, label]) => ({ value, label }));

export const BLUETOOTH_PROFILE_CHOICES: KeyChoice[] = Array.from({ length: 5 }, (_, index) => ({
  value: String(index),
  label: `Profile ${index}`,
}));

export const SPECIAL_BINDING_CHOICES: KeyChoice[] = [
  ["&trans", "Transparent"],
  ["&none", "None"],
  ["&studio_unlock", "Studio Unlock"],
  ["&caps_word", "Caps Word"],
  ["&key_repeat", "Key Repeat"],
  ["&sys_reset", "System Reset"],
  ["&bootloader", "Bootloader"],
  ["&soft_off", "Soft Off"],
  ["&gresc", "Grave Escape"],
].map(([value, label]) => ({ value, label }));

export function choiceLabel(value: string, groups: KeyChoiceGroup[] | KeyChoice[]): string {
  const choices = Array.isArray(groups) && "choices" in (groups[0] ?? {})
    ? (groups as KeyChoiceGroup[]).flatMap((group) => group.choices)
    : (groups as KeyChoice[]);
  return choices.find((choice) => choice.value === value)?.label ?? value;
}
