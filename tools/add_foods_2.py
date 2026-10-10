#!/usr/bin/env python3
"""Catalog v9: more everyday foods (upsert by key). Typical reference values per 100 g."""
import json, os, re
ROOT = os.path.join(os.path.dirname(__file__), '..')
PATH = os.path.join(ROOT, 'packages/seed/data/foods.json')
foods = json.load(open(PATH, encoding='utf-8'))
by_key = {f['key']: f for f in foods}
NOTE = 'Типовое справочное значение, приблизительно; сверь с упаковкой'

def put(key, name, cat, basis, kcal, p, f, c, fiber=0, piece=None, auto=True, group=None, yld=None):
    e = {'key': key, 'name': name, 'brand': None, 'barcode': None, 'category': cat, 'basis': basis, 'unit': 'g', 'gramsPerPiece': piece,
         'per100': {'kcal': kcal, 'proteinG': p, 'fatG': f, 'carbG': c, 'fiberG': fiber}, 'variantGroup': group, 'yieldFactor': yld,
         'dataSource': {'kind': 'estimate', 'note': NOTE}, 'autoPlan': auto}
    if basis == 'raw' or key.endswith('_dry') or cat in ('fruits', 'vegetables'): e['autoPlan'] = False
    if key in by_key:
        old = by_key[key]
        for k in ('variantGroup', 'yieldFactor', 'barcode'):
            e[k] = old.get(k) if e[k] is None else e[k]
        if e['gramsPerPiece'] is None: e['gramsPerPiece'] = old.get('gramsPerPiece')
        e['autoPlan'] = old.get('autoPlan', e['autoPlan'])
        old.update(e)
    else: foods.append(e); by_key[key] = e

