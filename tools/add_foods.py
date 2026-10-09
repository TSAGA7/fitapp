#!/usr/bin/env python3
"""Extends packages/seed/data/foods.json with popular foods (upsert by key). Values are typical reference numbers per 100 g."""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')
PATH = os.path.join(ROOT, 'packages/seed/data/foods.json')
foods = json.load(open(PATH, encoding='utf-8'))
by_key = {f['key']: f for f in foods}

NOTE = 'Типовое справочное значение, приблизительно; сверь с упаковкой'


def put(key, name, cat, basis, kcal, p, f, c, fiber=0, piece=None, auto=True, group=None, yld=None, brand=None, note=NOTE, kind='estimate'):
    entry = {
        'key': key, 'name': name, 'brand': brand, 'barcode': None, 'category': cat, 'basis': basis,
        'unit': 'g', 'gramsPerPiece': piece,
        'per100': {'kcal': kcal, 'proteinG': p, 'fatG': f, 'carbG': c, 'fiberG': fiber},
        'variantGroup': group, 'yieldFactor': yld,
        'dataSource': {'kind': kind, 'note': note},
        'autoPlan': auto,
    }
    old = by_key.get(key)
    if old:  # keep unit/piece settings of existing entries unless explicitly given
        entry['unit'] = old.get('unit', 'g')
        entry['gramsPerPiece'] = piece if piece is not None else old.get('gramsPerPiece')
        entry['barcode'] = old.get('barcode')
        if old.get('variantGroup') and group is None:
            entry['variantGroup'] = old['variantGroup']
            entry['yieldFactor'] = old.get('yieldFactor')
        entry['autoPlan'] = auto if key in AUTO_OVERRIDE else old.get('autoPlan', True)
        by_key[key].update(entry)
    else:
        foods.append(entry)
        by_key[key] = entry


AUTO_OVERRIDE = set()

# ---- renames of existing items (clearer names, same keys)
for k, n in {
    'chicken_breast_raw': 'Куриное филе (грудка), сырое',
    'chicken_breast_cooked': 'Куриное филе (грудка), варёное',
    'turkey_breast_raw': 'Индейка, филе (грудка), сырое',
    'pasta_dry': 'Макароны (сухие)',
}.items():
    by_key[k]['name'] = n
by_key['turkey_breast_raw']['variantGroup'] = 'turkey_breast'
by_key['pasta_dry']['variantGroup'] = 'pasta'
by_key['potato_raw']['variantGroup'] = 'potato'

# ---- protein: the user's real serving is 23 g of protein per 30 g
foods[:] = [f for f in foods if f['key'] != 'whey_protein_30g']
by_key.pop('whey_protein_30g', None)
put('protein_first_russian', 'Первый русский протеин (порция 30 г = 23 г белка)', 'supplements', 'as_sold', 380, 76.7, 5.0, 6.7, 0, 30, auto=False, brand='Первый русский протеин', note='Порция 30 г содержит 23 г белка. Калории и жир приблизительно: сверь с упаковкой', kind='label')
put('protein_on_gold', 'Optimum Nutrition Gold Standard Whey (порция 31 г = 24 г белка)', 'supplements', 'as_sold', 390, 77.4, 3.2, 9.7, 0, 31, auto=False, brand='Optimum Nutrition', note='Ориентир по данным производителя; сверь с упаковкой')
put('protein_myprotein_impact', 'MyProtein Impact Whey (порция 25 г = 21 г белка)', 'supplements', 'as_sold', 412, 82.0, 7.2, 4.0, 0, 25, auto=False, brand='MyProtein', note='Ориентир по данным производителя; сверь с упаковкой')
put('protein_dymatize_iso', 'Dymatize ISO100 изолят (порция 30 г = 25 г белка)', 'supplements', 'as_sold', 367, 83.3, 1.7, 3.3, 0, 30, auto=False, brand='Dymatize', note='Ориентир по данным производителя; сверь с упаковкой')
put('protein_whey_generic', 'Протеин сывороточный (универсальный, 80% белка)', 'supplements', 'as_sold', 400, 80.0, 6.0, 7.0, 0, 30, auto=False)
put('protein_casein', 'Казеин (универсальный)', 'supplements', 'as_sold', 370, 78.0, 2.0, 6.0, 0, 30, auto=False)
put('protein_plant', 'Растительный протеин (горох/рис)', 'supplements', 'as_sold', 380, 75.0, 6.0, 8.0, 2, 30, auto=False)
put('bar_bombbar', 'BombBar протеиновый батончик (60 г)', 'sweets', 'as_sold', 330, 33.0, 11.0, 28.0, 6, 60, auto=False, brand='BombBar', note='Ориентир: около 20 г белка на батончик; сверь с упаковкой нужного вкуса')
put('bar_protein_generic', 'Протеиновый батончик (универсальный, 20 г белка)', 'sweets', 'as_sold', 340, 33.0, 12.0, 30.0, 5, 60, auto=False)
put('cheese_protein', 'Сыр протеиновый', 'dairy', 'as_sold', 200, 27.0, 10.0, 1.0, 0, None, auto=False)

