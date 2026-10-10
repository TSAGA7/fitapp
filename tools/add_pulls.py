#!/usr/bin/env python3
"""Adds vertical/horizontal pulls with several grips (grips are variants, each with its own progression history) and the matching machines."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'packages' / 'seed' / 'data'
ex_path, eq_path = root / 'exercises.json', root / 'equipment.json'
M = lambda *a: list(a)

EQ = [
  dict(key='lever_pulldown', name='Верхняя тяга рычажная (независимые рукоятки)', category='machines', loadType='plates', defaultStepKg=5.0),
  dict(key='high_row_lever', name='Рычажная тяга под углом (high row)', category='machines', loadType='plates', defaultStepKg=5.0),
  dict(key='low_row_lever', name='Горизонтальная рычажная тяга (low row)', category='machines', loadType='plates', defaultStepKg=5.0),
  dict(key='tbar_row_station', name='Т-тяга (упор для грифа / тренажёр)', category='machines', loadType='plates', defaultStepKg=2.5),
]

def ex(key, name, pattern, prim, sec, comp, joint, equip, sets, reps, rest, cues, subs, variants, pain=(), skill=1, unit='kg_stack', prog='double', axial=0, stab=0, rom='full'):
    return dict(key=key, name=name, movementPattern=pattern, primaryMuscles=prim, secondaryMuscles=sec, isCompound=comp,
        jointStress=joint, axialLoad=axial, stabilityRequirement=stab, rangeOfMotion=rom,
        painSensitiveAreas=[dict(area=a, note=n) for a, n in pain], equipmentRequirements=equip, skillLevel=skill,
        progressionType=prog, loadUnit=unit, defaultSets=sets, defaultRepRange=dict(min=reps[0], max=reps[1]), defaultRestSec=rest,
        cues=cues, curatedSubstituteKeys=subs,
        variants=[dict(key=k, label=l, note=n) for k, l, n in variants])

SH = ('shoulder', 'Не уводи плечи к ушам и не тяни рывком; при боли в плече сделай хват нейтральным')
EL = ('elbow', 'При боли в локте уменьши вес и держи хват нейтральным')
J = {'shoulder': 1, 'elbow': 1, 'lower_back': 0}

NEW = [
 ex('lat_pulldown_grips', 'Тяга верхнего блока (разные хваты)', 'vertical_pull', M('lats'), M('biceps', 'upper_back', 'rear_delts'), True, J, [['lat_pulldown']], 3, (8, 12), 90,
    ['Грудь вверх, лопатки вниз и друг к другу', 'Тяни локти к бокам, а не руки к голове', 'Вверху плечи не задираются к ушам'],
    ['lat_pulldown_neutral', 'lat_pulldown_wide', 'lever_pulldown_ex'],
    [('default', 'Широкий прямой хват', 'Акцент на ширину спины и верх широчайших'),
     ('neutral_narrow', 'Узкий нейтральный (V-рукоять)', 'Нижняя часть широчайших, больше амплитуда, мягче для плеч'),
     ('underhand', 'Обратный хват на ширине плеч', 'Нижние волокна широчайших и бицепс'),
     ('parallel_wide', 'Параллельный широкий (мультихват)', 'Золотая середина: ширина без нагрузки на плечи'),
     ('one_arm', 'Одной рукой (D-рукоять)', 'Равномерное развитие сторон, большая амплитуда')], pain=[SH]),
 ex('seated_row_grips', 'Горизонтальная тяга в блоке (разные рукояти)', 'horizontal_pull', M('upper_back', 'lats'), M('biceps', 'rear_delts'), True, {'shoulder': 1, 'elbow': 1, 'lower_back': 1}, [['seated_row_cable']], 3, (8, 12), 90,
    ['Спина ровная, корпус почти неподвижен', 'Тяни к низу живота (V) или к груди (широкий), локти назад', 'Внизу лопатки сведены, не заваливайся назад'],
    ['cable_row_neutral', 'wide_cable_row', 'chest_supported_row_machine'],
    [('default', 'V-рукоять, нейтральный хват', 'Классика: широчайшие и середина спины'),
     ('wide_overhand', 'Широкая рукоять, прямой хват к груди', 'Акцент на верх спины и задние дельты'),
     ('underhand', 'Обратный хват на ширине плеч', 'Нижняя часть широчайших, бицепс'),
     ('wide_neutral', 'Параллельный широкий хват', 'Середина спины и ромбовидные без нагрузки на плечи'),
     ('one_arm_d', 'Одной рукой (D-рукоять)', 'Вращение корпуса запрещено, амплитуда больше')], pain=[SH, ('lower_back', 'Не округляй спину и не откидывайся назад внизу амплитуды')]),
 ex('lever_pulldown_ex', 'Верхняя тяга в рычажном тренажёре', 'vertical_pull', M('lats'), M('biceps', 'upper_back'), True, J, [['lever_pulldown']], 3, (8, 12), 90,
    ['Грудь к рукояткам, лопатки вниз', 'Локти к бокам', 'Разгибайся полностью, не бросай вес'],
    ['lat_pulldown_grips', 'lat_pulldown_neutral', 'assisted_pullup_ex'],
    [('default', 'Нейтральный хват (рукоятки параллельно)', 'Универсальный вариант, мягко для плеч'),
     ('wide', 'Широкий хват', 'Акцент на ширину спины'),
     ('underhand', 'Обратный хват', 'Нижние волокна широчайших и бицепс'),
     ('one_arm', 'Поочерёдно одной рукой', 'Независимые рукоятки: равномерная работа сторон')], pain=[SH], unit='kg_total'),
 ex('high_row_lever_ex', 'Тяга под углом в рычажном тренажёре (high row)', 'horizontal_pull', M('upper_back', 'lats'), M('rear_delts', 'biceps'), True, J, [['high_row_lever']], 3, (8, 12), 90,
    ['Грудь прижата к упору', 'Тяни локти вниз и назад', 'Пауза с лопатками вместе'],
    ['chest_supported_row_machine', 'seated_row_grips', 'cable_row_neutral'],
    [('default', 'Нейтральный хват', 'Широчайшие и середина спины'),
     ('wide', 'Широкий хват', 'Верх спины и задние дельты'),
     ('underhand', 'Обратный хват', 'Нижние волокна широчайших'),
     ('one_arm', 'Поочерёдно', 'Независимые рычаги, без перекоса')], pain=[SH], unit='kg_total'),
 ex('low_row_lever_ex', 'Горизонтальная тяга в рычажном тренажёре (low row)', 'horizontal_pull', M('lats', 'upper_back'), M('biceps', 'rear_delts'), True, J, [['low_row_lever']], 3, (8, 12), 90,
    ['Грудь на подушке, спина ровная', 'Тяни локти к бокам корпуса', 'Не раскачивайся'],
    ['chest_supported_row_machine', 'seated_row_grips', 'high_row_lever_ex'],
    [('default', 'Нейтральный хват', 'Широчайшие и середина спины'),
     ('wide', 'Широкий хват', 'Верх спины'),
     ('underhand', 'Обратный хват', 'Нижняя часть широчайших'),
     ('one_arm', 'Поочерёдно', 'Независимые рукоятки')], pain=[SH, ('lower_back', 'Грудь на упоре: не отрывай корпус')], unit='kg_total'),
 ex('tbar_row_grips', 'Т-тяга (разные рукояти)', 'horizontal_pull', M('upper_back', 'lats'), M('rear_delts', 'biceps', 'lower_back'), True, {'shoulder': 1, 'elbow': 1, 'lower_back': 2}, [['tbar_row_station']], 3, (8, 12), 120,
    ['Спина ровная, корпус под углом', 'Тяни к низу груди, локти назад', 'Без рывков корпусом'],
    ['chest_supported_row_machine', 'seated_row_grips', 'one_arm_db_row_bench'],
    [('default', 'Узкая V-рукоять (нейтральный)', 'Широчайшие и середина спины'),
     ('wide', 'Широкая рукоять', 'Верх спины и задние дельты'),
     ('underhand', 'Обратный хват', 'Нижние волокна широчайших, бицепс')], pain=[SH, ('lower_back', 'Нагрузка на поясницу: на упор грудью или с лёгким весом')], skill=2, unit='kg_total', axial=1, stab=1),
]

exs = json.load(open(ex_path))
by = {e['key']: i for i, e in enumerate(exs)}
for e in NEW:
    if e['key'] in by: exs[by[e['key']]] = e
    else: exs.append(e)
json.dump(exs, open(ex_path, 'w'), ensure_ascii=False, indent=2)
eqs = json.load(open(eq_path))
eby = {e['key']: i for i, e in enumerate(eqs)}
for e in EQ:
    if e['key'] in eby: eqs[eby[e['key']]] = e
    else: eqs.append(e)
json.dump(eqs, open(eq_path, 'w'), ensure_ascii=False, indent=2)
print(len(exs), 'exercises', len(eqs), 'equipment')
