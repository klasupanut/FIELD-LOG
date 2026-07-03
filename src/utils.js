const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export const bangkokDateKey = (date = new Date()) => {
  const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const year = bangkokDate.getUTCFullYear();
  const month = String(bangkokDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bangkokDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayIso = () => bangkokDateKey(new Date());

export const monthKey = (dateLike) => dateLike.slice(0, 7);

export const isWeekendDate = (dateKey) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return false;
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
};

export const formatDate = (dateLike) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${dateLike}T00:00:00+07:00`));

export const formatMonth = (monthValue) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${monthValue}-01T00:00:00+07:00`));

export const downloadCsv = (filename, rows) => {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
