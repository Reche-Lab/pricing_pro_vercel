const url = new URL("/api/cron/commerce-olist", process.env.APP_URL || "http://localhost:3000");
const secret = process.env.CRON_SECRET || "";
if (secret.length < 32) throw new Error("Configure CRON_SECRET com ao menos 32 caracteres.");
if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Use APP_URL com HTTPS.");
let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
console.log("Olist worker: verificando fila a cada 60 segundos. Ctrl+C para parar.");
while (!stopping) {
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(65000) });
    const result = await response.json();
    console.log(new Date().toISOString(), { status: response.status, processed: result.processed, debugId: result.debugId });
  } catch (error) { console.error("Não foi possível consultar a fila.", { type: error instanceof Error ? error.name : "unknown" }); }
  if (!stopping) await new Promise(resolve => {
    const done = () => { clearTimeout(timer); process.removeListener("SIGINT", done); process.removeListener("SIGTERM", done); resolve(); };
    const timer = setTimeout(done, 60000);
    process.once("SIGINT", done); process.once("SIGTERM", done);
  });
}
