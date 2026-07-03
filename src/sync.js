const postToWebhook = async (webAppUrl, body) => {
  if (!webAppUrl) throw new Error("Sync is not active yet.");

  const response = await fetch(webAppUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });

  return response;
};

export const syncWorkLog = (webAppUrl, log) =>
  postToWebhook(webAppUrl, {
    action: "appendWorkLog",
    sheet: "WorkLogs",
    row: {
      "Timestamp Created": log.createdAt,
      "Work Date": log.workDate,
      "Start Time": log.startTime,
      "End Time": log.endTime,
      Location: log.location,
      Note: log.note,
      "Sync Status": "Synced",
      "Attendance Status": log.attendanceStatus || "",
    },
  });

export const syncLocation = (webAppUrl, location) =>
  postToWebhook(webAppUrl, {
    action: "appendLocation",
    sheet: "Locations",
    row: {
      "Timestamp Created": location.createdAt || new Date().toISOString(),
      "Location Name": location.name,
      Category: location.category,
      Color: location.color,
      Source: location.source,
      "Sync Status": "Synced",
    },
  });

export const syncTodo = (webAppUrl, todo) =>
  postToWebhook(webAppUrl, {
    action: "appendTodo",
    sheet: "Todos",
    row: {
      "Timestamp Created": todo.createdAt,
      "Due Date": todo.dueDate,
      Task: todo.task,
      Priority: todo.priority,
      Status: todo.status,
      Note: todo.note,
      "Sync Status": "Synced",
    },
  });

export const deleteRemoteTodo = (webAppUrl, todo) =>
  postToWebhook(webAppUrl, {
    action: "deleteTodo",
    sheet: "Todos",
    row: {
      "Timestamp Created": todo.createdAt,
    },
  });

export const syncProject = (webAppUrl, project) =>
  postToWebhook(webAppUrl, {
    action: "appendProject",
    sheet: "Projects",
    row: {
      "Timestamp Created": project.createdAt,
      "Project Name": project.name,
      Role: project.role,
      "Start Date": project.startDate,
      "End Date": project.endDate,
      Status: project.status,
      "KPI Note": project.kpiNote,
      "Sync Status": "Synced",
    },
  });

export const deleteRemoteProject = (webAppUrl, project) =>
  postToWebhook(webAppUrl, {
    action: "deleteProject",
    sheet: "Projects",
    row: {
      "Timestamp Created": project.createdAt,
    },
  });

export const testConnection = (webAppUrl) =>
  postToWebhook(webAppUrl, {
    action: "ping",
    app: "FieldLog",
    checkedAt: new Date().toISOString(),
  });

export const fetchRemoteData = (webAppUrl) =>
  new Promise((resolve, reject) => {
    if (!webAppUrl) {
      reject(new Error("Sync is not active yet."));
      return;
    }

    const callbackName = `fieldLogPull_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const separator = webAppUrl.includes("?") ? "&" : "?";
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      window.clearTimeout(timeout);
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Remote sync timed out."));
    }, 12000);

    window[callbackName] = (response) => {
      cleanup();
      if (!response?.ok) {
        reject(new Error(response?.error || "Remote sync failed."));
        return;
      }
      resolve(response.data || {});
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Remote sync script could not load."));
    };
    script.src = `${webAppUrl}${separator}action=export&callback=${callbackName}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
