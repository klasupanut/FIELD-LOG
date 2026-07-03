import { GOOGLE_APPS_SCRIPT_WEB_APP_URL, GOOGLE_SHEET_URL, presetLocations, sampleLogs } from "./data.js";
import { isWeekendDate } from "./utils.js";

const LOG_KEY = "fieldlog.workLogs";
const LOCATION_KEY = "fieldlog.locations";
const TODO_KEY = "fieldlog.todos";
const PROJECT_KEY = "fieldlog.projects";
const SETTINGS_KEY = "fieldlog.settings";
const RESET_VERSION_KEY = "fieldlog.resetVersion";
const CURRENT_RESET_VERSION = "blank-worklogs-v1";
const defaultSettings = { webAppUrl: GOOGLE_APPS_SCRIPT_WEB_APP_URL, sheetUrl: GOOGLE_SHEET_URL, lastSyncStatus: "", lastSyncAt: "" };

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const storage = {
  init() {
    const savedLogs = readJson(LOG_KEY, null);
    const resetVersion = localStorage.getItem(RESET_VERSION_KEY);
    if (resetVersion !== CURRENT_RESET_VERSION) {
      writeJson(LOG_KEY, []);
      localStorage.setItem(RESET_VERSION_KEY, CURRENT_RESET_VERSION);
    } else if (!savedLogs) {
      writeJson(LOG_KEY, sampleLogs);
    } else {
      writeJson(LOG_KEY, dedupeLogsByDate(savedLogs.map(({ photoReference, ...log }) => ({
        ...log,
        note: typeof log.note === "string" ? log.note.replace(" Pending confirmation photo.", " pending confirmation.").replace("Pending confirmation photo.", "Pending confirmation.") : log.note,
      }))));
    }
    const savedLocations = readJson(LOCATION_KEY, null);
    if (!savedLocations) {
      writeJson(LOCATION_KEY, presetLocations);
    } else {
      const customLocations = savedLocations.filter((location) => location.source === "Custom");
      writeJson(LOCATION_KEY, [...presetLocations, ...customLocations]);
    }
    if (!localStorage.getItem(TODO_KEY)) writeJson(TODO_KEY, []);
    if (!localStorage.getItem(PROJECT_KEY)) writeJson(PROJECT_KEY, []);
    const settings = readJson(SETTINGS_KEY, null);
    writeJson(SETTINGS_KEY, {
      ...defaultSettings,
      ...(settings || {}),
      sheetUrl: settings?.sheetUrl || GOOGLE_SHEET_URL,
      webAppUrl: GOOGLE_APPS_SCRIPT_WEB_APP_URL,
      lastSyncStatus: settings?.lastSyncStatus?.toLowerCase().includes("not configured") ? "" : settings?.lastSyncStatus || "",
    });
  },
  getLogs: () => sanitizeLogs(readJson(LOG_KEY, sampleLogs)),
  saveLogs: (logs) => writeJson(LOG_KEY, sanitizeLogs(logs)),
  getLocations: () => readJson(LOCATION_KEY, presetLocations),
  saveLocations: (locations) => writeJson(LOCATION_KEY, locations),
  getTodos: () => readJson(TODO_KEY, []),
  saveTodos: (todos) => writeJson(TODO_KEY, todos),
  getProjects: () => readJson(PROJECT_KEY, []),
  saveProjects: (projects) => writeJson(PROJECT_KEY, projects),
  getSettings: () => readJson(SETTINGS_KEY, defaultSettings),
  saveSettings: (settings) => writeJson(SETTINGS_KEY, settings),
};

function dedupeLogsByDate(logs) {
  const byDate = new Map();
  for (const log of sanitizeLogs(logs)) {
    const current = byDate.get(log.workDate);
    const currentTime = current ? new Date(current.updatedAt || current.createdAt || 0).getTime() : -1;
    const nextTime = new Date(log.updatedAt || log.createdAt || 0).getTime();
    if (!current || nextTime >= currentTime) byDate.set(log.workDate, log);
  }
  return Array.from(byDate.values()).sort((a, b) => new Date(`${b.workDate}T00:00:00`) - new Date(`${a.workDate}T00:00:00`));
}

function sanitizeLogs(logs) {
  return (logs || []).filter((log) => log?.workDate && !isWeekendDate(log.workDate));
}
