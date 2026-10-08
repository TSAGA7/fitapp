# Fitapp (V1.0, local-first)

Персональное приложение для питания и тренировок. V1.0 работает полностью на устройстве, без входа и сервера.

## Быстрый старт

Нужен Node.js 20+.

```
npm install
npm run check        # типы + линтер границ + тесты
npm run seed:validate  # проверка каталога упражнений/продуктов
npm run dev          # веб-оболочка (этап 1)
```

## Слои (зависимости только сверху вниз)

```
apps/web  ->  packages/application  ->  packages/domain
apps/web  ->  packages/storage-local (только через src/composition)  ->  packages/domain
packages/seed  ->  packages/domain
```

- `domain` — чистый TypeScript: модель (Zod), порты, движки, валидаторы. Без React, браузера, часов и случайности.
- `application` — сценарии (use cases) поверх портов.
- `storage-local` — Dexie/IndexedDB (этап 3).
- `seed` — каталог оборудования, упражнений, продуктов (JSON) + проверка.
- `apps/web` — React-интерфейс и composition root.

Границы проверяются ESLint, а тест `tests/boundaries.test.ts` доказывает, что правила срабатывают.

См. `docs/ARCHITECTURE.md` и `docs/STAGES.md`.
