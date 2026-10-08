export const FIXED_MATERIAL_NAME = "الرگي";

export const DEFAULT_MATERIALS = [
  { name: FIXED_MATERIAL_NAME, isFixed: true },
];

export function isFixedMaterial(name) {
  return String(name || "").trim() === FIXED_MATERIAL_NAME;
}