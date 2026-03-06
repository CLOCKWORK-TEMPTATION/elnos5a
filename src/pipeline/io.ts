import fs from "node:fs/promises";

export async function readBinary(filePath: string): Promise<Buffer> {
  return await fs.readFile(filePath);
}

export async function writeText(filePath: string, text: string): Promise<void> {
  await fs.writeFile(filePath, text, "utf8");
}
