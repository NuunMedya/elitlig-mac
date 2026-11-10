// Bugün ekranındaki Araç Takımı şeridi ve tanıtım kartı, Araç Takımı sayfası hiç açılmadan
// görünür; stilleri (toolkit.css) bileşenle birlikte yüklenmezse düğmeler stilsiz kalıyordu.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (name) => readFileSync(fileURLToPath(new URL(`../src/views/toolkit/${name}.jsx`, import.meta.url)), "utf8");

test.each(["ToolkitStrip", "ToolkitIntro"])("%s kendi stilini yükler", (name) => {
  expect(src(name)).toMatch(/import "\.\/toolkit\.css";/);
});
