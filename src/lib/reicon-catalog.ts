import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const directory = path.join(process.cwd(), "node_modules/reicon-react/icons");
let catalog: Promise<string[]> | undefined;

export function reiconNames() {
  return catalog ??= readdir(directory).then(files => files.filter(file => /^[A-Z][A-Za-z0-9]*\.js$/.test(file)).map(file => file.slice(0, -3)).sort()).catch(error => { catalog = undefined; throw error; });
}

export async function reiconSvg(name: string) {
  if (!(await reiconNames()).includes(name)) return null;
  const source = await readFile(path.join(directory, `${name}.js`), "utf8");
  // Reicon 1.2.x ships literal O/F SVG markup. Read the installed asset, never eval it.
  // The catalog test checks every asset so a library format change fails before shipping.
  const markup = source.match(/\bO:\s*`([^`]*)`/)?.[1] ?? source.match(/\bF:\s*`([^`]*)`/)?.[1];
  if (!markup || /\$\{|\\/.test(markup)) throw new Error("Reicon asset format changed");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">${markup}</svg>`;
}