# ---- meat, poultry, fish
put('turkey_breast_cooked', 'Индейка, филе (грудка), варёное', 'poultry', 'cooked', 150, 29.0, 3.5, 0, 0, group='turkey_breast', yld=0.7)
put('chicken_thigh_fillet_raw', 'Куриное бедро без кожи, сырое', 'poultry', 'raw', 121, 19.0, 5.0, 0, 0)
put('turkey_thigh_raw', 'Индейка, бедро без кожи, сырое', 'poultry', 'raw', 144, 19.5, 7.0, 0, 0)
put('pork_tenderloin_raw', 'Свинина, вырезка, сырая', 'meat', 'raw', 143, 21.0, 6.0, 0, 0)
put('pork_neck_raw', 'Свинина, шея, сырая', 'meat', 'raw', 260, 17.0, 21.0, 0, 0, auto=False)
put('beef_mince_raw', 'Фарш говяжий, сырой', 'meat', 'raw', 254, 17.2, 20.0, 0, 0, auto=False)
put('mince_mixed_raw', 'Фарш свинина+говядина, сырой', 'meat', 'raw', 257, 16.0, 21.0, 0, 0, auto=False)
put('mince_chicken_raw', 'Фарш куриный, сырой', 'poultry', 'raw', 143, 17.5, 8.0, 0, 0)
put('chicken_liver_raw', 'Печень куриная, сырая', 'poultry', 'raw', 136, 19.1, 6.3, 0.6, 0)
put('shashlik_chicken', 'Шашлык куриный (готовый)', 'poultry', 'cooked', 176, 25.0, 8.0, 1.0, 0, auto=False, note='Зависит от части курицы и маринада; приблизительно')
put('shashlik_pork', 'Шашлык свиной (готовый)', 'meat', 'cooked', 284, 21.0, 22.0, 0.5, 0, auto=False, note='Зависит от части свинины и маринада; приблизительно')
put('shashlik_turkey', 'Шашлык из индейки (готовый)', 'poultry', 'cooked', 152, 27.0, 4.5, 1.0, 0, auto=False, note='Зависит от части индейки и маринада; приблизительно')
put('ham_turkey', 'Ветчина из индейки', 'meat', 'as_sold', 101, 16.0, 3.5, 1.5, 0, auto=False)
put('ham_chicken', 'Ветчина из курицы', 'meat', 'as_sold', 113, 15.0, 5.0, 2.0, 0, auto=False)
put('sausage_doctor', 'Колбаса докторская', 'meat', 'as_sold', 257, 12.8, 22.2, 1.5, 0, 25, auto=False)
put('sausages_pork', 'Сосиски молочные', 'meat', 'as_sold', 257, 11.0, 23.0, 1.6, 0, 50, auto=False)
put('sausages_chicken', 'Сосиски куриные', 'poultry', 'as_sold', 199, 12.0, 16.0, 1.7, 0, 50, auto=False)
put('cutlets_homemade', 'Котлеты домашние (жареные)', 'ready_meals', 'cooked', 249, 15.0, 17.0, 9.0, 0.5, 80, auto=False)
put('nuggets_chicken', 'Наггетсы куриные', 'ready_meals', 'cooked', 247, 14.0, 15.0, 14.0, 1, 20, auto=False)
put('salmon_salted', 'Лосось слабосолёный', 'fish', 'as_sold', 206, 20.0, 14.0, 0, 0, auto=False)
put('herring_salted', 'Сельдь солёная', 'fish', 'as_sold', 205, 19.2, 14.2, 0, 0, auto=False)
put('mackerel_raw', 'Скумбрия, сырая', 'fish', 'raw', 180, 18.0, 12.0, 0, 0)
put('pink_salmon_raw', 'Горбуша, сырая', 'fish', 'raw', 138, 21.0, 6.0, 0, 0)
put('trout_raw', 'Форель, сырая', 'fish', 'raw', 140, 20.0, 6.5, 0, 0)
put('pollock_raw', 'Минтай, сырой', 'fish', 'raw', 72, 15.9, 0.9, 0, 0)
put('tuna_fresh_raw', 'Тунец (свежий стейк), сырой', 'fish', 'raw', 108, 24.0, 1.0, 0, 0)
put('shrimp_boiled', 'Креветки варёные', 'fish', 'cooked', 95, 20.0, 1.5, 0, 0)
put('squid_raw', 'Кальмар, сырой', 'fish', 'raw', 75, 18.0, 0.3, 0, 0)
put('crab_sticks', 'Крабовые палочки', 'fish', 'as_sold', 90, 5.4, 1.0, 14.0, 0, auto=False)
put('sushi_rolls', 'Роллы (в среднем)', 'ready_meals', 'as_sold', 141, 5.5, 3.5, 22.0, 0.5, auto=False)

# ---- eggs, dairy
put('omelet', 'Омлет (яйца с молоком)', 'ready_meals', 'cooked', 175, 9.5, 14.0, 2.5, 0, auto=False)
put('cottage_cheese_0', 'Творог 0% (обезжиренный)', 'dairy', 'as_sold', 72, 16.5, 0.2, 1.5, 0)
put('cottage_cheese_2', 'Творог 2%', 'dairy', 'as_sold', 103, 18.0, 2.0, 3.3, 0)
put('cottage_cheese_9', 'Творог 9%', 'dairy', 'as_sold', 159, 16.7, 9.0, 2.0, 0)
put('cottage_cheese_18', 'Творог 18% (жирный)', 'dairy', 'as_sold', 229, 14.0, 18.0, 2.8, 0, auto=False)
put('cottage_cheese_granular_4', 'Творог зернистый 4%', 'dairy', 'as_sold', 96, 11.0, 4.3, 3.4, 0)
put('kefir_0', 'Кефир 0%', 'dairy', 'as_sold', 30, 3.0, 0.1, 4.0, 0)
put('kefir_25', 'Кефир 2,5%', 'dairy', 'as_sold', 53, 2.9, 2.5, 4.0, 0)
put('kefir_32', 'Кефир 3,2%', 'dairy', 'as_sold', 59, 2.9, 3.2, 4.0, 0)
put('ryazhenka_4', 'Ряженка 4%', 'dairy', 'as_sold', 67, 2.9, 4.0, 4.2, 0, auto=False)
put('milk_15', 'Молоко 1,5%', 'dairy', 'as_sold', 44, 3.0, 1.5, 4.8, 0)
put('milk_32', 'Молоко 3,2%', 'dairy', 'as_sold', 59, 2.9, 3.2, 4.7, 0)
put('sour_cream_20', 'Сметана 20%', 'dairy', 'as_sold', 206, 2.8, 20.0, 3.2, 0, auto=False)
put('cheese_gouda_45', 'Сыр голландский 45%', 'dairy', 'as_sold', 352, 26.0, 26.8, 0, 0, auto=False)
put('cheese_russian_50', 'Сыр российский 50%', 'dairy', 'as_sold', 363, 23.0, 29.0, 0.3, 0, auto=False)
put('cheese_mozzarella', 'Моцарелла', 'dairy', 'as_sold', 242, 18.0, 18.0, 2.0, 0, auto=False)
put('cheese_processed', 'Сыр плавленый', 'dairy', 'as_sold', 260, 14.0, 20.0, 6.0, 0, auto=False)
put('cheese_curd_glazed', 'Сырок глазированный', 'sweets', 'as_sold', 393, 7.0, 25.0, 35.0, 0, 45, auto=False)
put('ice_cream_plombir', 'Мороженое пломбир', 'sweets', 'as_sold', 228, 3.2, 15.0, 20.0, 0, 80, auto=False)
put('ice_cream_eskimo', 'Мороженое эскимо в шоколаде', 'sweets', 'as_sold', 272, 3.6, 18.0, 24.0, 0, 70, auto=False)

