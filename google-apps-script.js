const SPREADSHEET_ID = "13eliZlc2a7XhyzG22Iv1du0KM02LyxyMidO1SDzTI-4";

const SHEETS = {
  appendWorkLog: {
    name: "WorkLogs",
    headers: [
      "Timestamp Created",
      "Work Date",
      "Start Time",
      "End Time",
      "Location",
      "Note",
      "Sync Status",
    ],
  },
  appendLocation: {
    name: "Locations",
    headers: [
      "Timestamp Created",
      "Location Name",
      "Category",
      "Color",
      "Source",
      "Sync Status",
    ],
  },
  appendTodo: {
    name: "Todos",
    headers: [
      "Timestamp Created",
      "Due Date",
      "Task",
      "Priority",
      "Status",
      "Note",
      "Sync Status",
    ],
  },
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");

    if (payload.action === "ping") {
      return jsonResponse({ ok: true, message: "FieldLog sync service is active" });
    }

    const config = SHEETS[payload.action];
    if (!config) {
      return jsonResponse({ ok: false, error: "Unsupported action" }, 400);
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(config.name) || spreadsheet.insertSheet(config.name);
    ensureHeaders(sheet, config.headers);

    const row = config.headers.map((header) => {
      if (header === "Sync Status") return "Synced";
      return payload.row?.[header] ?? "";
    });

    if (payload.action === "appendWorkLog") {
      const result = upsertUniqueRow(sheet, config.headers, row, "Work Date", payload.row?.["Work Date"]);
      return jsonResponse({ ok: true, sheet: config.name, mode: result.mode, row: result.row, deletedDuplicates: result.deletedDuplicates });
    }

    if (payload.action === "appendTodo") {
      const result = upsertUniqueRow(sheet, config.headers, row, "Timestamp Created", payload.row?.["Timestamp Created"]);
      return jsonResponse({ ok: true, sheet: config.name, mode: result.mode, row: result.row, deletedDuplicates: result.deletedDuplicates });
    }

    sheet.appendRow(row);
    return jsonResponse({ ok: true, sheet: config.name, mode: "appended" });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

function doGet(e) {
  try {
    if (e.parameter.action !== "export") {
      return jsonpResponse(e, { ok: true, message: "FieldLog sync service is active" });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    cleanupDuplicateRows(spreadsheet, SHEETS.appendWorkLog, "Work Date");
    cleanupDuplicateRows(spreadsheet, SHEETS.appendTodo, "Timestamp Created");
    const data = {
      workLogs: readSheet(spreadsheet, SHEETS.appendWorkLog),
      locations: readSheet(spreadsheet, SHEETS.appendLocation),
      todos: readSheet(spreadsheet, SHEETS.appendTodo),
    };

    return jsonpResponse(e, { ok: true, data: data });
  } catch (error) {
    return jsonpResponse(e, { ok: false, error: error.message });
  }
}

function upsertUniqueRow(sheet, headers, row, uniqueHeaderName, uniqueValue) {
  const targetRows = findRowsByColumnValue(sheet, headers, uniqueHeaderName, uniqueValue);
  if (!targetRows.length) {
    sheet.appendRow(row);
    return { mode: "appended", row: sheet.getLastRow(), deletedDuplicates: 0 };
  }

  const targetRow = targetRows[0];
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);

  const duplicateRows = targetRows.slice(1).sort((a, b) => b - a);
  duplicateRows.forEach((rowNumber) => sheet.deleteRow(rowNumber));

  return { mode: "updated", row: targetRow, deletedDuplicates: duplicateRows.length };
}

function cleanupDuplicateRows(spreadsheet, config, uniqueHeaderName) {
  const sheet = spreadsheet.getSheetByName(config.name);
  if (!sheet) return 0;
  ensureHeaders(sheet, config.headers);

  const columnIndex = config.headers.indexOf(uniqueHeaderName) + 1;
  const lastRow = sheet.getLastRow();
  if (!columnIndex || lastRow < 3) return 0;

  const values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getDisplayValues();
  const latestRowByValue = {};
  const duplicateRows = [];

  values.forEach((row, index) => {
    const value = String(row[0]).trim();
    if (!value) return;
    const rowNumber = index + 2;
    if (latestRowByValue[value]) duplicateRows.push(latestRowByValue[value]);
    latestRowByValue[value] = rowNumber;
  });

  Array.from(new Set(duplicateRows)).sort((a, b) => b - a).forEach((rowNumber) => sheet.deleteRow(rowNumber));
  return duplicateRows.length;
}

function readSheet(spreadsheet, config) {
  const sheet = spreadsheet.getSheetByName(config.name);
  if (!sheet) return [];
  ensureHeaders(sheet, config.headers);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, config.headers.length).getDisplayValues();
  return rows
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => config.headers.reduce((item, header, index) => {
      item[header] = row[index] || "";
      return item;
    }, {}));
}

function findRowByColumnValue(sheet, headers, headerName, value) {
  const rows = findRowsByColumnValue(sheet, headers, headerName, value);
  return rows[0] || null;
}

function findRowsByColumnValue(sheet, headers, headerName, value) {
  if (!value) return [];
  const columnIndex = headers.indexOf(headerName) + 1;
  if (!columnIndex) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getDisplayValues();
  const target = String(value).trim();
  return values
    .map((row, index) => (String(row[0]).trim() === target ? index + 2 : null))
    .filter(Boolean);
}

function ensureHeaders(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isMissing = headers.some((header, index) => current[index] !== header);

  if (isMissing) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function jsonResponse(body, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ statusCode: statusCode || 200, ...body }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonpResponse(e, body) {
  const callback = e.parameter.callback || "fieldLogSync";
  const safeCallback = callback.replace(/[^\w.$]/g, "");
  return ContentService
    .createTextOutput(`${safeCallback}(${JSON.stringify(body)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