# meat / poultry
put('beef_tenderloin_raw','Говяжья вырезка, сырая','meat','raw',121,21.0,4.0,0,0)
put('beef_ground_5_raw','Фарш говяжий 5%, сырой','meat','raw',137,21.0,5.0,0,0)
put('beef_cooked_lean','Говядина варёная','meat','cooked',254,26.0,16.0,0,0)
put('pork_loin_cooked','Свиная корейка, запечённая','meat','cooked',230,28.0,13.0,0,0)
put('lamb_raw','Баранина, сырая','meat','raw',209,16.0,16.0,0,0)
put('veal_raw','Телятина, сырая','meat','raw',131,20.0,5.0,0,0)
put('chicken_thigh_cooked','Куриное бедро без кожи, варёное','poultry','cooked',185,25.0,9.0,0,0)
put('chicken_drumstick_raw','Куриная голень с кожей, сырая','poultry','raw',161,18.0,9.5,0,0)
put('chicken_wings_baked','Куриные крылья запечённые','poultry','cooked',254,24.0,17.0,0,0)
put('chicken_heart_raw','Сердце куриное, сырое','poultry','raw',159,16.0,10.0,0.8,0)
put('duck_raw','Утка, мясо с кожей, сырое','poultry','raw',308,16.0,28.0,0,0)
put('beef_liver_raw','Печень говяжья, сырая','meat','raw',127,20.0,3.7,4.0,0)
put('ham_lean','Ветчина (нежирная)','sausages','as_sold',110,17.0,4.0,1.5,0,auto=False)
put('turkey_ground_raw','Фарш индейки, сырой','poultry','raw',150,19.0,8.0,0,0)
# eggs
put('egg_boiled','Яйцо варёное','eggs','cooked',155,12.6,10.6,1.1,0,55)
put('egg_fried','Яичница (на масле)','eggs','cooked',196,13.6,15.0,0.8,0)
put('quail_egg','Яйцо перепелиное','eggs','raw',158,13.0,11.0,0.6,0,12)
put('omelet','Омлет','eggs','cooked',154,9.5,11.5,1.6,0,auto=False)
# fish / seafood
put('salmon_raw','Лосось (сёмга), сырой','fish','raw',208,20.0,13.0,0,0)
put('cod_raw','Треска, сырая','fish','raw',82,18.0,0.7,0,0)
put('pollock_raw','Минтай, сырой','fish','raw',72,16.0,0.9,0,0)
put('hake_raw','Хек, сырой','fish','raw',86,16.6,2.2,0,0)
put('tuna_canned_water','Тунец консервированный в собственном соку','canned','as_sold',96,21.0,1.0,0,0)
put('sardine_canned','Сардина консервированная в масле','canned','as_sold',208,24.0,12.0,0,0,auto=False)
put('mussels_cooked','Мидии варёные','seafood','cooked',86,12.0,2.2,3.7,0)
put('shrimp_raw','Креветки сырые','seafood','raw',87,18.0,1.1,0.9,0)
put('herring_salted','Сельдь слабосолёная','fish','as_sold',217,17.0,16.0,0,0,auto=False)
# dairy / cheese
put('cottage_4_5','Творог 4–5%','dairy','as_sold',121,16.0,5.0,3.0,0)
put('yogurt_natural','Йогурт натуральный без сахара','dairy','as_sold',65,5.0,3.2,3.5,0)
put('yogurt_fruit','Йогурт фруктовый','dairy','as_sold',90,3.5,2.5,13.0,0,auto=False)
put('skyr','Скир','dairy','as_sold',63,11.0,0.2,4.0,0)
put('cream_10','Сливки 10%','dairy','as_sold',118,3.0,10.0,4.0,0,auto=False)
put('sour_cream_10','Сметана 10%','dairy','as_sold',115,3.0,10.0,2.9,0,auto=False)
put('ayran','Айран','dairy','as_sold',40,1.8,1.5,3.5,0)
put('mozzarella','Моцарелла','cheese','as_sold',250,18.0,19.0,2.0,0,auto=False)
put('feta','Фета','cheese','as_sold',264,14.0,21.0,4.0,0,auto=False)
put('cheese_russian','Сыр российский','cheese','as_sold',363,23.0,29.0,0,0,auto=False)
put('cheese_light','Сыр лёгкий 15%','cheese','as_sold',230,30.0,12.0,0,0,auto=False)
put('cheese_cream','Сыр творожный','cheese','as_sold',230,6.0,22.0,3.0,0,auto=False)
put('butter_82','Масло сливочное 82,5%','fats_oils','as_sold',748,0.5,82.5,0.8,0,auto=False)
# grains / legumes
put('rice_brown_dry','Рис бурый (сухой)','grains','as_sold',337,7.5,2.7,72.0,3.5)
put('rice_brown_cooked','Рис бурый (варёный)','grains','cooked',123,2.7,1.0,25.5,1.8)
put('quinoa_dry','Киноа (сухая)','grains','as_sold',368,14.1,6.1,64.0,7.0)
put('millet_dry','Пшено (сухое)','grains','as_sold',348,11.5,3.3,69.0,3.6)
put('pearl_barley_dry','Перловка (сухая)','grains','as_sold',320,9.3,1.1,66.0,7.8)
put('couscous_dry','Кускус (сухой)','grains','as_sold',360,12.8,0.6,73.0,5.0)
put('buckwheat_flakes','Хлопья гречневые','grains','as_sold',335,13.0,3.4,63.0,6.0)
put('oat_cooked','Овсяная каша на воде','grains','cooked',71,2.5,1.5,12.0,1.7)
put('beans_canned','Фасоль консервированная','legumes','as_sold',95,6.0,0.5,14.0,5.0)
put('peas_green_canned','Горошек зелёный консервированный','canned','as_sold',55,3.0,0.2,9.0,3.0)
put('chickpeas_dry','Нут (сухой)','legumes','as_sold',364,19.0,6.0,61.0,17.0)
put('rice_noodles','Рисовая лапша (варёная)','grains','cooked',109,0.9,0.2,25.0,1.0)
# bread / snacks
put('bread_rye','Хлеб ржаной','bread_bakery','as_sold',214,6.6,1.2,42.0,5.8,30)
put('crispbread','Хлебцы цельнозерновые','bread_bakery','as_sold',310,11.0,2.5,60.0,12.0,10,auto=False)
put('lavash','Лаваш тонкий','bread_bakery','as_sold',275,9.1,1.2,56.0,2.0,auto=False)
# vegetables
put('eggplant','Баклажан','vegetables','raw',24,1.2,0.1,4.5,3.0)
put('pumpkin','Тыква','vegetables','raw',28,1.0,0.1,6.5,2.0)
put('green_beans','Стручковая фасоль','vegetables','raw',31,1.8,0.2,7.0,3.4)
put('green_peas_frozen','Горошек зелёный замороженный','vegetables','as_sold',72,5.0,0.4,12.0,5.0)
put('lettuce','Салат листовой','vegetables','raw',15,1.4,0.2,2.0,1.3)
put('celery','Сельдерей стебель','vegetables','raw',16,0.7,0.2,3.0,1.6)
put('radish','Редис','vegetables','raw',20,1.2,0.1,3.4,1.6)
put('corn_canned','Кукуруза консервированная','canned','as_sold',58,2.2,0.4,11.0,2.0)
put('garlic','Чеснок','vegetables','raw',143,6.5,0.5,29.9,2.1,auto=False)
put('sauerkraut','Квашеная капуста','vegetables','as_sold',23,1.8,0.1,4.4,2.0)
put('pickled_cucumber','Огурцы солёные','vegetables','as_sold',11,0.8,0.1,1.7,1.0,auto=False)
put('asparagus','Спаржа','vegetables','raw',20,2.2,0.1,3.9,2.1)
# fruits / berries
put('pineapple','Ананас','fruits','raw',52,0.5,0.1,11.8,1.4)
put('watermelon','Арбуз','fruits','raw',30,0.6,0.2,7.6,0.4)
put('melon','Дыня','fruits','raw',35,0.6,0.1,8.2,0.9)
put('peach','Персик','fruits','raw',45,0.9,0.1,10.0,1.5)
put('plum','Слива','fruits','raw',46,0.7,0.3,11.0,1.4)
put('cherry','Черешня','fruits','raw',63,1.1,0.2,16.0,2.1)
put('blueberry','Черника','fruits','raw',57,0.7,0.3,14.0,2.4)
put('raspberry','Малина','fruits','raw',46,1.2,0.5,8.3,6.5)
put('mango','Манго','fruits','raw',60,0.8,0.4,15.0,1.6)
put('grapefruit','Грейпфрут','fruits','raw',42,0.8,0.1,10.0,1.6)
put('prunes','Чернослив','fruits','as_sold',240,2.2,0.4,57.5,7.1,auto=False)
# nuts / seeds / fats
put('almond','Миндаль','nuts_seeds','as_sold',609,18.6,53.7,13.0,12.0,auto=False)
put('cashew','Кешью','nuts_seeds','as_sold',600,18.0,48.0,22.0,3.3,auto=False)
put('peanut_butter','Арахисовая паста','nuts_seeds','as_sold',600,25.0,50.0,13.0,6.0,auto=False)
put('chia','Семена чиа','nuts_seeds','as_sold',486,16.5,30.7,42.0,34.0,auto=False)
put('flax_seeds','Семена льна','nuts_seeds','as_sold',534,18.3,42.2,29.0,27.0,auto=False)
put('coconut_oil','Масло кокосовое','fats_oils','as_sold',899,0,99.9,0,0,auto=False)
put('honey','Мёд','sweets','as_sold',329,0.8,0,81.0,0,auto=False)
put('dark_chocolate_70','Горький шоколад 70%','sweets','as_sold',560,8.0,40.0,35.0,10.0,auto=False)

json.dump(foods, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(PATH, 'a').write('\n')
mp = os.path.join(ROOT, 'packages/seed/data/meta.json')
json.dump({'catalogVersion': 9}, open(mp, 'w'))
print(len(foods))
