import { execFileSync } from "child_process";

export default function globalSetup() {
  execFileSync("bun", ["run", "build"], { stdio: "inherit" });
}
