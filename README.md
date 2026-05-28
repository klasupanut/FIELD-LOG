# FieldLog

FieldLog is a mobile-first React/Tailwind MVP for recording daily field work locations and syncing records to Google Sheets through a Google Apps Script Web App endpoint.

## Run

Open `index.html` directly in a browser, or serve this folder with any static web server.

In this Codex session the app is running at:

```text
http://localhost:4173
```

## Local Storage

FieldLog stores these keys locally:

- `fieldlog.workLogs`
- `fieldlog.locations`
- `fieldlog.settings`

`fieldlog.settings` keeps the created Google Sheet URL for quick access. The sync endpoint is managed in code so users do not need to paste URLs into the app.

## Google Apps Script Payloads

The app sends `POST` requests with a JSON string body and these actions:

- `appendWorkLog` for the `WorkLogs` sheet
- `appendLocation` for the `Locations` sheet
- `ping` for testing the integration URL

Expected sheet tabs:

- `WorkLogs`: Timestamp Created, Work Date, Start Time, End Time, Location, Note, Sync Status
- `Locations`: Timestamp Created, Location Name, Category, Color, Source, Sync Status

## Activate Auto Sync

1. Open the created Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste the contents of `google-apps-script.js`.
4. Deploy as a Web App with access set to the users who can submit FieldLog entries.
5. Copy the deployed Web App URL into `GOOGLE_APPS_SCRIPT_WEB_APP_URL` in `src/data.js`.

Until that URL is deployed and added, saved logs stay local and show `Pending Sync`.
