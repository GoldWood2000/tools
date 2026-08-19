import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server.js"], {
    stdio: "inherit",
    env: { ...process.env, ORBIT_HOST: "127.0.0.1", ORBIT_PORT: "4173" },
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { stdio: "inherit" }),
];

let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
for (const child of children) child.on("exit", (code) => {
  if (stopping) return;
  process.exitCode = code || 1;
  stop();
});
