const postToWebhook = async (webAppUrl, body) => {
  if (!webAppUrl) throw new Error("Sync is not active yet.");

  const response = await fetch(webAppUrl, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`Sync failed with HTTP ${response.status}`);
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

export const testConnection = (webAppUrl) =>
  postToWebhook(webAppUrl, {
    action: "ping",
    app: "FieldLog",
    checkedAt: new Date().toISOString(),
  });
