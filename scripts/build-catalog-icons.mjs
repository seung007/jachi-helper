import { writeFile } from 'node:fs/promises';
import { icons } from 'lucide';
const names = ['Search', 'Bookmark', 'SlidersHorizontal', 'X', 'ExternalLink', 'ArrowUp', 'ArrowRight', 'ChevronDown', 'Check', 'Link', 'Image', 'ZoomIn', 'MapPin', 'ListFilter', 'WashingMachine', 'Sparkles', 'Recycle', 'ShoppingBasket', 'BookOpen', 'Building2'];
const selected = Object.fromEntries(names.map(name => [name, icons[name]]));
await writeFile(new URL('../assets/vendor/catalog-icons.js', import.meta.url), `// Lucide icons, ISC license: lucide-license.txt\nwindow.JachiIcons = ${JSON.stringify(selected)};\n`);
