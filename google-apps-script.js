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
      const targetRow = findRowByColumnValue(sheet, config.headers, "Work Date", payload.row?.["Work Date"]);
      if (targetRow) {
        sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
        return jsonResponse({ ok: true, sheet: config.name, mode: "updated", row: targetRow });
      }
    }

    sheet.appendRow(row);
    return jsonResponse({ ok: true, sheet: config.name, mode: "appended" });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
}

function findRowByColumnValue(sheet, headers, headerName, value) {
  if (!value) return null;
  const columnIndex = headers.indexOf(headerName) + 1;
  if (!columnIndex) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, columnIndex, lastRow - 1, 1).getDisplayValues();
  const target = String(value).trim();
  const matchIndex = values.findIndex((row) => String(row[0]).trim() === target);
  return matchIndex >= 0 ? matchIndex + 2 : null;
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