# ---- grains, bread, side dishes
put('bulgur_dry', 'Булгур (сухой)', 'grains', 'raw', 342, 12.3, 1.3, 63.0, 12.5, group='bulgur')
put('bulgur_cooked', 'Булгур (варёный)', 'grains', 'cooked', 83, 3.1, 0.2, 18.6, 4.5, group='bulgur', yld=2.8)
put('pasta_cooked', 'Макароны (варёные)', 'grains', 'cooked', 158, 5.8, 0.9, 30.9, 1.8, group='pasta', yld=2.2)
put('oatmeal_water', 'Овсянка на воде (готовая каша)', 'ready_meals', 'cooked', 71, 2.5, 1.5, 12.0, 1.5, auto=False)
put('oatmeal_milk', 'Овсянка на молоке 2,5% (готовая каша)', 'ready_meals', 'cooked', 104, 3.2, 4.1, 13.5, 1.5, auto=False)
put('muesli', 'Мюсли', 'grains', 'as_sold', 360, 9.5, 6.5, 66.0, 7.0)
put('granola', 'Гранола', 'sweets', 'as_sold', 433, 8.0, 17.0, 62.0, 6.0, auto=False)
put('bread_white', 'Хлеб белый (батон)', 'bread_bakery', 'as_sold', 260, 7.5, 2.9, 51.0, 2.2, 25)
put('bread_borodinsky', 'Хлеб бородинский', 'bread_bakery', 'as_sold', 199, 6.8, 1.3, 40.0, 5.0, 25)
put('bread_black', 'Хлеб чёрный ржано-пшеничный', 'bread_bakery', 'as_sold', 204, 6.6, 1.2, 41.8, 5.0, 25)
put('potato_boiled', 'Картофель варёный', 'vegetables', 'cooked', 81, 2.0, 0.4, 17.3, 1.8, group='potato', yld=0.95)
put('potato_fried', 'Картофель жареный', 'ready_meals', 'cooked', 190, 2.8, 9.5, 23.4, 2.0, auto=False)
put('potato_fries', 'Картофель фри', 'ready_meals', 'cooked', 314, 3.8, 15.0, 41.0, 3.0, auto=False)
put('mashed_potato_water', 'Пюре картофельное на воде', 'ready_meals', 'cooked', 80, 1.9, 0.2, 17.5, 1.5, auto=False)
put('mashed_potato_milk', 'Пюре картофельное на молоке с маслом', 'ready_meals', 'cooked', 108, 2.2, 4.3, 15.0, 1.4, auto=False)
put('sweet_potato_raw', 'Батат, сырой', 'vegetables', 'raw', 87, 1.6, 0.1, 20.0, 3.0)

