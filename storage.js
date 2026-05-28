import { GOOGLE_APPS_SCRIPT_WEB_APP_URL, GOOGLE_SHEET_URL, presetLocations, sampleLogs } from "./data.js";

const LOG_KEY = "fieldlog.workLogs";
const LOCATION_KEY = "fieldlog.locations";
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
      writeJson(LOG_KEY, savedLogs.map(({ photoReference, ...log }) => ({
        ...log,
        note: typeof log.note === "string" ? log.note.replace(" Pending confirmation photo.", " pending confirmation.").replace("Pending confirmation photo.", "Pending confirmation.") : log.note,
      })));
    }
    const savedLocations = readJson(LOCATION_KEY, null);
    if (!savedLocations) {
      writeJson(LOCATION_KEY, presetLocations);
    } else {
      const customLocations = savedLocations.filter((location) => location.source === "Custom");
      writeJson(LOCATION_KEY, [...presetLocations, ...customLocations]);
    }
    const settings = readJson(SETTINGS_KEY, null);
    writeJson(SETTINGS_KEY, {
      ...defaultSettings,
      ...(settings || {}),
      sheetUrl: settings?.sheetUrl || GOOGLE_SHEET_URL,
      webAppUrl: GOOGLE_APPS_SCRIPT_WEB_APP_URL,
      lastSyncStatus: settings?.lastSyncStatus?.toLowerCase().includes("not configured") ? "" : settings?.lastSyncStatus || "",
    });
  },
  getLogs: () => readJson(LOG_KEY, sampleLogs),
  saveLogs: (logs) => writeJson(LOG_KEY, logs),
  getLocations: () => readJson(LOCATION_KEY, presetLocations),
  saveLocations: (locations) => writeJson(LOCATION_KEY, locations),
  getSettings: () => readJson(SETTINGS_KEY, defaultSettings),
  saveSettings: (settings) => writeJson(SETTINGS_KEY, settings),
};
