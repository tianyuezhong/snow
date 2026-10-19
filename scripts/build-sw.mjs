import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  ...(await readdir("dist/assets")).map((x) => "assets/" + x),
];
const html = await readFile("dist/index.html", "utf8");
const hash = createHash("sha256").update(html).digest("hex").slice(0, 12);
const sw = (await readFile("public/sw.js", "utf8"))
  .replace("__BUILD__", hash)
  .replace("__ASSETS__", JSON.stringify(files));
await writeFile("dist/sw.js", sw);