# ---- homemade and ready dishes
put('pancakes_water', 'Блины на воде', 'ready_meals', 'cooked', 170, 4.5, 3.5, 30.0, 1.0, 60, auto=False)
put('pancakes_milk', 'Блины на молоке', 'ready_meals', 'cooked', 232, 6.1, 12.0, 25.0, 1.0, 60, auto=False)
put('blinchiki_chicken', 'Блинчики с курицей (замороженные)', 'ready_meals', 'as_sold', 205, 9.5, 8.0, 24.0, 1.0, 80, auto=False, note='Полуфабрикат; значения зависят от производителя, сверь с упаковкой')
put('blinchiki_cottage', 'Блинчики с творогом (замороженные)', 'ready_meals', 'as_sold', 215, 8.5, 7.5, 28.0, 1.0, 80, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('blinchiki_cherry', 'Блинчики с вишней (замороженные)', 'ready_meals', 'as_sold', 190, 4.0, 4.5, 33.0, 1.5, 80, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('blinchiki_meat', 'Блинчики с мясом (замороженные)', 'ready_meals', 'as_sold', 220, 10.0, 10.0, 22.0, 1.0, 80, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('pelmeni_frozen', 'Пельмени мясные (замороженные, сырые)', 'ready_meals', 'as_sold', 275, 11.9, 12.4, 29.0, 1.5, 12, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('vareniki_potato', 'Вареники с картофелем (замороженные)', 'ready_meals', 'as_sold', 194, 5.5, 3.6, 35.0, 2.0, 25, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('vareniki_cottage', 'Вареники с творогом (замороженные)', 'ready_meals', 'as_sold', 215, 9.5, 5.0, 33.0, 1.0, 25, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('vareniki_cherry', 'Вареники с вишней (замороженные)', 'ready_meals', 'as_sold', 173, 4.2, 1.4, 36.0, 1.5, 25, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('vareniki_cabbage', 'Вареники с капустой (замороженные)', 'ready_meals', 'as_sold', 181, 4.5, 3.5, 33.0, 2.0, 25, auto=False, note='Полуфабрикат; сверь с упаковкой')
put('khinkali_meat', 'Хинкали с мясом', 'ready_meals', 'cooked', 234, 11.0, 10.0, 25.0, 1.0, 80, auto=False)
put('khinkali_cheese', 'Хинкали с сыром', 'ready_meals', 'cooked', 260, 10.0, 12.0, 28.0, 1.0, 80, auto=False)
put('khachapuri_imeretian', 'Хачапури по-имеретински', 'ready_meals', 'cooked', 275, 10.5, 13.0, 29.0, 1.0, 250, auto=False)
put('khachapuri_megrelian', 'Хачапури по-мегрельски', 'ready_meals', 'cooked', 317, 12.0, 17.0, 29.0, 1.0, 280, auto=False)
put('khachapuri_adjarian', 'Хачапури по-аджарски', 'ready_meals', 'cooked', 295, 11.0, 15.0, 29.0, 1.0, 300, auto=False)
put('pizza_pepperoni', 'Пицца пепперони', 'ready_meals', 'cooked', 272, 12.0, 12.5, 28.0, 2.0, 100, auto=False)
put('pizza_margherita', 'Пицца маргарита', 'ready_meals', 'cooked', 249, 11.0, 9.5, 30.0, 2.0, 100, auto=False)
put('shawarma_chicken', 'Шаурма куриная', 'ready_meals', 'cooked', 213, 11.0, 9.0, 22.0, 2.0, 300, auto=False)
put('syrniki', 'Сырники (жареные)', 'ready_meals', 'cooked', 200, 16.0, 8.0, 16.0, 0.5, 60, auto=False)
put('soup_borscht', 'Борщ', 'ready_meals', 'cooked', 49, 1.1, 2.5, 5.5, 1.0, auto=False)
put('soup_chicken', 'Суп куриный с лапшой', 'ready_meals', 'cooked', 40, 3.3, 1.5, 3.5, 0.3, auto=False)
put('salad_olivier', 'Салат оливье', 'ready_meals', 'cooked', 190, 5.0, 15.0, 8.0, 1.0, auto=False)
put('salad_caesar', 'Салат цезарь с курицей', 'ready_meals', 'cooked', 176, 10.0, 12.0, 7.0, 1.0, auto=False)
put('salad_greek', 'Салат греческий', 'ready_meals', 'cooked', 109, 3.0, 9.0, 4.0, 1.5, auto=False)
put('salad_vegetable_oil', 'Салат овощной с маслом', 'ready_meals', 'cooked', 70, 1.2, 5.0, 5.0, 1.5, auto=False)
put('salad_vinaigrette', 'Винегрет', 'ready_meals', 'cooked', 91, 1.5, 5.0, 10.0, 2.0, auto=False)
put('salad_crab', 'Салат крабовый', 'ready_meals', 'cooked', 137, 5.0, 9.0, 9.0, 0.5, auto=False)
put('salad_shuba', 'Селёдка под шубой', 'ready_meals', 'cooked', 180, 4.0, 12.0, 14.0, 1.5, auto=False)
put('hummus', 'Хумус', 'legumes', 'as_sold', 178, 8.0, 10.0, 14.0, 6.0, auto=False)
put('tofu', 'Тофу', 'legumes', 'as_sold', 76, 8.0, 4.8, 1.9, 0.3)

# ---- sauces
put('sauce_ketchup', 'Кетчуп', 'other', 'as_sold', 105, 1.8, 1.0, 22.2, 0.5, auto=False)
put('sauce_mayo_67', 'Майонез 67%', 'other', 'as_sold', 680, 0.5, 72.0, 2.5, 0, auto=False)
put('sauce_mayo_light', 'Майонез лёгкий 30%', 'other', 'as_sold', 294, 1.0, 30.0, 5.0, 0, auto=False)
put('sauce_soy', 'Соевый соус', 'other', 'as_sold', 56, 6.0, 0, 8.0, 0, auto=False)
put('sauce_tomato_pasta', 'Томатный соус для пасты', 'other', 'as_sold', 69, 1.5, 3.0, 9.0, 1.5, auto=False)
put('sauce_bbq', 'Соус барбекю', 'other', 'as_sold', 148, 1.0, 0.5, 35.0, 0.5, auto=False)

# ---- vegetables, fruits, dried fruits
put('mushrooms_champignon', 'Шампиньоны, сырые', 'vegetables', 'raw', 27, 4.3, 1.0, 0.1, 1.6)
put('zucchini', 'Кабачок', 'vegetables', 'raw', 23, 0.6, 0.3, 4.6, 1.0)
put('bell_pepper', 'Перец сладкий', 'vegetables', 'raw', 27, 1.3, 0.1, 5.3, 1.8)
put('cauliflower', 'Цветная капуста', 'vegetables', 'raw', 30, 2.5, 0.3, 4.2, 2.0)
put('beetroot', 'Свёкла', 'vegetables', 'raw', 42, 1.5, 0.1, 8.8, 2.5)
put('onion', 'Лук репчатый', 'vegetables', 'raw', 41, 1.4, 0, 8.2, 1.7)
put('avocado', 'Авокадо', 'fruits', 'raw', 160, 2.0, 14.7, 1.8, 6.7, 100, auto=False, note='Углеводы указаны без клетчатки; приблизительно')
put('grapes', 'Виноград', 'fruits', 'raw', 71, 0.6, 0.2, 16.8, 0.9)
put('pear', 'Груша', 'fruits', 'raw', 42, 0.4, 0.3, 10.9, 3.1, 150)
put('kiwi', 'Киви', 'fruits', 'raw', 47, 0.8, 0.4, 11.5, 3.0, 75)
put('strawberry', 'Клубника', 'fruits', 'raw', 37, 0.8, 0.4, 7.5, 2.0)
put('mandarin', 'Мандарин', 'fruits', 'raw', 37, 0.8, 0.2, 8.1, 1.9, 80)
put('dried_apricots', 'Курага', 'fruits', 'as_sold', 244, 5.2, 0.3, 55.0, 7.0, auto=False)
put('raisins', 'Изюм', 'fruits', 'as_sold', 281, 2.9, 0.6, 66.0, 3.5, auto=False)
put('dates', 'Финики', 'fruits', 'as_sold', 277, 1.8, 0.2, 75.0, 7.0, 8, auto=False)
for k in ('banana', 'apple', 'orange'):
    by_key[k]['autoPlan'] = True

# ---- nuts and seeds
put('pistachios', 'Фисташки (очищенные)', 'nuts_seeds', 'as_sold', 560, 20.0, 45.0, 27.0, 10.0)
put('cashews', 'Кешью', 'nuts_seeds', 'as_sold', 553, 18.2, 43.9, 30.2, 3.3)
put('hazelnuts', 'Фундук', 'nuts_seeds', 'as_sold', 628, 15.0, 61.0, 17.0, 9.7)
put('peanuts_roasted', 'Арахис жареный', 'nuts_seeds', 'as_sold', 600, 26.0, 52.0, 10.0, 8.0)
put('sunflower_seeds', 'Семечки подсолнечника жареные', 'nuts_seeds', 'as_sold', 569, 21.0, 49.0, 11.0, 6.0, auto=False)
put('pumpkin_seeds', 'Семечки тыквенные', 'nuts_seeds', 'as_sold', 554, 30.0, 46.0, 5.0, 6.0, auto=False)
put('chia_seeds', 'Семена чиа', 'nuts_seeds', 'as_sold', 486, 17.0, 31.0, 42.0, 34.0, auto=False)

# ---- sweets and snacks
put('chocolate_milk', 'Шоколад молочный', 'sweets', 'as_sold', 537, 7.5, 31.0, 57.0, 2.0, auto=False)
put('chocolate_dark_70', 'Шоколад горький 70%', 'sweets', 'as_sold', 580, 8.0, 42.0, 30.0, 10.0, auto=False)
put('snickers', 'Snickers', 'sweets', 'as_sold', 494, 9.0, 24.0, 60.5, 2.0, 50, auto=False, brand='Snickers')
put('mars', 'Mars', 'sweets', 'as_sold', 449, 4.3, 16.9, 70.0, 1.0, 51, auto=False, brand='Mars')
put('bounty', 'Bounty', 'sweets', 'as_sold', 475, 3.5, 25.0, 59.0, 3.0, 57, auto=False, brand='Bounty')
put('twix', 'Twix', 'sweets', 'as_sold', 498, 4.5, 24.0, 66.0, 1.5, 50, auto=False, brand='Twix')
put('mms_peanut', "M&M's с арахисом", 'sweets', 'as_sold', 500, 9.0, 26.0, 57.0, 3.0, 45, auto=False, brand="M&M's")
put('cereal_choco_balls', 'Шоколадные шарики (готовый завтрак)', 'sweets', 'as_sold', 382, 6.4, 2.7, 83.0, 3.5, auto=False)
put('cereal_choco_pillows', 'Шоколадные подушечки с начинкой', 'sweets', 'as_sold', 431, 7.0, 15.0, 67.0, 3.0, auto=False)
put('waffles_regular', 'Вафли обычные (с начинкой)', 'sweets', 'as_sold', 520, 3.4, 27.0, 66.0, 1.0, 30, auto=False)
put('waffles_belgian', 'Вафли бельгийские', 'sweets', 'cooked', 290, 7.9, 14.0, 33.0, 1.0, 75, auto=False)
put('marshmallow', 'Зефир', 'sweets', 'as_sold', 316, 0.8, 0.1, 78.3, 0, 30, auto=False)
put('cookies_oatmeal', 'Печенье овсяное', 'sweets', 'as_sold', 436, 6.5, 14.0, 71.0, 3.0, 15, auto=False)
put('cookies_shortbread', 'Печенье песочное', 'sweets', 'as_sold', 454, 7.0, 14.0, 75.0, 1.5, 15, auto=False)
put('croissant', 'Круассан', 'bread_bakery', 'as_sold', 405, 8.0, 21.0, 46.0, 2.0, 60, auto=False)
put('bun_sweet', 'Булочка сдобная', 'bread_bakery', 'as_sold', 285, 7.5, 7.0, 48.0, 2.0, 80, auto=False)
put('honey', 'Мёд', 'sweets', 'as_sold', 329, 0.8, 0, 81.5, 0, auto=False)
put('sugar', 'Сахар', 'sweets', 'as_sold', 399, 0, 0, 99.8, 0, 5, auto=False)
put('jam', 'Джем / варенье', 'sweets', 'as_sold', 252, 0.3, 0.1, 63.0, 1.0, auto=False)
put('nutella', 'Шоколадная паста (Nutella)', 'sweets', 'as_sold', 533, 6.3, 30.9, 57.5, 3.0, auto=False, brand='Nutella')
put('condensed_milk', 'Сгущённое молоко', 'sweets', 'as_sold', 329, 7.2, 8.5, 56.0, 0, auto=False)
put('chips_potato', 'Чипсы картофельные', 'sweets', 'as_sold', 504, 5.5, 30.0, 53.0, 4.0, auto=False)

# ---- drinks
put('cola', 'Кола', 'drinks', 'as_sold', 42, 0, 0, 10.6, 0, auto=False)
put('cola_zero', 'Кола Zero', 'drinks', 'as_sold', 0, 0, 0, 0, 0, auto=False)
put('sprite', 'Спрайт', 'drinks', 'as_sold', 40, 0, 0, 10.0, 0, auto=False)
put('sprite_zero', 'Спрайт Zero', 'drinks', 'as_sold', 0, 0, 0, 0, 0, auto=False)
put('fanta', 'Фанта', 'drinks', 'as_sold', 44, 0, 0, 11.0, 0, auto=False)
put('fanta_zero', 'Фанта Zero', 'drinks', 'as_sold', 0, 0, 0, 0, 0, auto=False)
put('juice_apple', 'Сок яблочный', 'drinks', 'as_sold', 46, 0.1, 0.1, 11.0, 0.2, auto=False)
put('juice_orange', 'Сок апельсиновый', 'drinks', 'as_sold', 46, 0.7, 0.2, 10.4, 0.2, auto=False)
put('energy_drink', 'Энергетик', 'drinks', 'as_sold', 44, 0, 0, 11.0, 0, auto=False)
put('latte', 'Латте (молоко 3,2%)', 'drinks', 'as_sold', 54, 2.8, 2.9, 4.2, 0, auto=False)
put('beer_lager', 'Пиво светлое (4,5%)', 'drinks', 'as_sold', 42, 0.4, 0, 3.1, 0, auto=False, note='Калории включают алкоголь, поэтому не равны сумме БЖУ')
put('beer_dark', 'Пиво тёмное', 'drinks', 'as_sold', 48, 0.5, 0, 4.5, 0, auto=False, note='Калории включают алкоголь, поэтому не равны сумме БЖУ')
put('beer_zero', 'Пиво безалкогольное', 'drinks', 'as_sold', 24, 0.3, 0, 5.4, 0, auto=False)

# ---- sushi and rolls (delivery-style estimates, not a plan staple)
put('philadelphia_roll', 'Ролл Филадельфия', 'ready_meals', 'as_sold', 160, 6.5, 7.0, 17.5, 0.5, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('california_roll', 'Ролл Калифорния', 'ready_meals', 'as_sold', 175, 5.0, 7.0, 22.0, 0.6, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('baked_roll', 'Ролл запечённый (с лососем и сыром)', 'ready_meals', 'as_sold', 193, 8.0, 9.0, 20.0, 0.5, 35, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('tempura_roll', 'Ролл темпура (в панировке)', 'ready_meals', 'as_sold', 220, 5.5, 10.0, 27.0, 0.8, 35, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('spicy_roll', 'Ролл острый с лососем', 'ready_meals', 'as_sold', 151, 6.5, 5.0, 20.0, 0.5, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('unagi_roll', 'Ролл с угрём', 'ready_meals', 'as_sold', 175, 5.5, 5.5, 26.0, 0.5, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('chicken_roll', 'Ролл с курицей', 'ready_meals', 'as_sold', 161, 7.0, 5.0, 22.0, 0.5, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('maki_salmon', 'Маки с лососем', 'ready_meals', 'as_sold', 136, 5.5, 2.5, 23.0, 0.5, 25, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('maki_tuna', 'Маки с тунцом', 'ready_meals', 'as_sold', 124, 7.0, 0.4, 23.0, 0.5, 25, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('maki_cucumber', 'Маки с огурцом', 'ready_meals', 'as_sold', 104, 2.2, 0.3, 23.0, 0.8, 22, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('nigiri_salmon', 'Нигири с лососем', 'ready_meals', 'as_sold', 156, 8.0, 4.5, 21.0, 0.3, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('nigiri_shrimp', 'Нигири с креветкой', 'ready_meals', 'as_sold', 125, 6.5, 0.8, 23.0, 0.3, 28, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('gunkan', 'Гункан (с икрой или лососем)', 'ready_meals', 'as_sold', 140, 6.0, 4.5, 19.0, 0.3, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('inari', 'Инари (рис в тофу)', 'ready_meals', 'as_sold', 174, 4.0, 6.0, 26.0, 0.6, 30, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')
put('sashimi_salmon', 'Сашими из лосося', 'fish', 'as_sold', 197, 20.0, 13.0, 0, 0, 15, auto=False, note='Оценка по типичным рецептам доставок (Якитория, Тануки и др.): состав зависит от заведения, вес порции сверь по меню')

# ---- bakery, drinks, salads, pizzas and restaurant / fast-food menus (estimates by dish type; kcal computed from macros unless stated)
EST = 'Оценка по типичному составу блюда; у конкретного заведения и размера порции цифры отличаются, сверь с их меню'


def kc(p, f, c):
    return round(4 * p + 9 * f + 4 * c)


def dish(key, name, cat, p, f, c, piece=None, brand=None, fiber=1.0, note=EST, basis='as_sold'):
    put(key, name, cat, basis, kc(p, f, c), p, f, c, fiber, piece, auto=False, brand=brand, note=note)


# pies and buns
for key, name, p, f, c, piece in [
    ('pie_potato_fried', 'Пирожок жареный с картошкой', 5, 9, 32, 80), ('pie_cabbage_baked', 'Пирожок печёный с капустой', 5, 6, 34, 80),
    ('pie_meat_fried', 'Пирожок жареный с мясом', 9, 12, 27, 80), ('pie_apple_baked', 'Пирожок печёный с яблоком', 4, 6, 38, 80),
    ('pie_cherry_baked', 'Пирожок печёный с вишней', 4, 6, 38, 80), ('pie_curd_baked', 'Пирожок печёный с творогом', 9, 8, 33, 80),
    ('pie_egg_onion', 'Пирожок печёный с яйцом и луком', 8, 8, 33, 80), ('pie_mushroom', 'Пирожок печёный с грибами', 5, 7, 33, 80),
    ('pie_jam_fried', 'Пирожок жареный с повидлом', 4, 11, 42, 80),
    ('bun_cinnamon', 'Булочка с корицей', 6, 12, 52, 100), ('bun_poppy', 'Булочка с маком', 8, 9, 50, 80),
    ('bun_raisin', 'Булочка с изюмом', 7, 6, 52, 80), ('bun_sugar', 'Плюшка с сахаром', 7, 10, 52, 80),
    ('bun_cheese', 'Булочка с сыром', 10, 12, 40, 90), ('vatrushka_curd', 'Ватрушка с творогом', 9, 10, 38, 100),
    ('croissant', 'Круассан', 8, 21, 46, 60), ('croissant_choco', 'Круассан с шоколадом', 7, 21, 50, 70),
    ('cheburek', 'Чебурек', 10, 20, 25, 120), ('samsa_meat', 'Самса с мясом', 11, 16, 26, 120),
]:
    dish(key, name, 'bread_bakery', p, f, c, piece, fiber=1.5)

# alcohol (kcal include alcohol)
AL = 'Калории включают алкоголь, поэтому не равны сумме БЖУ'
put('wine_white_dry', 'Вино белое сухое', 'drinks', 'as_sold', 66, 0.1, 0, 0.8, 0, auto=False, note=AL)
put('wine_red_dry', 'Вино красное сухое', 'drinks', 'as_sold', 68, 0.1, 0, 0.3, 0, auto=False, note=AL)
put('wine_white_semisweet', 'Вино белое полусладкое', 'drinks', 'as_sold', 78, 0.2, 0, 5.0, 0, auto=False, note=AL)
put('wine_red_semisweet', 'Вино красное полусладкое', 'drinks', 'as_sold', 82, 0.2, 0, 5.5, 0, auto=False, note=AL)
put('champagne_brut', 'Шампанское брют', 'drinks', 'as_sold', 76, 0.2, 0, 1.5, 0, auto=False, note=AL)
put('champagne_semisweet', 'Шампанское полусладкое', 'drinks', 'as_sold', 90, 0.2, 0, 6.0, 0, auto=False, note=AL)
put('beer_wheat', 'Пиво пшеничное', 'drinks', 'as_sold', 45, 0.5, 0, 3.5, 0, auto=False, note=AL)
put('beer_ipa', 'Пиво крафтовое IPA', 'drinks', 'as_sold', 58, 0.5, 0, 3.8, 0, auto=False, note=AL)

# salads
for key, name, p, f, c, fib in [
    ('salad_olivier', 'Салат Оливье', 6, 16, 8, 1), ('salad_olivier_chicken', 'Салат Оливье с курицей', 8, 12, 8, 1),
    ('salad_crab', 'Салат крабовый', 5, 11, 7, 0.5), ('salad_mimosa', 'Салат Мимоза', 6, 15, 4, 0.5),
    ('salad_herring_fur_coat', 'Селёдка под шубой', 4, 12, 8, 1), ('salad_veg_cucumber_tomato', 'Салат овощной: огурцы и помидоры с маслом', 1, 4, 4, 1.2),
    ('salad_caesar_chicken', 'Салат Цезарь с курицей', 10, 11, 7, 1), ('salad_caesar_shrimp', 'Салат Цезарь с креветками', 9, 10, 6, 1),
    ('salad_crispy_eggplant', 'Салат с хрустящим баклажаном', 3, 10, 9, 1.5), ('salad_greek', 'Салат греческий', 3, 9, 4, 1.2),
    ('salad_vinaigrette', 'Винегрет', 1.5, 5, 9, 2),
]:
    dish(key, name, 'ready_meals', p, f, c, fiber=fib)

# pizza: the type decides the numbers, the chains differ in names; a slice is about 110 g
PIZZA = {
    'margherita': ('Маргарита', 10, 9, 30), 'pepperoni': ('Пепперони', 11, 14, 28), 'four_cheese': ('Четыре сыра', 13, 15, 27),
    'ham_mushroom': ('Ветчина и грибы', 11, 9, 28), 'hawaiian': ('Гавайская', 10, 8, 29), 'meat': ('Мясная', 13, 13, 27),
    'cheese': ('Сырная', 12, 12, 29), 'ham_cheese': ('Ветчина и сыр', 12, 10, 28), 'chorizo': ('Чоризо-фреш', 12, 14, 27),
    'double_pepperoni': ('Двойная пепперони', 13, 17, 26), 'chicken_bbq': ('Цыплёнок барбекю', 12, 9, 30),
}
for t, (nm, p, f, c) in PIZZA.items():
    if t in ('margherita', 'pepperoni'):
        key = 'pizza_' + t
        dish(key, f'Пицца {nm} (кусок)', 'ready_meals', p, f, c, 110)
        continue
    dish(f'pizza_{t}', f'Пицца {nm} (кусок)', 'ready_meals', p, f, c, 110)
CHAINS = {
    'dodo': ('Додо Пицца', ['margherita', 'pepperoni', 'cheese', 'ham_cheese', 'chorizo', 'meat', 'hawaiian', 'double_pepperoni', 'four_cheese', 'chicken_bbq']),
    'papajohns': ("Papa Johns", ['margherita', 'pepperoni', 'four_cheese', 'hawaiian', 'meat', 'ham_mushroom', 'chicken_bbq']),
    'dominos': ("Domino's Pizza", ['margherita', 'pepperoni', 'four_cheese', 'ham_mushroom', 'hawaiian', 'meat', 'chicken_bbq']),
}
for ck, (cname, types) in CHAINS.items():
    for t in types:
        nm, p, f, c = PIZZA[t]
        dish(f'{ck}_pizza_{t}', f'{cname}: пицца {nm} (кусок)', 'ready_meals', p, f, c, 110, brand=cname)
dish('dodo_dodster_ham', 'Додо Пицца: Додстер с ветчиной и сыром', 'ready_meals', 10, 9, 25, 180, brand='Додо Пицца')
dish('dodo_dodster_pepperoni', 'Додо Пицца: Додстер с пепперони', 'ready_meals', 10, 11, 25, 180, brand='Додо Пицца')
dish('dodo_dodster_chicken', 'Додо Пицца: Додстер с курицей', 'ready_meals', 11, 8, 25, 180, brand='Додо Пицца')
dish('dodo_wings', 'Додо Пицца: крылышки куриные', 'ready_meals', 18, 16, 5, 30, brand='Додо Пицца')
dish('dodo_cheese_sticks', 'Додо Пицца: сырные палочки', 'ready_meals', 12, 18, 24, 25, brand='Додо Пицца')
dish('dodo_brownie', 'Додо Пицца: брауни', 'sweets', 5, 24, 48, 80, brand='Додо Пицца')
dish('dodo_cheesecake', 'Додо Пицца: чизкейк', 'sweets', 6, 22, 25, 100, brand='Додо Пицца')

# Вкусно — и точка
VT = 'Вкусно — и точка'
for key, name, p, f, c, piece in [
    ('vit_hamburger', 'Гамбургер', 12, 8, 28, 105), ('vit_cheeseburger', 'Чизбургер', 13, 11, 26, 120), ('vit_double_cheese', 'Двойной чизбургер', 15, 14, 22, 170),
    ('vit_big_hit', 'Биг Хит', 11, 13, 20, 210), ('vit_chicken_burger', 'Чикенбургер', 11, 11, 25, 160), ('vit_big_tasty', 'Биг Тейсти', 12, 15, 17, 260),
    ('vit_fish', 'Фишбургер', 9, 11, 24, 140), ('vit_fries', 'Картофель фри', 3.5, 15, 38, None), ('vit_nuggets', 'Наггетсы куриные', 15, 16, 14, 17),
    ('vit_strips', 'Стрипсы куриные', 16, 14, 15, 30), ('vit_roll_chicken', 'Ролл с курицей', 11, 10, 24, 180), ('vit_wings', 'Крылышки куриные', 18, 17, 8, 30),
    ('vit_apple_pie', 'Яблочный пирожок', 3, 12, 38, 80),
]:
    dish(key, f'{VT}: {name}', 'ready_meals', p, f, c, piece, brand=VT)

# Бургер Кинг
BK = 'Бургер Кинг'
for key, name, p, f, c, piece in [
    ('bk_whopper', 'Воппер', 12, 14, 15, 270), ('bk_double_whopper', 'Двойной Воппер', 16, 17, 11, 350), ('bk_cheeseburger', 'Чизбургер', 13, 11, 26, 125),
    ('bk_long_chicken', 'Лонг Чикен', 10, 14, 21, 150), ('bk_chicken_king', 'Чикен Кинг', 11, 12, 24, 190), ('bk_nuggets', 'Наггетсы', 15, 17, 15, 17),
    ('bk_fries', 'Картофель фри', 3.5, 15, 38, None), ('bk_onion_rings', 'Луковые кольца', 4, 15, 32, 20), ('bk_wings', 'Острые крылышки', 18, 18, 8, 30),
    ('bk_caesar_roll', 'Цезарь ролл', 11, 11, 22, 200),
]:
    dish(key, f'{BK}: {name}', 'ready_meals', p, f, c, piece, brand=BK)

# Ростикс
RX = 'Ростикс'
for key, name, p, f, c, piece in [
    ('rostics_leg', 'Ножка куриная в панировке', 18, 14, 9, 100), ('rostics_wings', 'Острые крылышки', 18, 17, 8, 30), ('rostics_strips', 'Стрипсы', 19, 12, 12, 35),
    ('rostics_boxmaster', 'Боксмастер', 11, 11, 24, 250), ('rostics_twister', 'Твистер', 10, 10, 20, 200), ('rostics_burger', 'Бургер куриный', 11, 12, 24, 170),
    ('rostics_fries', 'Картофель фри', 3.5, 15, 38, None), ('rostics_potato_country', 'Картофель по-деревенски', 3, 12, 28, None), ('rostics_nuggets', 'Наггетсы', 15, 16, 14, 17),
    ('rostics_coleslaw', 'Салат Коул-слоу', 1, 8, 7, None), ('rostics_caesar', 'Салат Цезарь', 9, 11, 7, None),
]:
    dish(key, f'{RX}: {name}', 'ready_meals', p, f, c, piece, brand=RX)

# Теремок
TM = 'Теремок'
for key, name, cat, p, f, c, piece in [
    ('teremok_blin_ham', 'Блин с ветчиной и сыром', 'ready_meals', 10, 9, 22, 200), ('teremok_blin_chicken', 'Блин с курицей и грибами', 'ready_meals', 9, 8, 21, 200),
    ('teremok_blin_curd', 'Блин с творогом', 'ready_meals', 8, 6, 27, 160), ('teremok_blin_meat', 'Блин с мясом', 'ready_meals', 10, 9, 21, 200),
    ('teremok_blin_salmon', 'Блин с лососем и сливочным сыром', 'ready_meals', 10, 11, 20, 180), ('teremok_blin_jam', 'Блин с вареньем', 'sweets', 4, 5, 36, 150),
    ('teremok_blin_condensed', 'Блин со сгущёнкой', 'sweets', 5, 8, 40, 150), ('teremok_blin_plain', 'Блин без начинки', 'bread_bakery', 6, 8, 28, 70),
    ('teremok_syrniki', 'Сырники', 'ready_meals', 12, 9, 22, 60), ('teremok_borscht', 'Борщ', 'ready_meals', 1.5, 3, 5, None),
    ('teremok_shchi', 'Щи', 'ready_meals', 1.3, 2.5, 4, None), ('teremok_solyanka', 'Солянка', 'ready_meals', 4, 5, 2, None),
    ('teremok_chicken_noodle', 'Куриный суп с лапшой', 'ready_meals', 3, 1.5, 5, None), ('teremok_oatmeal', 'Каша овсяная на молоке', 'ready_meals', 3.5, 4, 14, None),
    ('teremok_pelmeni', 'Пельмени', 'ready_meals', 11, 10, 25, 12),
]:
    dish(key, f'{TM}: {name}', cat, p, f, c, piece, brand=TM)

# Крошка Картошка: baked potato with a filling
KK = 'Крошка Картошка'
for key, name, p, f, c in [
    ('kk_potato_plain', 'Картофель без начинки', 2.2, 0.3, 17), ('kk_potato_cheese', 'Картофель с сыром', 5, 8, 17), ('kk_potato_chicken_mushroom', 'Картофель с курицей и грибами', 6, 5, 15),
    ('kk_potato_ham_cheese', 'Картофель с ветчиной и сыром', 6, 7, 16), ('kk_potato_meat', 'Картофель с мясом', 7, 6, 15), ('kk_potato_tuna', 'Картофель с тунцом', 8, 4, 15),
    ('kk_potato_mushroom', 'Картофель с грибами', 3, 5, 15), ('kk_potato_shrimp', 'Картофель с креветками', 7, 5, 15), ('kk_potato_cabbage_egg', 'Картофель с капустой и яйцом', 4, 4, 17),
]:
    dish(key, f'{KK}: {name}', 'ready_meals', p, f, c, None, brand=KK)

# Japanese restaurants (Якитория, Тануки): more rolls and hot dishes
for key, name, cat, p, f, c, piece in [
    ('roll_canada', 'Ролл Канада (угорь, сыр, огурец)', 'ready_meals', 5.5, 8, 20, 30), ('roll_ebi_tempura', 'Ролл с креветкой темпура', 'ready_meals', 6, 8, 25, 35),
    ('roll_dragon', 'Ролл Дракон (угорь, авокадо)', 'ready_meals', 6, 7, 24, 35), ('roll_teriyaki_chicken', 'Ролл с курицей терияки', 'ready_meals', 7, 5, 24, 30),
    ('roll_crab_cheese', 'Ролл с крабом и сыром', 'ready_meals', 5, 6, 24, 30), ('roll_salmon_avocado', 'Ролл с лососем и авокадо', 'ready_meals', 6, 7, 21, 30),
    ('roll_baked_shrimp', 'Ролл запечённый с креветкой', 'ready_meals', 8, 9, 20, 35), ('roll_baked_crab', 'Ролл запечённый с крабом', 'ready_meals', 6, 9, 22, 35),
    ('miso_soup', 'Мисо-суп', 'ready_meals', 2, 1, 2.5, None), ('tom_yum', 'Том ям', 'ready_meals', 3, 3, 3, None), ('ramen_chicken', 'Рамен с курицей', 'ready_meals', 5, 3, 10, None),
    ('wok_chicken_noodle', 'Вок с курицей и лапшой', 'ready_meals', 8, 6, 18, None), ('wok_beef_noodle', 'Вок с говядиной и лапшой', 'ready_meals', 9, 7, 17, None),
    ('udon_chicken', 'Удон с курицей', 'ready_meals', 7, 4, 19, None), ('gyoza', 'Гёдза (жареные пельмени)', 'ready_meals', 8, 7, 20, 25),
    ('shrimp_tempura', 'Креветки в темпуре', 'ready_meals', 12, 12, 14, 25), ('chuka_salad', 'Салат чука', 'ready_meals', 2, 4, 12, None), ('edamame', 'Эдамаме', 'vegetables', 11, 5, 8, None),
    ('poke_salmon', 'Поке с лососем', 'ready_meals', 9, 6, 18, None), ('tuna_tartare', 'Тартар из тунца', 'ready_meals', 18, 6, 3, None),
]:
    dish(key, name, cat, p, f, c, piece, brand=None)

json.dump(foods, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('foods:', len(foods))
