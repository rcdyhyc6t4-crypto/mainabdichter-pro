import { DEFAULTS, createArea } from "./defaults.js";

const KEYS = {
  settings: "mainabdichter_v10_settings",
  visit: "mainabdichter_v10_visit",
  discount: "mainabdichter_v10_discount"
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, stored) {
  if (!stored || typeof stored !== "object") return clone(base);
  if (Array.isArray(base)) return Array.isArray(stored) ? stored : clone(base);
  const result = { ...clone(base) };
  for (const [key, value] of Object.entries(stored)) {
    if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = merge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function loadJson(key, fallback) {
  try {
    return merge(fallback, JSON.parse(localStorage.getItem(key) || "null"));
  } catch {
    return clone(fallback);
  }
}

export const state = {
  settings: loadJson(KEYS.settings, DEFAULTS.settings),
  visit: loadJson(KEYS.visit, DEFAULTS.visit),
  discount: loadJson(KEYS.discount, DEFAULTS.discount)
};

if (!Array.isArray(state.visit.areas) || state.visit.areas.length === 0) {
  state.visit.areas = [createArea()];
}

export function saveState() {
  localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
  localStorage.setItem(KEYS.visit, JSON.stringify(state.visit));
  localStorage.setItem(KEYS.discount, JSON.stringify(state.discount));
}

export function resetVisit() {
  state.visit = clone(DEFAULTS.visit);
  state.visit.areas = [createArea()];
  saveState();
}

export function resetSettings() {
  state.settings = clone(DEFAULTS.settings);
  saveState();
}
