import { writeFileSync, mkdirSync } from 'node:fs';
import { icons } from 'lucide';
const names = ['ShoppingBasket', 'LayoutGrid', 'Search', 'X', 'ArrowRight', 'ArrowLeftRight', 'ExternalLink', 'SlidersHorizontal', 'Image', 'CookingPot', 'Bath', 'WashingMachine', 'BrushCleaning', 'BedDouble', 'Plug', 'Package', 'ShieldCheck'];
const missing = names.filter(name => !icons[name]);
if (missing.length) throw Error('Missing Lucide icons: ' + missing.join(', '));
mkdirSync('docs/wireframe-v2', { recursive: true });
writeFileSync('docs/wireframe-v2/icons.js', '// Lucide icons, ISC license: ../../assets/vendor/lucide-license.txt\nwindow.PrototypeIcons = ' + JSON.stringify(Object.fromEntries(names.map(name => [name, icons[name]]))) + ';\n');
console.log(JSON.stringify({ icons: names.length, productData: 'Reused docs/wireframe-v1/data.js without collection or mutation' }));
