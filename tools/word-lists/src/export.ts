import { exportCandidate } from "./candidate";

const usage = "export:candidate --raw-dir <raw> --language <fr|en> --version <version> --out-dir <new-directory>";
try {
  const args = process.argv.slice(2);
  const flags = ["--raw-dir", "--language", "--version", "--out-dir"];
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] ?? "";
    const value = args[i + 1];
    if (!flags.includes(flag) || values.has(flag) || value === undefined || value.startsWith("--") || value.length === 0) throw new Error(usage);
    values.set(flag, value);
  }
  if (values.size !== flags.length) throw new Error(usage);
  exportCandidate({ rawDir: values.get("--raw-dir")!, language: values.get("--language")!, version: values.get("--version")!, outDir: values.get("--out-dir")! });
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Candidate export failed");
  process.exitCode = 1;
}
