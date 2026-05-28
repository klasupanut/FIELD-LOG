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

    sheet.appendRow(row);
    return jsonResponse({ ok: true, sheet: config.name });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }
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
