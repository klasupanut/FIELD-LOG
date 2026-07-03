import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { END_TIME, GOOGLE_APPS_SCRIPT_WEB_APP_URL, GOOGLE_SHEET_URL, START_TIME } from "./src/data.js";
import { storage } from "./src/storage.js";
import { deleteRemoteProject, deleteRemoteTodo, fetchRemoteData, syncLocation, syncProject, syncTodo, syncWorkLog } from "./src/sync.js";
import { bangkokDateKey, formatDate, isWeekendDate, monthKey, todayIso, uid } from "./src/utils.js";

storage.init();

const navItems = [
  ["dashboard", "Dashboard"],
  ["add-log", "Add Log"],
  ["calendar", "Calendar"],
  ["timeline", "Timeline"],
  ["review", "Memo"],
  ["projects", "Projects"],
  ["locations", "Locations"],
  ["integration", "Integration"],
];

const navIconPaths = {
  dashboard: [
    "M4 5.5A1.5 1.5 0 0 1 5.5 4h3A1.5 1.5 0 0 1 10 5.5v3A1.5 1.5 0 0 1 8.5 10h-3A1.5 1.5 0 0 1 4 8.5v-3Z",
    "M14 5.5A1.5 1.5 0 0 1 15.5 4h3A1.5 1.5 0 0 1 20 5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 14 8.5v-3Z",
    "M4 15.5A1.5 1.5 0 0 1 5.5 14h3a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3Z",
    "M14 15.5a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a1.5 1.5 0 0 1-1.5-1.5v-3Z",
  ],
  "add-log": [
    "M6 4.5h8.5L18 8v11.5H6V4.5Z",
    "M14 4.5V8h4",
    "M12 11v6",
    "M9 14h6",
  ],
  calendar: [
    "M6 4v3",
    "M18 4v3",
    "M4.5 8h15",
    "M5 6h14v14H5V6Z",
    "M8 11h2M12 11h2M16 11h2M8 15h2M12 15h2",
  ],
  timeline: [
    "M6 5v14",
    "M6 7h7",
    "M6 12h11",
    "M6 17h8",
    "M13 7l2 2-2 2",
    "M17 12l2 2-2 2",
  ],
  review: [
    "M5 5h14v14H5V5Z",
    "M8 9h5",
    "M8 13h8",
    "M8 16.5l1.8 1.8L14 14",
  ],
  projects: [
    "M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1",
    "M4 7h16v12H4V7Z",
    "M4 11h16",
    "M9 14h6",
  ],
  locations: [
    "M12 21s6-5.35 6-11a6 6 0 1 0-12 0c0 5.65 6 11 6 11Z",
    "M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  ],
  integration: [
    "M4 7h10",
    "M18 7h2",
    "M16 5v4",
    "M4 12h3",
    "M11 12h9",
    "M9 10v4",
    "M4 17h12",
    "M20 17h0",
    "M18 15v4",
  ],
};

function MenuIcon({ id, className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(navIconPaths[id] || navIconPaths.dashboard).map((path) => <path key={path} d={path} />)}
    </svg>
  );
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [logs, setLogs] = useState(storage.getLogs());
  const [locations, setLocations] = useState(storage.getLocations());
  const [todos, setTodos] = useState(storage.getTodos());
  const [projects, setProjects] = useState(storage.getProjects());
  const [settings, setSettings] = useState(storage.getSettings());
  const [toast, setToast] = useState("");
  const [lastAutoRefresh, setLastAutoRefresh] = useState("");
  const lastRemotePullRef = React.useRef(0);
  const isPullingRemoteRef = React.useRef(false);

  const saveLogs = (next) => {
    const weekdayLogs = dedupeLogsByWorkDate(next.filter((log) => !isWeekendDate(log.workDate)));
    setLogs(weekdayLogs);
    storage.saveLogs(weekdayLogs);
  };

  const saveLocations = (next) => {
    setLocations(next);
    storage.saveLocations(next);
  };

  const saveTodos = (next) => {
    setTodos(next);
    storage.saveTodos(next);
  };

  const saveProjects = (next) => {
    setProjects(next);
    storage.saveProjects(next);
  };

  const saveSettings = (next) => {
    setSettings(next);
    storage.saveSettings(next);
  };

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(window.__fieldLogToast);
    window.__fieldLogToast = window.setTimeout(() => setToast(""), 3200);
  };

  const refreshFromLocal = () => {
    setLogs(storage.getLogs());
    setLocations(storage.getLocations());
    setTodos(storage.getTodos());
    setProjects(storage.getProjects());
    setSettings(storage.getSettings());
    setLastAutoRefresh(new Date().toISOString());
  };

  const addWorkLog = async (draft) => {
    if (isWeekendDate(draft.workDate)) {
      notify("Sat/Sun are holidays. Work log was not saved.");
      return;
    }
    const existingLog = logs.find((log) => log.workDate === draft.workDate);
    const pendingLog = {
      id: existingLog?.id || uid("log"),
      createdAt: existingLog?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workDate: draft.workDate,
      startTime: START_TIME,
      endTime: END_TIME,
      location: draft.location,
      note: draft.note.trim(),
      attendanceStatus: draft.attendanceStatus || existingLog?.attendanceStatus || "",
      syncStatus: "Pending Sync",
    };
    const nextLogs = [pendingLog, ...logs.filter((log) => log.workDate !== draft.workDate)];
    saveLogs(nextLogs);

    try {
      await syncWorkLog(GOOGLE_APPS_SCRIPT_WEB_APP_URL, pendingLog);
      const synced = { ...pendingLog, syncStatus: "Synced" };
      saveLogs(nextLogs.map((log) => (log.id === synced.id ? synced : log)));
      saveSettings({ ...settings, lastSyncStatus: existingLog ? "Work log updated and synced" : "Last work log synced", lastSyncAt: new Date().toISOString() });
      notify(existingLog ? "Work log updated and synced." : "Work log saved and synced.");
    } catch (error) {
      saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify(existingLog ? "Work log updated locally. Sync is pending." : "Work log saved locally. Sync is pending.");
    }
  };

  const addLocation = async (draft) => {
    const pendingLocation = {
      id: uid("loc"),
      createdAt: new Date().toISOString(),
      name: draft.name.trim(),
      category: draft.category.trim(),
      color: draft.color || "#1f7a5c",
      source: "Custom",
      syncStatus: "Pending Sync",
    };
    const nextLocations = [...locations, pendingLocation];
    saveLocations(nextLocations);

    try {
      await syncLocation(GOOGLE_APPS_SCRIPT_WEB_APP_URL, pendingLocation);
      saveLocations(nextLocations.map((item) => (item.id === pendingLocation.id ? { ...item, syncStatus: "Synced" } : item)));
      saveSettings({ ...settings, lastSyncStatus: "Last location synced", lastSyncAt: new Date().toISOString() });
      notify("Location added and synced.");
    } catch (error) {
      saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Location added locally. Sync is pending.");
    }
  };

  const updateCustomLocation = (id, patch) => {
    const next = locations.map((item) => (item.id === id ? { ...item, ...patch, syncStatus: "Pending Sync" } : item));
    saveLocations(next);
    notify("Location updated locally.");
  };

  const deleteCustomLocation = (id) => {
    saveLocations(locations.filter((item) => item.id !== id));
    notify("Custom location deleted.");
  };

  const updateLogLocation = (id, nextLocation) => {
    const nextLogs = logs.map((log) => (
      log.id === id
        ? { ...log, location: nextLocation, syncStatus: log.syncStatus === "Synced" ? "Pending Sync" : log.syncStatus }
        : log
    ));
    saveLogs(nextLogs);
    notify("Log location updated locally.");
  };

  const stampTodayNormal = async () => {
    const workDate = todayIso();
    if (isWeekendDate(workDate)) {
      notify("Sat/Sun are holidays. Normal stamp was not saved.");
      return;
    }

    const existingLog = logs.find((log) => log.workDate === workDate);
    const pendingLog = {
      id: existingLog?.id || uid("log"),
      createdAt: existingLog?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workDate,
      startTime: START_TIME,
      endTime: END_TIME,
      location: existingLog?.location || "",
      note: existingLog?.note || "Normal stamped",
      attendanceStatus: "Normal",
      syncStatus: "Pending Sync",
    };
    const nextLogs = [pendingLog, ...logs.filter((log) => log.workDate !== workDate)];
    saveLogs(nextLogs);

    try {
      await syncWorkLog(GOOGLE_APPS_SCRIPT_WEB_APP_URL, pendingLog);
      const synced = { ...pendingLog, syncStatus: "Synced" };
      saveLogs(nextLogs.map((log) => (log.id === synced.id ? synced : log)));
      saveSettings({ ...storage.getSettings(), lastSyncStatus: "Normal stamp synced", lastSyncAt: new Date().toISOString() });
      notify("Normal stamped and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Normal stamped locally. Sync is pending.");
    }
  };

  const stampLogRevised = async (workDate) => {
    if (!workDate) return;
    if (isWeekendDate(workDate)) {
      notify("Sat/Sun are holidays. Revised stamp was not saved.");
      return;
    }

    const existingLog = logs.find((log) => log.workDate === workDate);
    const nextAttendanceStatus = isRevisedStamped(existingLog) ? "not revised" : "Revised";
    const pendingLog = {
      id: existingLog?.id || uid("log"),
      createdAt: existingLog?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workDate,
      startTime: START_TIME,
      endTime: END_TIME,
      location: existingLog?.location || "",
      note: existingLog?.note || nextAttendanceStatus,
      attendanceStatus: nextAttendanceStatus,
      syncStatus: "Pending Sync",
    };
    const nextLogs = [pendingLog, ...logs.filter((log) => log.workDate !== workDate)];
    saveLogs(nextLogs);

    try {
      await syncWorkLog(GOOGLE_APPS_SCRIPT_WEB_APP_URL, pendingLog);
      const synced = { ...pendingLog, syncStatus: "Synced" };
      saveLogs(nextLogs.map((log) => (log.id === synced.id ? synced : log)));
      saveSettings({ ...storage.getSettings(), lastSyncStatus: `${nextAttendanceStatus} stamp synced`, lastSyncAt: new Date().toISOString() });
      notify(nextAttendanceStatus === "Revised" ? "Revised stamped and synced." : "Revised cancelled and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify(nextAttendanceStatus === "Revised" ? "Revised stamped locally. Sync is pending." : "Revised cancelled locally. Sync is pending.");
    }
  };

  const addTodo = async (draft) => {
    const pendingTodo = {
      id: uid("todo"),
      createdAt: new Date().toISOString(),
      dueDate: draft.dueDate,
      task: draft.task.trim(),
      priority: draft.priority,
      status: draft.status,
      note: draft.note.trim(),
      syncStatus: "Pending Sync",
    };
    saveTodos([pendingTodo, ...todos]);

    try {
      await syncTodo(GOOGLE_APPS_SCRIPT_WEB_APP_URL, pendingTodo);
      saveTodos([{ ...pendingTodo, syncStatus: "Synced" }, ...todos]);
      saveSettings({ ...settings, lastSyncStatus: "Last memo synced", lastSyncAt: new Date().toISOString() });
      notify("Memo saved and synced.");
    } catch (error) {
      saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Memo saved locally. Sync is pending.");
    }
  };

  const updateTodo = async (id, patch) => {
    const targetTodo = todos.find((todo) => todo.id === id);
    if (!targetTodo) return;

    const updatedTodo = {
      ...targetTodo,
      ...patch,
      syncStatus: "Pending Sync",
    };
    const nextTodos = todos.map((todo) => (
      todo.id === id ? updatedTodo : todo
    ));
    saveTodos(nextTodos);

    try {
      await syncTodo(GOOGLE_APPS_SCRIPT_WEB_APP_URL, updatedTodo);
      saveTodos(nextTodos.map((todo) => (todo.id === id ? { ...updatedTodo, syncStatus: "Synced" } : todo)));
      saveSettings({ ...storage.getSettings(), lastSyncStatus: "Memo updated and synced", lastSyncAt: new Date().toISOString() });
      notify("Memo updated and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Memo updated locally. Sync is pending.");
    }
  };

  const deleteTodo = async (id) => {
    const targetTodo = todos.find((todo) => todo.id === id);
    if (!targetTodo) return;

    saveTodos(todos.filter((todo) => todo.id !== id));

    try {
      await deleteRemoteTodo(GOOGLE_APPS_SCRIPT_WEB_APP_URL, targetTodo);
      saveSettings({ ...storage.getSettings(), lastSyncStatus: "Memo deleted and synced", lastSyncAt: new Date().toISOString() });
      notify("Memo deleted and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Memo deleted locally. Delete sync is pending.");
    }
  };

  const addProject = async (draft) => {
    const project = {
      id: uid("project"),
      createdAt: new Date().toISOString(),
      name: draft.name.trim(),
      role: draft.role.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      status: draft.status,
      kpiNote: draft.kpiNote.trim(),
      syncStatus: "Pending Sync",
    };
    saveProjects([project, ...projects]);
    try {
      await syncProject(GOOGLE_APPS_SCRIPT_WEB_APP_URL, project);
      saveProjects([{ ...project, syncStatus: "Synced" }, ...projects]);
      notify("Project added and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Project added locally. Sync is pending.");
    }
  };

  const updateProject = async (id, patch) => {
    const target = projects.find((project) => project.id === id);
    if (!target) return;
    const updated = { ...target, ...patch, syncStatus: "Pending Sync" };
    const nextProjects = projects.map((project) => (project.id === id ? updated : project));
    saveProjects(nextProjects);
    try {
      await syncProject(GOOGLE_APPS_SCRIPT_WEB_APP_URL, updated);
      saveProjects(nextProjects.map((project) => (project.id === id ? { ...updated, syncStatus: "Synced" } : project)));
      notify("Project updated and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
    }
  };

  const deleteProject = async (id) => {
    const target = projects.find((project) => project.id === id);
    if (!target) return;
    saveProjects(projects.filter((project) => project.id !== id));
    try {
      await deleteRemoteProject(GOOGLE_APPS_SCRIPT_WEB_APP_URL, target);
      notify("Project deleted and synced.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
      notify("Project deleted locally. Delete sync is pending.");
    }
  };

  const syncPending = async () => {
    let nextLogs = [...logs];
    let nextLocations = [...locations];
    let syncedCount = 0;

    for (const log of nextLogs.filter((item) => item.syncStatus !== "Synced" && !isWeekendDate(item.workDate))) {
      try {
        await syncWorkLog(GOOGLE_APPS_SCRIPT_WEB_APP_URL, log);
        nextLogs = nextLogs.map((item) => (item.id === log.id ? { ...item, syncStatus: "Synced" } : item));
        syncedCount += 1;
      } catch (error) {
        saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
        break;
      }
    }

    for (const location of nextLocations.filter((item) => item.source === "Custom" && item.syncStatus !== "Synced")) {
      try {
        await syncLocation(GOOGLE_APPS_SCRIPT_WEB_APP_URL, location);
        nextLocations = nextLocations.map((item) => (item.id === location.id ? { ...item, syncStatus: "Synced" } : item));
        syncedCount += 1;
      } catch (error) {
        saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
        break;
      }
    }

    let nextTodos = [...todos];
    for (const todo of nextTodos.filter((item) => item.syncStatus !== "Synced")) {
      try {
        await syncTodo(GOOGLE_APPS_SCRIPT_WEB_APP_URL, todo);
        nextTodos = nextTodos.map((item) => (item.id === todo.id ? { ...item, syncStatus: "Synced" } : item));
        syncedCount += 1;
      } catch (error) {
        saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
        break;
      }
    }

    let nextProjects = [...projects];
    for (const project of nextProjects.filter((item) => item.syncStatus !== "Synced")) {
      try {
        await syncProject(GOOGLE_APPS_SCRIPT_WEB_APP_URL, project);
        nextProjects = nextProjects.map((item) => (item.id === project.id ? { ...item, syncStatus: "Synced" } : item));
        syncedCount += 1;
      } catch (error) {
        saveSettings({ ...settings, lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
        break;
      }
    }

    saveLogs(nextLogs);
    saveLocations(nextLocations);
    saveTodos(nextTodos);
    saveProjects(nextProjects);
    if (syncedCount) {
      saveSettings({ ...settings, lastSyncStatus: `${syncedCount} pending item(s) synced`, lastSyncAt: new Date().toISOString() });
      notify(`${syncedCount} pending item(s) synced.`);
    }
  };

  const pullRemoteData = async ({ quiet = true } = {}) => {
    if (!GOOGLE_APPS_SCRIPT_WEB_APP_URL || isPullingRemoteRef.current) return;
    isPullingRemoteRef.current = true;

    try {
      const remote = await fetchRemoteData(GOOGLE_APPS_SCRIPT_WEB_APP_URL);
      const nextLogs = mergeRemoteLogs(storage.getLogs(), remote.workLogs || []);
      const nextLocations = mergeRemoteLocations(storage.getLocations(), remote.locations || []);
      const nextTodos = mergeRemoteTodos(storage.getTodos(), remote.todos || []);
      const nextProjects = mergeRemoteProjects(storage.getProjects(), remote.projects || []);

      saveLogs(nextLogs);
      saveLocations(nextLocations);
      saveTodos(nextTodos);
      saveProjects(nextProjects);
      lastRemotePullRef.current = Date.now();
      saveSettings({ ...storage.getSettings(), lastSyncStatus: "Pulled latest Google Sheet data", lastSyncAt: new Date().toISOString() });
      if (!quiet) notify("Pulled latest Google Sheet data.");
    } catch (error) {
      saveSettings({ ...storage.getSettings(), lastSyncStatus: error.message, lastSyncAt: new Date().toISOString() });
    } finally {
      isPullingRemoteRef.current = false;
    }
  };

  const syncNow = async () => {
    await syncPending();
    await pullRemoteData({ quiet: false });
  };

  useEffect(() => {
    const pullIfDue = () => {
      if (GOOGLE_APPS_SCRIPT_WEB_APP_URL && Date.now() - lastRemotePullRef.current > 30000) pullRemoteData();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) pullIfDue();
    };

    pullIfDue();
    window.addEventListener("focus", pullIfDue);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const timer = window.setInterval(() => {
      refreshFromLocal();
      if (GOOGLE_APPS_SCRIPT_WEB_APP_URL) {
        syncPending();
        if (Date.now() - lastRemotePullRef.current > 30000) pullRemoteData();
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", pullIfDue);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [logs, locations, todos, projects, settings]);

  const pageProps = { logs, locations, todos, projects, settings, saveSettings, addWorkLog, addLocation, addTodo, updateTodo, deleteTodo, addProject, updateProject, deleteProject, setPage, updateLogLocation, stampTodayNormal, stampLogRevised, updateCustomLocation, deleteCustomLocation, syncPending: syncNow, notify };

  return (
    <div className="min-h-screen bg-[#f6f8fb] lg:flex">
      <Nav page={page} setPage={setPage} />
      <div className="min-w-0 flex-1 lg:pl-20">
      <Header settings={settings} pendingCount={logs.filter((item) => item.syncStatus !== "Synced").length + locations.filter((item) => item.source === "Custom" && item.syncStatus !== "Synced").length + todos.filter((item) => item.syncStatus !== "Synced").length + projects.filter((item) => item.syncStatus !== "Synced").length} syncPending={syncNow} lastAutoRefresh={lastAutoRefresh} />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
        <section className="min-w-0 flex-1">
          {page === "dashboard" && <Dashboard {...pageProps} />}
          {page === "add-log" && <AddWorkLog {...pageProps} />}
          {page === "calendar" && <CalendarView {...pageProps} />}
          {page === "timeline" && <TimelineView {...pageProps} />}
          {page === "review" && <MemoTodos {...pageProps} />}
          {page === "projects" && <ProjectsOnHand {...pageProps} />}
          {page === "locations" && <LocationSettings {...pageProps} />}
          {page === "integration" && <IntegrationSettings {...pageProps} />}
        </section>
      </main>
      </div>
      <MobileNav page={page} setPage={setPage} />
      {toast && <div className="fixed bottom-20 left-4 right-4 z-50 rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-soft sm:bottom-4 sm:left-auto sm:right-6 sm:w-fit">{toast}</div>}
    </div>
  );
}

function Header({ settings, pendingCount, syncPending, lastAutoRefresh }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/92 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-500 text-lg font-black text-white">OP</div>
          <div>
            <h1 className="text-xl font-bold tracking-normal">FieldLog</h1>
            <p className="text-xs text-slate-500">09:30 - 19:00 attendance field record</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge status={pendingCount ? "Pending Sync" : "Synced"} />
          {settings.sheetUrl && <a href={settings.sheetUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">Open Sheet</a>}
          {settings.lastSyncStatus && <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-600">{settings.lastSyncStatus}</span>}
          {lastAutoRefresh && <span className="hidden rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-500 sm:inline-flex">Auto refreshed {new Date(lastAutoRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={syncPending} className="rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-2 font-semibold text-white transition hover:from-sky-600 hover:to-indigo-600">Sync</button>
        </div>
      </div>
    </header>
  );
}

function Nav({ page, setPage }) {
  return (
    <nav className="group/sidebar fixed left-0 top-0 z-40 hidden h-screen w-20 flex-col overflow-hidden border-r border-white/10 bg-[#071826]/78 text-white shadow-2xl backdrop-blur-2xl transition-[width] duration-300 ease-out hover:w-64 lg:flex">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-sky-500 to-indigo-500 text-xs font-black">OP</div>
        <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
          <div className="text-xl font-black">FieldLog</div>
          <div className="whitespace-nowrap text-xs text-slate-400">Field attendance</div>
        </div>
      </div>
      <div className="flex-1 px-3 py-5">
          <div className="space-y-2">
            {navItems.map(([id, label]) => (
              <button key={id} onClick={() => setPage(id)} title={label} className={`flex w-full items-center gap-3 rounded-md px-2 py-3 text-left text-sm font-bold transition ${page === id ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-lg shadow-indigo-950/20" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${page === id ? "bg-white/20 text-white" : "bg-white/10 text-slate-200"}`}><MenuIcon id={id} /></span>
                <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
                  {label === "Add Log" ? "Add Work Log" : label === "Memo" ? "Memo Todo" : label === "Projects" ? "Projects on hand" : label === "Integration" ? "Settings" : label}
                </span>
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-md bg-white/10 p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/10 text-xs font-black">SN</div>
          <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
          <div className="whitespace-nowrap text-sm font-bold">SUPANUT N.</div>
          <div className="whitespace-nowrap text-xs text-slate-400 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">Senior Engineer</div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function MobileNav({ page, setPage }) {
  const mobileItems = [
    ["dashboard", "Dashboard"],
    ["add-log", "Add Work Log"],
    ["calendar", "Calendar"],
    ["timeline", "Timeline"],
    ["review", "Memo Todo"],
    ["projects", "Projects on hand"],
    ["locations", "Locations"],
    ["integration", "Settings"],
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-8 gap-1">
        {mobileItems.map(([id, label]) => (
          <button key={id} onClick={() => setPage(id)} title={label} aria-label={label} className={`grid min-h-11 place-items-center rounded-md px-1 text-[11px] font-black transition ${page === id ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
            <span className={`grid h-8 w-8 place-items-center rounded-md ${page === id ? "bg-white/15" : "bg-slate-100"}`}><MenuIcon id={id} className="h-[18px] w-[18px]" /></span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Dashboard({ logs, locations, projects, todos, setPage, stampTodayNormal }) {
  const sortedLogs = sortLogsByDateDesc(logs);
  const todayLog = sortedLogs.find((log) => log.workDate === todayIso());
  const currentMonth = todayIso().slice(0, 7);
  const monthLogs = sortedLogs.filter((log) => monthKey(log.workDate) === currentMonth);
  const currentYear = Number(todayIso().slice(0, 4));
  const dashboardProjects = sortProjectsForTimeline(projects.filter((project) => projectOverlapsYear(project, currentYear)), currentYear);
  const todayLocation = todayLog ? findLocation(locations, todayLog.location) : null;
  const todayIsNormal = isNormalStamped(todayLog);
  const todayLocationColor = todayLocation?.color || (todayIsNormal ? "#6366f1" : "#94a3b8");

  return (
    <div className="space-y-4">
      <div className="hidden items-center justify-between gap-4 lg:flex">
        <div>
          <h1 className="text-2xl font-black tracking-normal">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back. Here is your field attendance overview.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">{formatDate(todayIso())}</div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.82fr)_minmax(580px,1.35fr)]">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex h-full flex-col">
            <div className="flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-black">Today&apos;s Status</h2>
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-white/70 bg-white/70 px-2.5 py-1.5 text-xs font-black text-slate-700 shadow-sm">
                <LocationPin color={todayLocationColor} />
                <span className="max-w-36 truncate">{todayLog ? todayLog.location || todayLog.attendanceStatus || "Logged" : "Not logged"}</span>
              </div>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-black ${todayLog ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`}>{todayLog ? "\u2713" : "!"}</div>
              <div>
                <p className="text-sm text-slate-500">{todayLog ? "You have logged your work today." : "No work log has been saved today."}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{START_TIME} - {END_TIME}</p>
                {todayLog?.note && <p className="mt-1 max-h-9 overflow-hidden text-xs font-semibold text-slate-500">{todayLog.note}</p>}
              </div>
            </div>
            {todayIsNormal && <div className="mt-3 rounded-md border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-xs font-black text-indigo-700">Normal stamped. No month-end adjustment needed.</div>}
            <div className="mt-5 border-t border-white/70 pt-4">
              <h3 className="text-xs font-black uppercase text-slate-400">This Month Summary</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <SummaryLine label="Total Days Logged" value={`${monthLogs.length} days`} tone="blue" />
                <SummaryLine label="Unique Locations" value={`${new Set(monthLogs.map((log) => log.location)).size} locations`} tone="emerald" />
                <SummaryLine label="Total Work Hours" value={`${(monthLogs.length * 9.5).toFixed(1)} hrs`} tone="amber" />
              </div>
            </div>
            </div>
            <button onClick={stampTodayNormal} className={`mt-5 w-full translate-y-1 rounded-md border px-4 py-3 text-sm font-black shadow-sm transition ${todayIsNormal ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" : "border-indigo-200 bg-gradient-to-r from-sky-500 to-indigo-500 text-white hover:from-sky-600 hover:to-indigo-600"}`}>
              {todayIsNormal ? "Normal stamped" : "Normal stampped"}
            </button>
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black">Projects on hand</h2>
            <button onClick={() => setPage("projects")} className="text-xs font-black text-indigo-700">View all</button>
          </div>
          <DashboardProjectTimeline projects={dashboardProjects} year={currentYear} setPage={setPage} />
        </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DashboardCalendar logs={sortedLogs} locations={locations} setPage={setPage} />
        <TodoEisenhowerMatrix todos={todos} setPage={setPage} />
      </div>
    </div>
  );
}

function AddWorkLog({ locations, addWorkLog, addLocation }) {
  const [draft, setDraft] = useState({ workDate: todayIso(), location: locations[0]?.name || "", note: "" });
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!draft.location || isSaving) return;
    setIsSaving(true);
    try {
      await addWorkLog(draft);
      setDraft({ workDate: todayIso(), location: draft.location, note: "" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <PageTitle title="Add Work Log" subtitle="Date, place, note, and the locked attendance time range." />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Date"><input type="date" value={draft.workDate} onChange={(e) => setDraft({ ...draft, workDate: e.target.value })} className="input" required /></Field>
          <Field label="Fixed Work Time"><div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-700">{START_TIME} - {END_TIME}</div></Field>
          <Field label="Location">
            <div className="flex gap-2">
              <select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} className="input min-w-0 flex-1" required>
                {locations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}
              </select>
              <button type="button" onClick={() => setShowLocationForm(!showLocationForm)} className="rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700">Add</button>
            </div>
          </Field>
          <Field label="Work Details / Note" wide><textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="input min-h-32" placeholder="Short attendance verification note" /></Field>
        </div>
        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
          <button disabled={isSaving} className="w-full rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-3 text-sm font-bold text-white transition hover:from-sky-600 hover:to-indigo-600 disabled:cursor-wait disabled:from-slate-300 disabled:to-slate-300 sm:w-auto">{isSaving ? "Saving..." : "Save Log"}</button>
        </div>
      </form>
      <aside className="space-y-4">
        {showLocationForm && <LocationForm addLocation={addLocation} afterAdd={(name) => { setDraft({ ...draft, location: name }); setShowLocationForm(false); }} />}
        <SheetStructure />
      </aside>
    </div>
  );
}

function LocationForm({ addLocation, afterAdd }) {
  const [draft, setDraft] = useState({ name: "", category: "", color: "#1f7a5c" });
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    await addLocation(draft);
    afterAdd?.(draft.name.trim());
    setDraft({ name: "", category: "", color: "#1f7a5c" });
  };
  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">Add Location</h2>
      <div className="space-y-3">
        <Field label="Location Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input" required /></Field>
        <Field label="Optional Category"><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="input" /></Field>
        <Field label="Optional Color"><input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-11 w-full rounded-md border border-slate-300 bg-white p-1" /></Field>
      </div>
      <button className="mt-4 w-full rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white">Save Location</button>
    </form>
  );
}

function CalendarView({ logs, locations, stampLogRevised }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const days = calendarDays(month);
  const logsByDate = useMemo(() => groupBy(logs.filter((log) => monthKey(log.workDate) === month), "workDate"), [logs, month]);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageTitle title="Calendar View" subtitle="Monthly overview with location tags on work dates." />
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input sm:w-48" />
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="bg-slate-50 p-2 text-center text-xs font-bold text-slate-500">{day}</div>)}
        {days.map((day, index) => {
          const dayLogs = day ? logsByDate[day] || [] : [];
          const firstLogLocation = dayLogs[0] ? findLocation(locations, dayLogs[0].location) : null;
          const mobileSoft = dayLogs[0] ? softenColor(firstLogLocation?.color || "#4f8f7a") : null;
          const isWeekend = index % 7 >= 5;
          const isNormal = dayLogs.some(isNormalStamped);
          const isRevised = dayLogs.some(isRevisedStamped);
          const isHoliday = dayLogs.some(isHolidayLog);
          return (
            <div
              key={`${day}-${index}`}
              className={`calendar-mobile-day flex min-h-[92px] flex-col p-1.5 sm:min-h-24 sm:p-2 ${isHoliday ? "calendar-holiday-day" : isRevised ? "calendar-revised-day" : isNormal ? "calendar-normal-day" : isWeekend ? "calendar-weekend-day" : "bg-white"} ${dayLogs.length ? "has-log" : ""}`}
              style={{
                "--mobile-log-bg": mobileSoft?.bg || "#fff",
                "--mobile-log-border": mobileSoft?.border || "transparent",
              }}
            >
              {day && (
                <div className="mb-2 flex items-start justify-between gap-1">
                  <span className="text-sm font-bold">{Number(day.slice(-2))}</span>
                  {!isWeekend && (
                    <button
                      type="button"
                      onClick={() => stampLogRevised(day)}
                      className={`hidden rounded px-1.5 py-0.5 text-[9px] font-black leading-none transition sm:inline-flex ${isRevised ? "bg-emerald-600 text-white" : "bg-white/80 text-emerald-700 hover:bg-emerald-50"}`}
                    >
                      REVISED
                    </button>
                  )}
                </div>
              )}
              <div className="flex min-h-3 flex-1 flex-wrap content-start gap-1 sm:hidden">
                {dayLogs.slice(0, 3).map((log) => <LocationDot key={`${log.id}-mobile-dot`} name={log.location} locations={locations} />)}
              </div>
              <div className="mt-1 hidden space-y-1 sm:block">
                {dayLogs.slice(0, 2).map((log) => <LocationTag key={log.id} name={log.location} locations={locations} small />)}
              </div>
              {day && !isWeekend && (
                <button
                  type="button"
                  onClick={() => stampLogRevised(day)}
                  className={`mt-auto w-full overflow-hidden rounded px-0.5 py-1 text-[7px] font-black leading-none tracking-normal transition sm:hidden ${isRevised ? "bg-emerald-600 text-white" : "bg-white/85 text-emerald-700 hover:bg-emerald-50"}`}
                >
                  REVISED
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TimelineView({ logs, locations, updateLogLocation }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [location, setLocation] = useState("All");
  const filtered = sortLogsByDateDesc(logs).filter((log) => monthKey(log.workDate) === month && (location === "All" || log.location === location));
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PageTitle title="Timeline View" subtitle="Review work logs by date, month, and location." />
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
          <select value={location} onChange={(e) => setLocation(e.target.value)} className="input">
            <option>All</option>
            {locations.map((item) => <option key={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map((log) => (
          <div key={log.id} className="grid gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[72px_1fr_auto] sm:items-center">
            <div className="rounded-md bg-white p-3 text-center shadow-sm">
              <div className="text-2xl font-black leading-none">{Number(log.workDate.slice(-2))}</div>
              <div className="mt-1 text-xs font-bold text-slate-400">{new Date(`${log.workDate}T00:00:00+07:00`).toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Bangkok" })}</div>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <EditableLocationSelect value={log.location} locations={locations} onChange={(nextLocation) => updateLogLocation(log.id, nextLocation)} />
                <span className="text-sm font-semibold text-slate-500">{log.startTime} - {log.endTime}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{log.note || "No note"}</p>
            </div>
            <div className="sm:justify-self-end">
              <StatusBadge status={log.syncStatus} />
            </div>
          </div>
        ))}
        {!filtered.length && <EmptyState text="No logs match this filter." />}
      </div>
    </section>
  );
}

function MemoTodos({ todos, addTodo, updateTodo, deleteTodo }) {
  const [draft, setDraft] = useState({ dueDate: todayIso(), task: "", priority: "Normal", status: "Open", note: "" });
  const sortedTodos = sortTodos(todos);

  const submit = async (event) => {
    event.preventDefault();
    if (!draft.task.trim()) return;
    await addTodo(draft);
    setDraft({ dueDate: todayIso(), task: "", priority: "Normal", status: "Open", note: "" });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <PageTitle title="Memo Todo" subtitle="จดงานที่ต้องทำไว้เตือนความจำระหว่างวัน." />
        <div className="mt-4 space-y-3">
          <Field label="Task"><input value={draft.task} onChange={(event) => setDraft({ ...draft, task: event.target.value })} className="input" placeholder="เช่น โทร follow up, ตรวจเอกสาร, เตรียม report" required /></Field>
          <Field label="Due Date"><input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} className="input" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Priority">
              <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })} className="input">
                <option>Normal</option>
                <option>High</option>
                <option>Low</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="input">
                <option>Open</option>
                <option>Doing</option>
                <option>Done</option>
              </select>
            </Field>
          </div>
          <Field label="Note"><textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="input min-h-28" placeholder="รายละเอียดสั้น ๆ" /></Field>
        </div>
        <button className="mt-4 w-full rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white transition hover:from-sky-600 hover:to-indigo-600">Save Memo</button>
      </form>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <PageTitle title="Todo List" subtitle="แก้ status และ priority ได้จากมือถือทันที." />
          <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{sortedTodos.length} items</span>
        </div>
        <div className="space-y-3">
          {sortedTodos.map((todo) => (
            <article key={todo.id} className={`rounded-md border p-3 ${todo.status === "Done" ? "border-indigo-100 bg-indigo-50/60" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">{formatDate(todo.dueDate)}</span>
                    <TodoPill value={todo.priority} />
                    <StatusBadge status={todo.syncStatus} />
                  </div>
                  <h3 className={`mt-2 text-base font-black ${todo.status === "Done" ? "text-slate-400 line-through" : "text-ink"}`}>{todo.task}</h3>
                  {todo.note && <p className="mt-1 text-sm text-slate-600">{todo.note}</p>}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] lg:w-[360px]">
                  <select value={todo.status} onChange={(event) => updateTodo(todo.id, { status: event.target.value })} className="input">
                    <option>Open</option>
                    <option>Doing</option>
                    <option>Done</option>
                  </select>
                  <select value={todo.priority} onChange={(event) => updateTodo(todo.id, { priority: event.target.value })} className="input">
                    <option>Normal</option>
                    <option>High</option>
                    <option>Low</option>
                  </select>
                  <button onClick={() => deleteTodo(todo.id)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Delete</button>
                </div>
              </div>
            </article>
          ))}
          {!sortedTodos.length && <EmptyState text="ยังไม่มี memo todo. เพิ่มงานแรกจากฟอร์มด้านซ้ายได้เลย." />}
        </div>
      </section>
    </div>
  );
}

function ProjectsOnHand({ projects, addProject, updateProject, deleteProject }) {
  const [draft, setDraft] = useState({
    name: "",
    role: "Owner",
    startDate: `${todayIso().slice(0, 4)}-01-01`,
    endDate: `${todayIso().slice(0, 4)}-12-31`,
    status: "Active",
    kpiNote: "",
  });
  const [year, setYear] = useState(todayIso().slice(0, 4));
  const sortedProjects = sortProjectsForTimeline(projects.filter((project) => projectOverlapsYear(project, year)), year);

  const submit = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) return;
    addProject(draft);
    setDraft({ ...draft, name: "", kpiNote: "" });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <form onSubmit={submit} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <PageTitle title="Projects on hand" subtitle="บันทึกโปรเจกต์ที่ดูแลไว้ใช้ประเมิน KPI ปลายปี." />
        <div className="mt-4 space-y-3">
          <Field label="Project Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="input" placeholder="เช่น Data Center Expansion" required /></Field>
          <Field label="Role"><input value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} className="input" placeholder="Owner / Support / Coordinator" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Start Date"><input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} className="input" /></Field>
            <Field label="End Date"><input type="date" value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} className="input" /></Field>
          </div>
          <Field label="Status">
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className="input">
              <option>Active</option>
              <option>Planning</option>
              <option>On Hold</option>
              <option>Completed</option>
            </select>
          </Field>
          <Field label="KPI Note"><textarea value={draft.kpiNote} onChange={(event) => setDraft({ ...draft, kpiNote: event.target.value })} className="input min-h-28" placeholder="Impact, responsibility, deliverables, risk, or achievement notes" /></Field>
        </div>
        <button className="mt-4 w-full rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-3 text-sm font-bold text-white transition hover:from-sky-600 hover:to-indigo-600">Add Project</button>
      </form>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PageTitle title="Project Timeline" subtitle="Timeline รายปีของโปรเจกต์ที่อยู่ในมือ." />
          <input type="number" value={year} onChange={(event) => setYear(event.target.value)} className="input sm:w-32" min="2020" max="2100" />
        </div>
        <div className="space-y-4">
          {sortedProjects.map((project) => (
            <article key={project.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill value={project.status} />
                    <StatusBadge status={project.syncStatus || "Synced"} />
                    <span className="text-xs font-bold text-slate-500">{project.role || "Owner"}</span>
                    <span className="text-xs font-bold text-slate-400">{formatCompactDate(project.startDate)} - {formatCompactDate(project.endDate)}</span>
                  </div>
                  <h3 className="mt-2 text-base font-black text-ink">{project.name}</h3>
                  {project.kpiNote && <p className="mt-1 text-sm text-slate-600">{project.kpiNote}</p>}
                </div>
                <button onClick={() => deleteProject(project.id)} className="rounded-md border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Delete</button>
              </div>
              <ProjectTimelineBar project={project} year={year} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(300px,1fr)_132px_132px_132px]">
                <input value={project.name} onChange={(event) => updateProject(project.id, { name: event.target.value })} className="input" />
                <select value={project.status} onChange={(event) => updateProject(project.id, { status: event.target.value })} className="input">
                  <option>Active</option>
                  <option>Planning</option>
                  <option>On Hold</option>
                  <option>Completed</option>
                </select>
                <input type="date" value={project.startDate} onChange={(event) => updateProject(project.id, { startDate: event.target.value })} className="input px-2 text-xs" />
                <input type="date" value={project.endDate} onChange={(event) => updateProject(project.id, { endDate: event.target.value })} className="input px-2 text-xs" />
              </div>
            </article>
          ))}
          {!sortedProjects.length && <EmptyState text="ยังไม่มี projects on hand สำหรับปีนี้." />}
        </div>
      </section>
    </div>
  );
}

function LocationSettings({ locations, addLocation, updateCustomLocation, deleteCustomLocation }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <LocationForm addLocation={addLocation} />
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <PageTitle title="Location Settings" subtitle="Preset locations plus editable custom locations synced to Google Sheets." />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {locations.map((location) => (
            <div key={location.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <LocationTag name={location.name} locations={locations} />
                <StatusBadge status={location.syncStatus} />
              </div>
              <div className="mt-3 text-sm text-slate-500">{location.category || "No category"} / {location.source}</div>
              {location.source === "Custom" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input value={location.category} onChange={(e) => updateCustomLocation(location.id, { category: e.target.value })} className="input" placeholder="Category" />
                  <input type="color" value={location.color} onChange={(e) => updateCustomLocation(location.id, { color: e.target.value })} className="h-11 w-full rounded-md border border-slate-300 bg-white p-1 sm:w-14" />
                  <button onClick={() => deleteCustomLocation(location.id)} className="rounded-md border border-red-200 px-3 text-sm font-bold text-red-700">Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function IntegrationSettings({ settings, syncPending }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <PageTitle title="Integration Settings" subtitle="FieldLog saves locally first, then sends records to the connected Google Sheet when sync is active." />
      <div className="mt-4 space-y-4">
        <div className="rounded-md border border-indigo-100 bg-indigo-50 p-4">
          <div className="text-sm font-bold text-indigo-950">Connected Google Sheet</div>
          <a href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-semibold text-indigo-800 underline decoration-indigo-300 underline-offset-4">
            {GOOGLE_SHEET_URL}
          </a>
        </div>
        <div className={`rounded-md border p-4 text-sm ${GOOGLE_APPS_SCRIPT_WEB_APP_URL ? "border-indigo-100 bg-indigo-50 text-indigo-900" : "border-amber-100 bg-amber-50 text-amber-900"}`}>
          <div className="font-bold">{GOOGLE_APPS_SCRIPT_WEB_APP_URL ? "Auto sync is active" : "Auto sync is not active yet"}</div>
          <p className="mt-1">{GOOGLE_APPS_SCRIPT_WEB_APP_URL ? "Work logs create or update one Google Sheets row per date automatically." : "Pending Sync means the record is saved on this device, but the Google Sheet backend URL has not been deployed in code yet."}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={syncPending} className="rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white">Sync Pending</button>
          <a href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer" className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-bold text-slate-700">Open Sheet</a>
        </div>
        <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
          <div className="font-bold text-ink">Last sync status</div>
          <p>{settings.lastSyncStatus || "Google Sheet is connected. Automatic append sync will activate after sync is turned on."}</p>
          {settings.lastSyncAt && <p className="mt-1 text-xs">Updated: {new Date(settings.lastSyncAt).toLocaleString()}</p>}
        </div>
      </div>
    </section>
  );
}

function RecentLogs({ logs, locations }) {
  const sortedLogs = sortLogsByDateDesc(logs);
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-bold">Recent Logs</h2>
      <div className="space-y-3">
        {sortedLogs.map((log) => (
          <div key={log.id} className="flex flex-col gap-2 rounded-md bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-500">{log.workDate === todayIso() ? "Today" : formatDate(log.workDate)}</div>
              <div className="font-black">{log.location}</div>
              <div className="text-sm text-slate-500">{log.startTime} - {log.endTime} / {log.note || "No note"}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={log.syncStatus} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DashboardProjectTimeline({ projects, year, setPage }) {
  const [selectedId, setSelectedId] = useState("");
  const selectedProject = projects.find((project) => project.id === selectedId);
  const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const height = Math.max(84, projects.length * 24 + 22);

  if (!projects.length) return <EmptyState text="No projects on hand this year." />;

  return (
    <div>
      <div className="relative rounded-md border border-slate-200 bg-slate-50 p-3" style={{ height }}>
        <div className="absolute inset-x-3 top-3 grid grid-cols-12 text-center text-[9px] font-black text-slate-400">
          {months.map((month, index) => <span key={`${month}-${index}`}>{month}</span>)}
        </div>
        <div className="absolute inset-x-3 top-8 bottom-3 rounded-md bg-white shadow-inner">
          {projects.map((project, index) => {
            const range = projectTimelineRange(project, year);
            const active = selectedId === project.id;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedId(active ? "" : project.id)}
                onDoubleClick={() => setPage("projects")}
                title={`${project.name}: ${formatDate(project.startDate)} - ${formatDate(project.endDate)}`}
                className={`absolute h-4 rounded-full border transition hover:scale-y-125 ${active ? "border-indigo-700 bg-gradient-to-r from-sky-500 to-indigo-500 shadow-md" : projectTimelineTone(project.status)}`}
                style={{ left: `${range.left}%`, width: `${range.width}%`, top: `${index * 22 + 8}px` }}
              />
            );
          })}
        </div>
      </div>
      <button onClick={() => selectedProject ? setPage("projects") : undefined} className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-700">
        {selectedProject ? `${selectedProject.name} / ${formatCompactDate(selectedProject.startDate)} - ${formatCompactDate(selectedProject.endDate)} / ${selectedProject.status}` : "Click a bar to show project name"}
      </button>
    </div>
  );
}

function TodoEisenhowerMatrix({ todos, setPage }) {
  const today = todayIso();
  const todayValue = dateValue(today);
  const activeTodos = sortTodos(todos).filter((todo) => !isTodoDone(todo));
  const quadrants = [
    {
      id: "do",
      title: "Do first",
      subtitle: "Important and urgent",
      tone: "border-red-100 bg-red-50/60",
      items: activeTodos.filter((todo) => todo.priority === "High" && dateValue(todo.dueDate) <= todayValue),
    },
    {
      id: "schedule",
      title: "Schedule",
      subtitle: "Important, not urgent",
      tone: "border-sky-100 bg-sky-50/60",
      items: activeTodos.filter((todo) => todo.priority === "High" && dateValue(todo.dueDate) > todayValue),
    },
    {
      id: "follow",
      title: "Follow up",
      subtitle: "Urgent, lower priority",
      tone: "border-amber-100 bg-amber-50/60",
      items: activeTodos.filter((todo) => todo.priority !== "High" && dateValue(todo.dueDate) <= todayValue),
    },
    {
      id: "later",
      title: "Later",
      subtitle: "Lower priority, not urgent",
      tone: "border-slate-200 bg-slate-50",
      items: activeTodos.filter((todo) => todo.priority !== "High" && dateValue(todo.dueDate) > todayValue),
    },
  ];

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Todo Eisenhower Matrix</h2>
          <p className="text-xs font-semibold text-slate-500">Open and doing items only</p>
        </div>
        <button onClick={() => setPage("review")} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700">Open Memo</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {quadrants.map((quadrant) => (
          <div key={quadrant.id} className={`min-h-44 rounded-md border p-3 ${quadrant.tone}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-ink">{quadrant.title}</h3>
                <p className="text-xs font-semibold text-slate-500">{quadrant.subtitle}</p>
              </div>
              <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-black text-slate-600">{quadrant.items.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {quadrant.items.map((todo) => (
                <button key={todo.id} onClick={() => setPage("review")} className="w-full rounded-md border border-white/70 bg-white/90 p-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-black text-ink">{todo.task}</span>
                    <TodoPill value={todo.priority} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                    <span>{formatDate(todo.dueDate)}</span>
                    <span>{todo.status}</span>
                  </div>
                </button>
              ))}
              {!quadrant.items.length && <div className="rounded-md border border-dashed border-white/80 bg-white/50 p-4 text-center text-xs font-bold text-slate-500">No items</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WorkLogHeatmap({ logs, locations }) {
  const month = todayIso().slice(0, 7);
  const days = calendarDays(month).filter(Boolean);
  const logsByDate = useMemo(() => groupBy(logs.filter((log) => monthKey(log.workDate) === month), "workDate"), [logs, month]);
  const loggedDays = days.filter((day) => logsByDate[day]?.length).length;

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Work Log Heat Map</h2>
        <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{loggedDays} days</span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const log = logsByDate[day]?.[0];
          const location = log ? findLocation(locations, log.location) : null;
          const soft = log ? softenColor(location?.color || "#4f8f7a") : null;
          return (
            <div
              key={`heat-${day}`}
              title={log ? `${formatDate(day)} - ${log.location}` : formatDate(day)}
              className="aspect-square rounded-md border text-center text-[11px] font-bold transition hover:-translate-y-0.5 hover:shadow-sm"
              style={{
                backgroundColor: soft?.bg || "#f8fafc",
                borderColor: soft?.border || "#e2e8f0",
                color: soft?.text || "#94a3b8",
              }}
            >
              <div className="grid h-full place-items-center">{Number(day.slice(-2))}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {getTopLocations(logs.filter((log) => monthKey(log.workDate) === month)).map(([name]) => <LocationTag key={name} name={name} locations={locations} />)}
      </div>
    </section>
  );
}

function SheetStructure() {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 text-lg font-bold">Google Sheet Tabs</h2>
      <p className="text-slate-600">WorkLogs, Locations, Todos, and Projects are synced through the automatic sync service.</p>
      <div className="mt-3 space-y-2 text-xs text-slate-500">
        <p><strong>WorkLogs:</strong> Timestamp Created, Work Date, Start Time, End Time, Location, Note, Sync Status, Attendance Status</p>
        <p><strong>Locations:</strong> Timestamp Created, Location Name, Category, Color, Source, Sync Status</p>
        <p><strong>Todos:</strong> Timestamp Created, Due Date, Task, Priority, Status, Note, Sync Status</p>
        <p><strong>Projects:</strong> Timestamp Created, Project Name, Role, Start Date, End Date, Status, KPI Note, Sync Status</p>
      </div>
    </section>
  );
}

function AppsScriptHint() {
  return (
    <details className="rounded-md border border-slate-200 p-4 text-sm">
      <summary className="cursor-pointer font-bold">Expected webhook payload</summary>
      <pre className="thin-scrollbar mt-3 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{`{
  "action": "appendWorkLog" | "appendLocation" | "appendTodo" | "appendProject" | "ping",
  "sheet": "WorkLogs" | "Locations" | "Todos" | "Projects",
  "row": { "...matching sheet columns": "..." }
}`}</pre>
    </details>
  );
}

function Metric({ title, value, detail }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-bold uppercase text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-black tracking-normal">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{detail}</div>
    </section>
  );
}

function SummaryLine({ label, value, tone }) {
  const tones = {
    blue: "bg-sky-50 text-sky-700",
    emerald: "bg-indigo-50 text-indigo-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-[18px] w-[18px] place-items-center rounded-full ${tones[tone] || tones.emerald}`}>
        <span className="summary-pulse-dot" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-black">{value}</div>
      </div>
    </div>
  );
}

function DashboardCalendar({ logs, locations, setPage }) {
  const month = todayIso().slice(0, 7);
  const days = calendarDays(month);
  const logsByDate = useMemo(() => groupBy(logs.filter((log) => monthKey(log.workDate) === month), "workDate"), [logs, month]);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black">This Month Calendar Overview</h2>
        <button onClick={() => setPage("add-log")} className="rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:from-sky-600 hover:to-indigo-600">Add Today Log</button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="bg-slate-50 p-2 text-center text-[11px] font-bold text-slate-500">{day}</div>)}
        {days.map((day, index) => {
          const dayLogs = day ? logsByDate[day] || [] : [];
          const isToday = day === todayIso();
          const isWeekend = index % 7 >= 5;
          const isNormal = dayLogs.some(isNormalStamped);
          const isRevised = dayLogs.some(isRevisedStamped);
          const isHoliday = dayLogs.some(isHolidayLog);
          return (
            <div key={`${day}-dashboard-${index}`} className={`group relative min-h-14 p-1.5 ${isHoliday ? "calendar-holiday-day" : isRevised ? "calendar-revised-day" : isNormal ? "calendar-normal-day" : isWeekend ? "calendar-weekend-day" : "bg-white"}`}>
              {day && <div className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${isToday ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white" : "text-slate-700"}`}>{Number(day.slice(-2))}</div>}
              <div className="mt-1 flex justify-center">{dayLogs[0] && <LocationDot name={dayLogs[0].location} locations={locations} />}</div>
              {dayLogs.length > 0 && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 min-w-max -translate-x-1/2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 opacity-0 shadow-soft transition group-hover:translate-y-[-2px] group-hover:opacity-100">
                  <div className="flex items-center gap-2">
                    <LocationDot name={dayLogs[0].location} locations={locations} />
                    <span>{dayLogs[0].location}</span>
                  </div>
                  {dayLogs[0].note && <div className="mt-1 max-w-48 truncate text-[11px] font-semibold text-slate-500">{dayLogs[0].note}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {locations.slice(0, 6).map((location) => <LocationTag key={location.id} name={location.name} locations={locations} />)}
      </div>
    </section>
  );
}

function LocationDot({ name, locations }) {
  const color = findLocation(locations, name)?.color || "#4f8f7a";
  return <span className="block h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} title={name} />;
}

function LocationPin({ color }) {
  return (
    <span className="inline-grid h-4 w-4 shrink-0 place-items-center" style={{ color }}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path fill="currentColor" d="M12 2.75c-3.45 0-6.25 2.8-6.25 6.25 0 4.68 5.25 11.45 5.48 11.74a.98.98 0 0 0 1.54 0c.23-.29 5.48-7.06 5.48-11.74 0-3.45-2.8-6.25-6.25-6.25Zm0 8.75A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
      </svg>
    </span>
  );
}

function PageTitle({ title, subtitle }) {
  return (
    <div>
      <h2 className="text-xl font-black tracking-normal">{title}</h2>
      <p className="text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <label className={`block ${wide ? "md:col-span-2" : ""}`}>
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function LocationTag({ name, locations, small = false }) {
  const location = findLocation(locations, name);
  const color = location?.color || "#4f8f7a";
  const soft = softenColor(color);
  const label = small ? shortLocationName(name) : name;
  return (
    <span title={name} className={`inline-flex max-w-full items-center justify-center gap-2 rounded-md border font-bold shadow-sm ${small ? "min-w-7 px-1.5 py-1 text-[9px] leading-none" : "px-2 py-1 text-xs"}`} style={{ backgroundColor: soft.bg, borderColor: soft.border, color: soft.text }}>
      {small ? label : <span className="truncate">{label}</span>}
    </span>
  );
}

function EditableLocationSelect({ value, locations, onChange, compact = false }) {
  const location = findLocation(locations, value);
  const soft = softenColor(location?.color || "#4f8f7a");

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`max-w-full rounded-md border font-bold outline-none transition focus:ring-2 focus:ring-indigo-100 ${compact ? "w-44 px-2 py-1 text-xs" : "w-full px-2.5 py-1.5 text-xs sm:w-56"}`}
      style={{ backgroundColor: soft.bg, borderColor: soft.border, color: soft.text }}
      title="Edit log location"
    >
      {locations.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
    </select>
  );
}

function StatusBadge({ status }) {
  const synced = status === "Synced";
  return (
    <span className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-bold ${synced ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`}>
      <span className="status-dot" style={{ backgroundColor: synced ? "#047857" : "#d97706" }} />
      {status}
    </span>
  );
}

function TodoPill({ value }) {
  const tone = {
    High: "bg-red-50 text-red-700",
    Normal: "bg-sky-50 text-sky-700",
    Low: "bg-slate-100 text-slate-600",
  }[value] || "bg-slate-100 text-slate-600";

  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${tone}`}>{value}</span>;
}

function StatusPill({ value }) {
  const tone = {
    Active: "bg-indigo-50 text-indigo-700",
    Planning: "bg-sky-50 text-sky-700",
    "On Hold": "bg-amber-50 text-amber-700",
    Completed: "bg-slate-100 text-slate-600",
  }[value] || "bg-slate-100 text-slate-600";

  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${tone}`}>{value}</span>;
}

function projectTimelineTone(status) {
  return {
    Active: "border-sky-300 bg-gradient-to-r from-sky-400 to-indigo-500 shadow-indigo-900/10 hover:from-sky-500 hover:to-indigo-600",
    Planning: "border-cyan-300 bg-gradient-to-r from-cyan-400 to-violet-500 shadow-violet-900/10 hover:from-cyan-500 hover:to-violet-600",
    "On Hold": "border-indigo-300 bg-gradient-to-r from-indigo-300 to-fuchsia-400 shadow-fuchsia-900/10 hover:from-indigo-400 hover:to-fuchsia-500",
    Completed: "border-violet-300 bg-gradient-to-r from-violet-300 to-indigo-400 shadow-indigo-900/10 hover:from-violet-400 hover:to-indigo-500",
  }[status] || "border-sky-300 bg-gradient-to-r from-sky-300 to-violet-400 shadow-violet-900/10 hover:from-sky-400 hover:to-violet-500";
}

function ProjectTimelineBar({ project, year }) {
  const range = projectTimelineRange(project, year);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="mt-4">
      <div className="relative h-8 overflow-hidden rounded-md border border-slate-200 bg-white">
        <div
          className="absolute top-1 h-6 rounded-md bg-gradient-to-r from-sky-400 to-indigo-500 shadow-sm"
          style={{ left: `${range.left}%`, width: `${range.width}%` }}
          title={`${formatDate(project.startDate)} - ${formatDate(project.endDate)}`}
        />
      </div>
      <div className="mt-2 grid grid-cols-12 text-center text-[10px] font-bold text-slate-400">
        {months.map((month) => <span key={month}>{month}</span>)}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">{text}</div>;
}

function getTopLocations(logs) {
  const counts = logs.reduce((acc, log) => {
    acc[log.location] = (acc[log.location] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function sortLogsByDateDesc(items) {
  return [...items].sort((a, b) => {
    const dateDiff = new Date(`${b.workDate}T00:00:00`).getTime() - new Date(`${a.workDate}T00:00:00`).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function dedupeLogsByWorkDate(items) {
  const byDate = new Map();
  for (const log of items) {
    if (!log?.workDate) continue;
    const current = byDate.get(log.workDate);
    const currentTime = current ? dateTimeValue(current.updatedAt || current.createdAt) : -1;
    const nextTime = dateTimeValue(log.updatedAt || log.createdAt);
    if (!current || nextTime >= currentTime) byDate.set(log.workDate, log);
  }
  return sortLogsByDateDesc(Array.from(byDate.values()));
}

function dateTimeValue(value) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortTodos(items) {
  const statusRank = { Open: 0, Doing: 1, Done: 2 };
  const priorityRank = { High: 0, Normal: 1, Low: 2 };
  return [...items].sort((a, b) => {
    const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    const dueDiff = new Date(`${a.dueDate}T00:00:00`).getTime() - new Date(`${b.dueDate}T00:00:00`).getTime();
    if (dueDiff !== 0) return dueDiff;
    return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
  });
}

function isNormalStamped(log) {
  return String(log?.attendanceStatus || "").trim().toLowerCase() === "normal";
}

function isRevisedStamped(log) {
  return String(log?.attendanceStatus || "").trim().toLowerCase() === "revised";
}

function isHolidayLog(log) {
  return String(log?.location || "").trim().toLowerCase() === "holiday";
}

function isTodoDone(todo) {
  return ["done", "completed", "complete"].includes(String(todo.status || "").trim().toLowerCase());
}

function sortProjects(items) {
  return [...items].sort(compareProjects);
}

function sortProjectsForTimeline(items, year) {
  const yearStart = dateValue(`${year}-01-01`);
  return [...items].sort((a, b) => {
    const aVisibleStart = Math.max(dateValue(a.startDate), yearStart);
    const bVisibleStart = Math.max(dateValue(b.startDate), yearStart);
    if (aVisibleStart !== bVisibleStart) return aVisibleStart - bVisibleStart;
    return compareProjects(a, b);
  });
}

function compareProjects(a, b) {
  const startDiff = dateValue(a.startDate) - dateValue(b.startDate);
  if (startDiff !== 0) return startDiff;
  const endDiff = dateValue(a.endDate) - dateValue(b.endDate);
  if (endDiff !== 0) return endDiff;
  return String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" });
}

function dateValue(value) {
  const time = new Date(`${value || "9999-12-31"}T00:00:00+07:00`).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function formatCompactDate(value) {
  if (!value || !value.includes("-")) return value || "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function projectOverlapsYear(project, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00`).getTime();
  const yearEnd = new Date(`${year}-12-31T23:59:59`).getTime();
  const start = new Date(`${project.startDate}T00:00:00`).getTime();
  const end = new Date(`${project.endDate}T23:59:59`).getTime();
  return start <= yearEnd && end >= yearStart;
}

function projectTimelineRange(project, year) {
  const yearStart = new Date(`${year}-01-01T00:00:00`).getTime();
  const yearEnd = new Date(`${year}-12-31T23:59:59`).getTime();
  const start = Math.max(new Date(`${project.startDate}T00:00:00`).getTime(), yearStart);
  const end = Math.min(new Date(`${project.endDate}T23:59:59`).getTime(), yearEnd);
  const span = yearEnd - yearStart;
  const left = Math.max(0, ((start - yearStart) / span) * 100);
  const width = Math.max(2, ((end - start) / span) * 100);
  return { left, width };
}

function mergeRemoteLogs(localLogs, remoteRows) {
  const byDate = new Map(localLogs.filter((log) => !isWeekendDate(log.workDate)).map((log) => [log.workDate, log]));

  for (const row of remoteRows) {
    const workDate = normalizeSheetDate(row["Work Date"]);
    if (!workDate) continue;
    if (isWeekendDate(workDate)) continue;

    const local = byDate.get(workDate);
    if (local?.syncStatus && local.syncStatus !== "Synced") continue;

    byDate.set(workDate, {
      id: local?.id || `sheet-log-${workDate}`,
      createdAt: normalizeSheetTimestamp(row["Timestamp Created"]) || local?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workDate,
      startTime: row["Start Time"] || START_TIME,
      endTime: row["End Time"] || END_TIME,
      location: row.Location || local?.location || "",
      note: row.Note || "",
      attendanceStatus: row["Attendance Status"] || local?.attendanceStatus || "",
      syncStatus: "Synced",
    });
  }

  return sortLogsByDateDesc(Array.from(byDate.values()));
}

function mergeRemoteLocations(localLocations, remoteRows) {
  const byName = new Map(localLocations.map((location) => [location.name, location]));

  for (const row of remoteRows) {
    const name = (row["Location Name"] || "").trim();
    if (!name) continue;

    const local = byName.get(name);
    if (local?.syncStatus && local.syncStatus !== "Synced") continue;

    byName.set(name, {
      id: local?.id || `sheet-location-${name.toLowerCase().replace(/\s+/g, "-")}`,
      createdAt: normalizeSheetTimestamp(row["Timestamp Created"]) || local?.createdAt || new Date().toISOString(),
      name,
      category: row.Category || local?.category || "",
      color: row.Color || local?.color || "#1f7a5c",
      source: row.Source || local?.source || "Custom",
      syncStatus: "Synced",
    });
  }

  return Array.from(byName.values());
}

function mergeRemoteTodos(localTodos, remoteRows) {
  const byKey = new Map(localTodos.map((todo) => [todoKey(todo), todo]));

  for (const row of remoteRows) {
    const task = (row.Task || "").trim();
    if (!task) continue;

    const createdAt = normalizeSheetTimestamp(row["Timestamp Created"]) || new Date().toISOString();
    const dueDate = normalizeSheetDate(row["Due Date"]);
    const key = todoKey({ createdAt, dueDate, task });
    const local = byKey.get(key);
    if (local?.syncStatus && local.syncStatus !== "Synced") continue;

    byKey.set(key, {
      id: local?.id || `sheet-todo-${createdAt}-${dueDate}-${task}`.replace(/\s+/g, "-"),
      createdAt,
      dueDate,
      task,
      priority: row.Priority || "Normal",
      status: row.Status || "Open",
      note: row.Note || "",
      syncStatus: "Synced",
    });
  }

  return sortTodos(Array.from(byKey.values()));
}

function mergeRemoteProjects(localProjects, remoteRows) {
  const byKey = new Map(localProjects.map((project) => [project.createdAt, project]));

  for (const row of remoteRows) {
    const createdAt = normalizeSheetTimestamp(row["Timestamp Created"]) || new Date().toISOString();
    if (!createdAt) continue;

    const local = byKey.get(createdAt);
    if (local?.syncStatus && local.syncStatus !== "Synced") continue;

    byKey.set(createdAt, {
      id: local?.id || `sheet-project-${createdAt}`,
      createdAt,
      name: row["Project Name"] || local?.name || "",
      role: row.Role || local?.role || "Owner",
      startDate: normalizeSheetDate(row["Start Date"]) || local?.startDate || todayIso(),
      endDate: normalizeSheetDate(row["End Date"]) || local?.endDate || todayIso(),
      status: row.Status || local?.status || "Active",
      kpiNote: row["KPI Note"] || "",
      syncStatus: "Synced",
    });
  }

  return sortProjects(Array.from(byKey.values()));
}

function todoKey(todo) {
  return `${todo.createdAt || ""}|${todo.dueDate || ""}|${todo.task || ""}`;
}

function normalizeSheetDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : bangkokDateKey(date);
}

function normalizeSheetTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function findLocation(locations, name) {
  return locations.find((location) => location.name === name);
}

function calendarDays(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: mondayOffset }, () => "");
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (days.length % 7 !== 0) days.push("");
  return days;
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const group = item[key];
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {});
}

function softenColor(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
  const number = Number.parseInt(value, 16);
  const rgb = {
    r: (number >> 16) & 255,
    g: (number >> 8) & 255,
    b: number & 255,
  };
  const mix = (target, amount) => Math.round(rgb.r * (1 - amount) + target.r * amount);
  const mixG = (target, amount) => Math.round(rgb.g * (1 - amount) + target.g * amount);
  const mixB = (target, amount) => Math.round(rgb.b * (1 - amount) + target.b * amount);
  const toHex = (r, g, b) => `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  const white = { r: 255, g: 255, b: 255 };
  const ink = { r: 23, g: 32, b: 42 };
  return {
    bg: toHex(mix(white, 0.82), mixG(white, 0.82), mixB(white, 0.82)),
    border: toHex(mix(white, 0.58), mixG(white, 0.58), mixB(white, 0.58)),
    text: toHex(mix(ink, 0.25), mixG(ink, 0.25), mixB(ink, 0.25)),
  };
}

function shortLocationName(name) {
  const aliases = {
    VOCO: "VOC",
    CHOD1: "CH1",
    CHOD2: "CH2",
    CHOD3: "CH3",
    CHOD5: "CH5",
    CHAENGWATTANA: "CHA",
    HUAHIN: "HH",
    Seminar: "SEM",
  };
  return aliases[name] || name.slice(0, 3).toUpperCase();
}

createRoot(document.getElementById("root")).render(<App />);


