import { spawn } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const writeLine = (text) => {
  process.stdout.write(`${text}\n`);
};

const runCommand = async (command, cwd) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`Command failed (${code}): ${command}`));
    });
  });

const parseWorkflowSteps = (markdown) => {
  const steps = [];
  const sectionRegex = /###\s+الخطوة\s+(\d+):[\s\S]*?(?=###\s+الخطوة|$)/g;

  let match;
  while ((match = sectionRegex.exec(markdown)) !== null) {
    const stepNumber = Number.parseInt(match[1], 10);
    const content = match[0];
    const commandMatch = content.match(
      /-\s*\*\*التنفيذ\*\*:\s*تشغيل الأمر\s*`([^`]+)`/u
    );

    if (commandMatch?.[1]) {
      steps.push({
        number: stepNumber,
        type: "command",
        command: commandMatch[1].trim(),
      });
      continue;
    }

    if (stepNumber === 6) {
      steps.push({
        number: stepNumber,
        type: "command",
        command: "pnpm run test:integration",
      });
      continue;
    }

    if (stepNumber === 7) {
      steps.push({
        number: stepNumber,
        type: "command",
        command: "pnpm run test:e2e",
      });
      continue;
    }

    if (stepNumber === 9) {
      steps.push({
        number: stepNumber,
        type: "smoke-build-output",
      });
    }
  }

  return steps.sort((a, b) => a.number - b.number);
};

const runBuildOutputSmoke = async (cwd) => {
  const distDir = resolve(cwd, "dist");
  const distIndex = resolve(distDir, "index.html");
  await access(distDir, fsConstants.F_OK);
  await access(distIndex, fsConstants.F_OK);
};

const main = async () => {
  const workflowPathArg = process.argv[2];
  if (!workflowPathArg) {
    throw new Error("Workflow markdown path is required.");
  }

  const workflowPath = resolve(workflowPathArg);
  const markdown = await readFile(workflowPath, "utf-8");
  const steps = parseWorkflowSteps(markdown);

  if (steps.length === 0) {
    throw new Error("No executable steps found in workflow file.");
  }

  for (const step of steps) {
    writeLine(`== Step ${step.number} ==`);
    if (step.type === "command") {
      writeLine(`Running: ${step.command}`);
      await runCommand(step.command, process.cwd());
      continue;
    }

    if (step.type === "smoke-build-output") {
      writeLine("Running build-output smoke check");
      await runBuildOutputSmoke(process.cwd());
    }
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
