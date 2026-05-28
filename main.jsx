import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import { END_TIME, GOOGLE_APPS_SCRIPT_WEB_APP_URL, GOOGLE_SHEET_URL, START_TIME } from "./src/data.js";
import { storage } from "./src/storage.js";
import { syncLocation, syncTodo, syncWorkLog } from "./src/sync.js";
import { formatDate, monthKey, todayIso, uid } from "./src/utils.js";

storage.init();

const navItems = [
  ["dashboard", "Dashboard"],
  ["add-log", "Add Log"],
  ["calendar", "Calendar"],
  ["timeline", "Timeline"],
  ["review", "Memo"],
  ["locations", "Locations"],
  ["integration", "Integration"],
];

function App() {
  const [page, setPage] = useState("dashboard");
  const [logs, setLogs] = useState(storage.getLogs());
  const [locations, setLocations] = useState(storage.getLocations());
  const [todos, setTodos] = useState(storage.getTodos());
  const [settings, setSettings] = useState(storage.getSettings());
  const [toast, setToast] = useState("");
  const [lastAutoRefresh, setLastAutoRefresh] = useState("");

  const saveLogs = (next) => {
    setLogs(next);
    storage.saveLogs(next);
  };

  const saveLocations = (next) => {
    setLocations(next);
    storage.saveLocations(next);
  };

  const saveTodos = (next) => {
    setTodos(next);
    storage.saveTodos(next);
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
    setSettings(storage.getSettings());
    setLastAutoRefresh(new Date().toISOString());
  };

  const addWorkLog = async (draft) => {
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
      syncStatus: "Pending Sync",
    };
    const nextLogs = existingLog
      ? logs.map((log) => (log.id === existingLog.id ? pendingLog : log))
      : [pendingLog, ...logs];
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

  const updateTodo = (id, patch) => {
    const nextTodos = todos.map((todo) => (
      todo.id === id
        ? { ...todo, ...patch, syncStatus: todo.syncStatus === "Synced" ? "Pending Sync" : todo.syncStatus }
        : todo
    ));
    saveTodos(nextTodos);
  };

  const deleteTodo = (id) => {
    saveTodos(todos.filter((todo) => todo.id !== id));
    notify("Memo deleted locally.");
  };

  const syncPending = async () => {
    let nextLogs = [...logs];
    let nextLocations = [...locations];
    let syncedCount = 0;

    for (const log of nextLogs.filter((item) => item.syncStatus !== "Synced")) {
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

    saveLogs(nextLogs);
    saveLocations(nextLocations);
    saveTodos(nextTodos);
    if (syncedCount) {
      saveSettings({ ...settings, lastSyncStatus: `${syncedCount} pending item(s) synced`, lastSyncAt: new Date().toISOString() });
      notify(`${syncedCount} pending item(s) synced.`);
    } else {
      notify("No pending items were synced.");
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshFromLocal();
      if (GOOGLE_APPS_SCRIPT_WEB_APP_URL) syncPending();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [logs, locations, todos, settings]);

  const pageProps = { logs, locations, todos, settings, saveSettings, addWorkLog, addLocation, addTodo, updateTodo, deleteTodo, setPage, updateLogLocation, updateCustomLocation, deleteCustomLocation, syncPending, notify };

  return (
    <div className="min-h-screen bg-[#f6f8fb] lg:flex">
      <Nav page={page} setPage={setPage} />
      <div className="min-w-0 flex-1 lg:pl-64">
      <Header settings={settings} pendingCount={logs.filter((item) => item.syncStatus !== "Synced").length + locations.filter((item) => item.source === "Custom" && item.syncStatus !== "Synced").length} syncPending={syncPending} lastAutoRefresh={lastAutoRefresh} />
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-6">
        <section className="min-w-0 flex-1">
          {page === "dashboard" && <Dashboard {...pageProps} />}
          {page === "add-log" && <AddWorkLog {...pageProps} />}
          {page === "calendar" && <CalendarView {...pageProps} />}
          {page === "timeline" && <TimelineView {...pageProps} />}
          {page === "review" && <MemoTodos {...pageProps} />}
          {page === "locations" && <LocationSettings {...pageProps} />}
          {page === "integration" && <IntegrationSettings {...pageProps} />}
        </section>
      </main>
      </div>
      <MobileNav page={page} setPage={setPage} />
      {toast && <div className="fixed bottom-20 left-4 right-4 z-50 rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white shadow-soft sm:bottom-4 sm:left-auto sm:right-6 sm:w-fit">{toast}</div>}
    </div>
  );
}

function Header({ settings, pendingCount, syncPending, lastAutoRefresh }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/92 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-field text-lg font-black text-white">FL</div>
          <div>
            <h1 className="text-xl font-bold tracking-normal">FieldLog</h1>
            <p className="text-xs text-slate-500">09:30 - 19:00 attendance field record</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusBadge status={pendingCount ? "Pending Sync" : "Synced"} />
          {settings.sheetUrl && <a href={settings.sheetUrl} target="_blank" rel="noreferrer" className="rounded-md border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-field hover:text-field">Open Sheet</a>}
          {settings.lastSyncStatus && <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-600">{settings.lastSyncStatus}</span>}
          {lastAutoRefresh && <span className="hidden rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-500 sm:inline-flex">Auto refreshed {new Date(lastAutoRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={syncPending} className="rounded-md bg-ink px-3 py-2 font-semibold text-white transition hover:bg-slate-700">Sync</button>
        </div>
      </div>
    </header>
  );
}

function Nav({ page, setPage }) {
  return (
    <nav className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col bg-[#071826] text-white shadow-2xl lg:flex">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-500 text-base font-black">FL</div>
        <div>
          <div className="text-xl font-black">FieldLog</div>
          <div className="text-xs text-slate-400">Field attendance</div>
        </div>
      </div>
      <div className="flex-1 px-4 py-5">
        <div className="space-y-2">
          {navItems.map(([id, label]) => (
            <button key={id} onClick={() => setPage(id)} className={`flex w-full items-center rounded-md px-4 py-3 text-left text-sm font-bold transition ${page === id ? "bg-emerald-500 text-white shadow-lg shadow-emerald-950/20" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
              {label === "Add Log" ? "Add Work Log" : label === "Memo" ? "Memo Todo" : label === "Integration" ? "Settings" : label}
            </button>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="rounded-md bg-white/10 p-3">
          <div className="text-sm font-bold">SUPANUT N.</div>
          <div className="text-xs text-slate-400">Senior Engineer</div>
        </div>
      </div>
    </nav>
  );
}

function MobileNav({ page, setPage }) {
  const mobileItems = [
    ["dashboard", "Home"],
    ["add-log", "Add"],
    ["calendar", "Cal"],
    ["timeline", "Line"],
    ["review", "Memo"],
    ["locations", "Places"],
    ["integration", "Sync"],
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-7 gap-1">
        {mobileItems.map(([id, label]) => (
          <button key={id} onClick={() => setPage(id)} className={`min-h-11 rounded-md px-1 text-[11px] font-bold transition ${page === id ? "bg-ink text-white" : "text-slate-500 hover:bg-slate-100"}`}>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Dashboard({ logs, locations, setPage }) {
  const sortedLogs = sortLogsByDateDesc(logs);
  const todayLog = sortedLogs.find((log) => log.workDate === todayIso());
  const currentMonth = todayIso().slice(0, 7);
  const monthLogs = sortedLogs.filter((log) => monthKey(log.workDate) === currentMonth);
  const mostVisited = getTopLocations(monthLogs);

  return (
    <div className="space-y-4">
      <div className="hidden items-center justify-between gap-4 lg:flex">
        <div>
          <h1 className="text-2xl font-black tracking-normal">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back. Here is your field attendance overview.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">{formatDate(todayIso())}</div>
          <button onClick={() => setPage("add-log")} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600">Add Today Log</button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-black">Today&apos;s Status</h2>
            <div className="mt-5 flex items-start gap-3">
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-black ${todayLog ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{todayLog ? "\u2713" : "!"}</div>
              <div>
                <p className="text-sm text-slate-500">{todayLog ? "You have logged your work today." : "No work log has been saved today."}</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{START_TIME} - {END_TIME}</p>
              </div>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-xs font-bold uppercase text-slate-400">Current Location</p>
              <div className="mt-2 text-xl font-black">{todayLog ? todayLog.location : "Not logged"}</div>
              <p className="mt-1 text-sm text-slate-500">{todayLog ? todayLog.note || "Saved" : "Ready to add today&apos;s record."}</p>
            </div>
          </div>
          <button onClick={() => setPage("add-log")} className="mt-5 w-full rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700">View Today&apos;s Log</button>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black">This Month Summary</h2>
          <div className="mt-4 space-y-4">
            <SummaryLine label="Total Days Logged" value={`${monthLogs.length} days`} tone="blue" />
            <SummaryLine label="Unique Locations" value={`${new Set(monthLogs.map((log) => log.location)).size} locations`} tone="emerald" />
            <SummaryLine label="Total Work Hours" value={`${(monthLogs.length * 9.5).toFixed(1)} hrs`} tone="amber" />
          </div>
        </section>
        <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-black">Most Visited Locations</h2>
          <div className="space-y-3">
            {mostVisited.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between">
                <LocationTag name={name} locations={locations} />
                <span className="text-sm font-semibold text-slate-600">{count} days</span>
              </div>
            ))}
            {!mostVisited.length && <EmptyState text="No location visits this month." />}
          </div>
        </section>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DashboardCalendar logs={sortedLogs} locations={locations} />
        <RecentLogs logs={sortedLogs.slice(0, 6)} locations={locations} />
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
          <button disabled={isSaving} className="w-full rounded-md bg-emerald-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:cursor-wait disabled:bg-slate-300 sm:w-auto">{isSaving ? "Saving..." : "Save Log"}</button>
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
      <button className="mt-4 w-full rounded-md bg-ink px-4 py-2 text-sm font-bold text-white">Save Location</button>
    </form>
  );
}

function CalendarView({ logs, locations }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const days = calendarDays(month);
  const logsByDate = useMemo(() => groupBy(logs, "workDate"), [logs]);
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
          return (
            <div key={`${day}-${index}`} className="min-h-[74px] bg-white p-1.5 sm:min-h-24 sm:p-2">
              {day && <div className="mb-2 text-sm font-bold">{Number(day.slice(-2))}</div>}
              <div className="space-y-1">
                {dayLogs.slice(0, 2).map((log) => <LocationTag key={log.id} name={log.location} locations={locations} small />)}
              </div>
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
              <div className="mt-1 text-xs font-bold text-slate-400">{new Date(`${log.workDate}T00:00:00`).toLocaleDateString("en-GB", { month: "short" })}</div>
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
        <button className="mt-4 w-full rounded-md bg-emerald-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-600">Save Memo</button>
      </form>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <PageTitle title="Todo List" subtitle="แก้ status และ priority ได้จากมือถือทันที." />
          <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{sortedTodos.length} items</span>
        </div>
        <div className="space-y-3">
          {sortedTodos.map((todo) => (
            <article key={todo.id} className={`rounded-md border p-3 ${todo.status === "Done" ? "border-emerald-100 bg-emerald-50/60" : "border-slate-200 bg-slate-50"}`}>
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
        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-sm font-bold text-emerald-950">Connected Google Sheet</div>
          <a href={GOOGLE_SHEET_URL} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4">
            {GOOGLE_SHEET_URL}
          </a>
        </div>
        <div className={`rounded-md border p-4 text-sm ${GOOGLE_APPS_SCRIPT_WEB_APP_URL ? "border-emerald-100 bg-emerald-50 text-emerald-900" : "border-amber-100 bg-amber-50 text-amber-900"}`}>
          <div className="font-bold">{GOOGLE_APPS_SCRIPT_WEB_APP_URL ? "Auto sync is active" : "Auto sync is not active yet"}</div>
          <p className="mt-1">{GOOGLE_APPS_SCRIPT_WEB_APP_URL ? "Work logs create or update one Google Sheets row per date automatically." : "Pending Sync means the record is saved on this device, but the Google Sheet backend URL has not been deployed in code yet."}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={syncPending} className="rounded-md bg-field px-4 py-2 text-sm font-bold text-white">Sync Pending</button>
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

function SheetStructure() {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 text-lg font-bold">Google Sheet Tabs</h2>
      <p className="text-slate-600">WorkLogs and Locations are appended through the automatic sync service.</p>
      <div className="mt-3 space-y-2 text-xs text-slate-500">
        <p><strong>WorkLogs:</strong> Timestamp Created, Work Date, Start Time, End Time, Location, Note, Sync Status</p>
        <p><strong>Locations:</strong> Timestamp Created, Location Name, Category, Color, Source, Sync Status</p>
      </div>
    </section>
  );
}

function AppsScriptHint() {
  return (
    <details className="rounded-md border border-slate-200 p-4 text-sm">
      <summary className="cursor-pointer font-bold">Expected webhook payload</summary>
      <pre className="thin-scrollbar mt-3 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{`{
  "action": "appendWorkLog" | "appendLocation" | "ping",
  "sheet": "WorkLogs" | "Locations",
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
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`grid h-9 w-9 place-items-center rounded-full ${tones[tone] || tones.emerald}`}>
        <span className="summary-pulse-dot" />
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-black">{value}</div>
      </div>
    </div>
  );
}

function DashboardCalendar({ logs, locations }) {
  const month = todayIso().slice(0, 7);
  const days = calendarDays(month);
  const logsByDate = useMemo(() => groupBy(logs, "workDate"), [logs]);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-sm font-black">This Month Calendar Overview</h2>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="bg-slate-50 p-2 text-center text-[11px] font-bold text-slate-500">{day}</div>)}
        {days.map((day, index) => {
          const dayLogs = day ? logsByDate[day] || [] : [];
          const isToday = day === todayIso();
          return (
            <div key={`${day}-dashboard-${index}`} className="min-h-14 bg-white p-1.5">
              {day && <div className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${isToday ? "bg-emerald-500 text-white" : "text-slate-700"}`}>{Number(day.slice(-2))}</div>}
              <div className="mt-1 flex justify-center">{dayLogs[0] && <LocationDot name={dayLogs[0].location} locations={locations} />}</div>
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
  return <span className="block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} title={name} />;
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
      className={`max-w-full rounded-md border font-bold outline-none transition focus:ring-2 focus:ring-emerald-100 ${compact ? "w-44 px-2 py-1 text-xs" : "w-full px-2.5 py-1.5 text-xs sm:w-56"}`}
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
    <span className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-bold ${synced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
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

function findLocation(locations, name) {
  return locations.find((location) => location.name === name);
}

function calendarDays(month) {
  const first = new Date(`${month}-01T00:00:00`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const mondayOffset = (first.getDay() + 6) % 7;
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
    "เธเนเธฒเธเธเธธเธ“เธเธธเธเธเธฑเธข": "BKC",
    Seminar: "SEM",
  };
  return aliases[name] || name.slice(0, 3).toUpperCase();
}

createRoot(document.getElementById("root")).render(<App />);


