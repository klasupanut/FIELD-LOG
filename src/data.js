export const START_TIME = "09:30";
export const END_TIME = "19:00";
export const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/13eliZlc2a7XhyzG22Iv1du0KM02LyxyMidO1SDzTI-4";
export const GOOGLE_APPS_SCRIPT_WEB_APP_URL = "";

export const presetLocations = [
  { id: "preset-voco", name: "VOCO", category: "Office", color: "#4f8f7a", source: "Preset", syncStatus: "Synced" },
  { id: "preset-chod1", name: "CHOD1", category: "Office", color: "#6f89b9", source: "Preset", syncStatus: "Synced" },
  { id: "preset-chod2", name: "CHOD2", category: "Office", color: "#6aa6bd", source: "Preset", syncStatus: "Synced" },
  { id: "preset-chod3", name: "CHOD3", category: "Office", color: "#9b86bd", source: "Preset", syncStatus: "Synced" },
  { id: "preset-chod5", name: "CHOD5", category: "Office", color: "#c98770", source: "Preset", syncStatus: "Synced" },
  { id: "preset-km8", name: "KM8", category: "Site", color: "#8d9a68", source: "Preset", syncStatus: "Synced" },
  { id: "preset-chaengwattana", name: "CHAENGWATTANA", category: "Site", color: "#c3996b", source: "Preset", syncStatus: "Synced" },
  { id: "preset-huahin", name: "HUAHIN", category: "Travel", color: "#66a59e", source: "Preset", syncStatus: "Synced" },
  { id: "preset-afs", name: "AFS", category: "Partner", color: "#8580c8", source: "Preset", syncStatus: "Synced" },
  { id: "preset-seminar", name: "Seminar", category: "Event", color: "#a58ac8", source: "Preset", syncStatus: "Synced" },
];

const today = new Date();
const iso = (offset) => {
  const date = new Date(today);
  date.setDate(today.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

export const sampleLogs = [];
