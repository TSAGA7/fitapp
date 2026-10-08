import { validateSeedCatalog } from '@fitapp/domain';
import { rawSeedCatalog } from './index';

const report = validateSeedCatalog(rawSeedCatalog);
const c = rawSeedCatalog;
console.log(`Каталог v${c.catalogVersion}: оборудование ${c.equipment.length}, упражнения ${c.exercises.length}, продукты ${c.foods.length}`);
for (const w of report.warnings) console.log(`  предупреждение: ${w.message}`);
for (const e of report.errors) console.log(`  ОШИБКА: ${e.message}`);
console.log(report.ok ? 'Результат: OK' : 'Результат: есть ошибки');
process.exit(report.ok ? 0 : 1);
