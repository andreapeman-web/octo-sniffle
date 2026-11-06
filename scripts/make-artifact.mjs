// Turns the artifact build (dist-artifact/) into the page the Artifact tool publishes:
// one HTML body fragment with the CSS and JS inlined, plus the data files beside it.
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";

const dir = "dist-artifact";
const css = readFileSync(`${dir}/app.css`, "utf8");
const js = readFileSync(`${dir}/app.js`, "utf8").replace(/<\/script/gi, "<\\/script");
const page = `<title>Study RPG</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya+Sans:wght@400;500;700&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Pixelify+Sans:wght@400;600;700&display=swap">
<style>${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
writeFileSync(`${dir}/study-rpg.html`, page);
for (const f of ["index.html", "app.js", "app.css"]) if (existsSync(`${dir}/${f}`)) rmSync(`${dir}/${f}`);
console.log(`${dir}/study-rpg.html: ${(page.length / 1024).toFixed(0)} KB`);
