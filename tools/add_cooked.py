#!/usr/bin/env python3
"""Ready-to-eat (cooked) variants of raw products, new foods, and autoPlan=false for raw/dry products that have a cooked counterpart."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'packages' / 'seed' / 'data'
p = root / 'foods.json'
L = json.load(open(p))
by = {x['key']: x for x in L}
NOTE = 'Типовое справочное значение, приблизительно; сверь с упаковкой'
r1 = lambda v: round(v, 1)

def food(key, name, per, basis='cooked', group=None, yf=None, cat='meat', note=NOTE, auto=True):
    return dict(key=key, name=name, brand=None, barcode=None, category=cat, basis=basis, unit='g', gramsPerPiece=None,
                per100=dict(kcal=per[0], proteinG=per[1], fatG=per[2], carbG=per[3], fiberG=per[4] if len(per) > 4 else 0),
                variantGroup=group, yieldFactor=yf, dataSource=dict(kind='estimate', note=note), autoPlan=auto)

def cooked_from(raw_key, key, name, yf, extra_fat=0.0):
    raw = by[raw_key]; q = raw['per100']
    per = (round(q['kcal'] / yf + extra_fat * 9), r1(q['proteinG'] / yf), r1(q['fatG'] / yf + extra_fat), r1(q['carbG'] / yf), r1(q.get('fiberG', 0) / yf))
    group = raw['variantGroup'] or raw_key.replace('_raw', '').replace('_dry', '')
    raw['variantGroup'] = group
    return food(key, name, per, 'cooked', group, yf, raw['category'], 'Пересчёт из сырого продукта при запекании/варке без масла; приблизительно')

NEW = [
  cooked_from('beef_lean_raw', 'beef_lean_cooked', 'Говядина постная, тушёная', 0.65),
  cooked_from('pork_tenderloin_raw', 'pork_tenderloin_cooked', 'Свинина (вырезка), запечённая', 0.72),
  cooked_from('chicken_thigh_fillet_raw', 'chicken_thigh_cooked', 'Куриное бедро без кожи, запечённое', 0.72),
  cooked_from('turkey_thigh_raw', 'turkey_thigh_cooked', 'Индейка (бедро), запечённая', 0.7),
  cooked_from('mince_chicken_raw', 'mince_chicken_cooked', 'Фарш куриный, обжаренный', 0.75),
  cooked_from('salmon_raw', 'salmon_cooked', 'Сёмга/лосось запечённый', 0.8),
  cooked_from('cod_raw', 'cod_cooked', 'Треска запечённая', 0.8),
  cooked_from('mackerel_raw', 'mackerel_cooked', 'Скумбрия запечённая', 0.8),
  cooked_from('pink_salmon_raw', 'pink_salmon_cooked', 'Горбуша запечённая', 0.8),
  cooked_from('trout_raw', 'trout_cooked', 'Форель запечённая', 0.8),
  cooked_from('pollock_raw', 'pollock_cooked', 'Минтай запечённый', 0.8),
  cooked_from('tuna_fresh_raw', 'tuna_cooked', 'Тунец (стейк), приготовленный', 0.8),
  cooked_from('squid_raw', 'squid_cooked', 'Кальмар варёный', 0.8),
  cooked_from('lentils_dry', 'lentils_cooked', 'Чечевица варёная', 2.5),
  # explicit: no raw twin
  food('chicken_breast_fried', 'Куриная грудка жареная', (172, 30.0, 5.5, 0.0), cat='poultry', note='Жарка на сковороде с небольшим количеством масла; приблизительно'),
  food('chicken_legs_fried', 'Куриные ножки жареные (голень с кожей)', (220, 22.0, 14.0, 0.5), cat='poultry', note='Жарка без панировки; приблизительно'),
  food('trout_salted', 'Форель слабосолёная', (202, 21.0, 12.5, 0.0), basis='as_sold', cat='fish', note='Типовое значение для слабосолёной форели; сверь с упаковкой'),
]
for n in NEW:
    if n['key'] in by:
        L[L.index(by[n['key']])] = n
    else:
        L.append(n)
    by[n['key']] = n

# raw / dry products that now have a ready twin are no longer picked by the menu builder (they stay in the catalog for manual entry and the converter)
for k in ['oats_dry', 'buckwheat_dry', 'rice_dry', 'pasta_dry', 'bulgur_dry', 'lentils_dry', 'chicken_breast_raw', 'turkey_breast_raw', 'beef_lean_raw', 'salmon_raw', 'cod_raw',
          'chicken_thigh_fillet_raw', 'turkey_thigh_raw', 'pork_tenderloin_raw', 'mince_chicken_raw', 'mackerel_raw', 'pink_salmon_raw', 'trout_raw', 'pollock_raw', 'tuna_fresh_raw', 'squid_raw']:
    if k in by: by[k]['autoPlan'] = False
# ready porridge is the breakfast carb now
for k in ['oatmeal_water', 'oatmeal_milk']:
    by[k]['autoPlan'] = True
json.dump(L, open(p, 'w'), ensure_ascii=False, indent=2)
print(len(L), 'foods')
