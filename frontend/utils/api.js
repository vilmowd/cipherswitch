function apiBase(raw = process.env.NEXT_PUBLIC_API_URL) {
  let value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return "http://localhost:8000";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

module.exports = { apiBase };
