export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WHATSFLOW_DISABLE_AUTOSPAWN === "1") return;

  const g = globalThis as Record<string, unknown>;
  if (g.__whatsappWorkerSpawned) return;
  g.__whatsappWorkerSpawned = true;

  const net = await import("net");
  const cp = await import("child_process");

  const port = Number(process.env.WHATSFLOW_WORKER_PORT || 3101);

  const isPortInUse = await new Promise<boolean>((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(true));
    probe.once("listening", () => { probe.close(); resolve(false); });
    probe.listen(port, "127.0.0.1");
  });

  if (isPortInUse) {
    console.log(`[WORKER] WhatsApp worker already running on port ${port}`);
    return;
  }

  console.log(`[WORKER] Auto-starting WhatsApp worker on port ${port}...`);

  // shell:true + single string command avoids the Node.js deprecation for
  // passing args alongside shell:true.  stdio:'inherit' lets worker logs
  // appear directly in the Next.js dev terminal.
  const worker = cp.spawn("npm run worker:start", [], {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit",
    env: { ...process.env },
  });

  worker.on("error", (err) => {
    console.error("[WORKER] Failed to start WhatsApp worker:", err.message);
    g.__whatsappWorkerSpawned = false;
  });

  worker.on("exit", (code) => {
    console.log(`[WORKER] WhatsApp worker exited with code ${code}`);
    g.__whatsappWorkerSpawned = false;
  });

  const cleanup = () => { try { worker.kill(); } catch {} };
  process.once("exit", cleanup);
  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
}
