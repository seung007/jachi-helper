import { writeFile } from 'node:fs/promises';
import { icons } from 'lucide';
const names = ['Search', 'Bookmark', 'SlidersHorizontal', 'X', 'ExternalLink', 'ArrowUp', 'ChevronDown', 'Check', 'Link'];
const selected = Object.fromEntries(names.map(name => [name, icons[name]]));
await writeFile(new URL('../assets/vendor/catalog-icons.js', import.meta.url), `// Lucide icons, ISC license: lucide-license.txt\nwindow.JachiIcons = ${JSON.stringify(selected)};\n`);
