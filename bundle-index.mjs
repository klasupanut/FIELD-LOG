import fs from "node:fs";
import path from "node:path";
import Babel from "./vendor-babel.min.js";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const data = read("src/data.js").replace(/export const /g, "const ");
const storage = read("src/storage.js").replace(/import[^\n]+\n/g, "").replace(/export const storage/g, "const storage");
const sync = read("src/sync.js").replace(/export const /g, "const ");
const utils = read("src/utils.js").replace(/export const /g, "const ");
const main = read("src/main.jsx").replace(/import[^\n]+\n/g, "");
const styles = read("src/styles.css");

const app = [
  'import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";',
  'import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";',
  data,
  storage,
  sync,
  utils,
  main,
].join("\n\n");

const compiledApp = Babel.transform(app, {
  presets: ["react"],
  sourceType: "module",
}).code;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FieldLog</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial"],
            },
            colors: {
              ink: "#17202a",
              field: "#6366f1",
              amberline: "#c58a1c",
              cloud: "#f5f7f9",
            },
            boxShadow: {
              soft: "0 18px 45px rgba(28, 42, 58, 0.10)",
            },
          },
        },
      };
    </script>
    <style>
${styles.replace(/<\/style/gi, "<\\/style")}
    </style>
  </head>
  <body class="bg-cloud text-ink antialiased">
    <div id="root"></div>
    <script type="module">
${compiledApp.replace(/<\/script/gi, "<\\/script")}
    </script>
  </body>
</html>`;

fs.writeFileSync(path.join(root, "index.html"), html);
console.log(`Wrote self-contained index.html (${html.length} bytes)`);
