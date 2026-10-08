#!/usr/bin/env python3
"""Generates packages/seed/data/exercises.json (full catalog) and adds the equipment that the catalog needs.
Existing hand-tagged entries (the first 10) are kept as they are."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'packages' / 'seed' / 'data'
ex_path = root / 'exercises.json'
eq_path = root / 'equipment.json'
existing = json.load(open(ex_path))
keep = {e['key']: e for e in existing[:10]}

equipment = json.load(open(eq_path))
eqkeys = {e['key'] for e in equipment}
for k, n, cat, lt, step in [
    ('row_machine', 'Тяга с упором в грудь (тренажёр)', 'machines', 'stack', 5.0),
    ('lateral_raise_machine', 'Тренажёр для махов в стороны', 'machines', 'stack', 5.0),
    ('hip_abduction_machine', 'Тренажёр для отведения бедра', 'machines', 'stack', 5.0),
    ('hip_adduction_machine', 'Тренажёр для сведения бедра', 'machines', 'stack', 5.0),
    ('floor_mat', 'Коврик', 'accessories', 'none', None),
]:
    if k not in eqkeys:
        equipment.append(dict(key=k, name=n, category=cat, loadType=lt, defaultStepKg=step))
json.dump(equipment, open(eq_path, 'w'), ensure_ascii=False, indent=2)

M = lambda *a: list(a)
def ex(key, name, pattern, prim, sec, comp, joint, axial, stab, rom, pain, equip, skill, prog, unit, sets, reps, rest, cues, subs, variants=None):
    return dict(key=key, name=name, movementPattern=pattern, primaryMuscles=prim, secondaryMuscles=sec, isCompound=comp,
        jointStress=joint, axialLoad=axial, stabilityRequirement=stab, rangeOfMotion=rom,
        painSensitiveAreas=[dict(area=a, note=n) for a, n in pain], equipmentRequirements=equip, skillLevel=skill,
        progressionType=prog, loadUnit=unit, defaultSets=sets, defaultRepRange=dict(min=reps[0], max=reps[1]), defaultRestSec=rest,
        cues=cues, curatedSubstituteKeys=subs,
        variants=[dict(key='default', label='Стандартный вариант', note=None)] + [dict(key=k, label=l, note=n) for k, l, n in (variants or [])])

N = [
# ---- legs
ex('hack_squat','Гакк-присед в тренажёре','squat',M('quads','glutes'),M('adductors'),True,{'knee':2,'hip':1,'lower_back':1},1,0,'full',[('knee','Глубокое сгибание под большим весом — иди на комфортную глубину')],[['hack_squat']],1,'double','kg_total',3,(8,12),150,['Спина прижата','Колени по линии носков'],['leg_press','smith_squat']),
ex('bulgarian_split_squat_db','Болгарские сплит-приседания с гантелями','lunge',M('quads','glutes'),M('adductors','hamstrings'),True,{'knee':2,'hip':1,'lower_back':1},1,3,'full',[('knee','Колено не заваливать внутрь'),('lower_back','Корпус слегка вперёд, без прогиба')],[['dumbbells','flat_bench']],3,'double','kg_per_hand',3,(8,12),120,['Передняя нога стабильна','Контролируемое опускание'],['leg_press','goblet_squat_db']),
ex('reverse_lunge_db','Обратные выпады с гантелями','lunge',M('quads','glutes'),M('hamstrings'),True,{'knee':1,'hip':1,'lower_back':1},1,2,'full',[('lower_back','Корпус вертикально')],[['dumbbells']],2,'double','kg_per_hand',3,(8,12),120,['Шаг назад','Корпус вертикально'],['leg_press','goblet_squat_db']),
ex('walking_lunge_db','Выпады в ходьбе с гантелями','lunge',M('quads','glutes'),M('hamstrings'),True,{'knee':2,'hip':1,'lower_back':1},1,3,'full',[('knee','Колено над стопой')],[['dumbbells']],2,'double','kg_per_hand',3,(10,14),120,['Шаг широкий','Корпус вертикально'],['reverse_lunge_db','leg_press']),
ex('step_up_db','Зашагивания на скамью с гантелями','lunge',M('quads','glutes'),M('hamstrings'),True,{'knee':1,'hip':1,'lower_back':1},1,2,'medium',[],[['dumbbells','flat_bench']],1,'double','kg_per_hand',3,(8,12),90,['Работает ведущая нога','Не отталкивайся от пола'],['leg_press','reverse_lunge_db']),
ex('seated_leg_curl','Сгибание ног сидя','knee_flexion',M('hamstrings'),M('calves'),False,{'knee':1},0,0,'full',[],[['leg_curl_seated']],1,'double','kg_stack',3,(10,15),90,['Таз прижат','Медленно возвращай'],['lying_leg_curl']),
ex('hip_thrust_barbell','Ягодичный мост со штангой','hip_extension',M('glutes'),M('hamstrings','quads'),True,{'hip':1,'lower_back':1},1,1,'medium',[('lower_back','Не прогибай поясницу в верхней точке')],[['barbell','flat_bench']],2,'double','kg_total',3,(8,12),120,['Подбородок к груди','Пауза наверху'],['glute_bridge_bw','cable_pull_through']),
ex('glute_bridge_bw','Ягодичный мост (с весом тела)','hip_extension',M('glutes'),M('hamstrings'),False,{'hip':0,'lower_back':0},0,0,'short',[],[],1,'rep_only','bodyweight',3,(12,20),60,['Рёбра вниз','Пауза наверху'],['cable_pull_through','hip_thrust_barbell']),
ex('cable_pull_through','Тяга каната между ног (кроссовер)','hinge',M('glutes','hamstrings'),M('lower_back'),True,{'hip':1,'lower_back':1},0,1,'medium',[('lower_back','Спина нейтральная, движение из таза')],[['single_cable']],2,'double','kg_stack',3,(10,15),90,['Движение из таза','Спина нейтральная'],['glute_bridge_bw','lying_leg_curl']),
ex('back_extension_45','Гиперэкстензия 45°','hip_extension',M('glutes','hamstrings'),M('lower_back'),True,{'lower_back':2,'hip':1},1,1,'medium',[('lower_back','Без переразгибания; при зажиме — замена на ягодичный мост')],[['back_extension_bench']],2,'double','bodyweight',3,(10,15),90,['До прямой линии с корпусом','Без рывков'],['glute_bridge_bw','cable_pull_through']),
ex('standing_calf_raise_machine','Подъёмы на носки стоя в тренажёре','calf_raise',M('calves'),[],False,{'ankle':1},1,0,'full',[],[['calf_raise_machine']],1,'double','kg_stack',3,(10,15),75,['Пауза внизу и наверху'],['leg_press_calf_raise']),
ex('leg_press_calf_raise','Подъёмы на носки в жиме платформы','calf_raise',M('calves'),[],False,{'ankle':1},0,0,'full',[],[['leg_press']],1,'double','kg_total',3,(12,20),75,['Колени почти прямые','Полная амплитуда'],['standing_calf_raise_machine']),
ex('hip_abduction_machine_ex','Отведение бедра в тренажёре','hip_extension',M('glutes'),[],False,{'hip':1},0,0,'medium',[],[['hip_abduction_machine']],1,'double','kg_stack',3,(12,20),60,['Корпус неподвижен'],['glute_bridge_bw']),
ex('back_squat_barbell','Приседания со штангой на спине','squat',M('quads','glutes'),M('adductors','lower_back','abs'),True,{'knee':2,'hip':2,'lower_back':3},3,3,'full',[('lower_back','Высокая осевая нагрузка на позвоночник')],[['barbell','squat_rack']],3,'double','kg_total',3,(5,8),180,['Жёсткий корпус'],['leg_press','hack_squat','goblet_squat_db']),
ex('front_squat_barbell','Фронтальные приседания со штангой','squat',M('quads','glutes'),M('abs','lower_back'),True,{'knee':2,'hip':2,'lower_back':2,'wrist':2,'shoulder':1},2,3,'full',[('lower_back','Осевая нагрузка'),('wrist','Требует подвижности запястий')],[['barbell','squat_rack']],3,'double','kg_total',3,(5,8),180,['Локти высоко'],['hack_squat','leg_press','goblet_squat_db']),
ex('conventional_deadlift','Становая тяга классическая','hinge',M('glutes','hamstrings','lower_back'),M('lats','forearms','quads'),True,{'lower_back':3,'hip':2,'knee':1},3,3,'full',[('lower_back','Максимальная нагрузка на поясницу')],[['barbell']],3,'double','kg_total',3,(3,6),240,['Спина нейтральная'],['cable_pull_through','lying_leg_curl','hip_thrust_barbell']),
ex('rdl_barbell','Румынская тяга со штангой','hinge',M('hamstrings','glutes'),M('lower_back','forearms'),True,{'lower_back':3,'hip':2,'knee':1},3,3,'medium',[('lower_back','Тяжёлая поясничная нагрузка; предпочти гантели/тренажёр')],[['barbell']],3,'double','kg_total',3,(6,10),180,['Штанга близко к ногам'],['rdl_db','lying_leg_curl','cable_pull_through']),
ex('good_morning','Наклоны со штангой (good morning)','hinge',M('hamstrings','glutes','lower_back'),[],True,{'lower_back':3,'hip':2},3,3,'medium',[('lower_back','Высокая нагрузка на поясницу')],[['barbell','squat_rack']],3,'double','kg_total',3,(8,12),150,['Не делай с тяжёлым весом'],['cable_pull_through','lying_leg_curl']),
# ---- chest
ex('incline_machine_press','Жим от груди в наклонном тренажёре','horizontal_push',M('chest'),M('front_delts','triceps'),True,{'shoulder':1,'elbow':1},0,0,'medium',[('shoulder','Нейтральный хват и ограниченная амплитуда, если есть дискомфорт')],[['incline_press_machine']],1,'double','kg_stack',3,(8,12),120,['Лопатки сведены','Локти чуть ниже плеч'],['chest_press_machine_seated','db_incline_press_30']),
ex('db_flat_press','Жим гантелей лёжа','horizontal_push',M('chest'),M('front_delts','triceps'),True,{'shoulder':2,'elbow':1},0,1,'full',[('shoulder','Не уводи локти далеко от корпуса; ограничь глубину')],[['dumbbells','flat_bench']],2,'double','kg_per_hand',3,(8,12),120,['Лопатки сведены','Локти под углом 45–60°'],['chest_press_machine_seated','db_incline_press_30']),
ex('db_neutral_grip_press','Жим гантелей нейтральным хватом','horizontal_push',M('chest'),M('triceps','front_delts'),True,{'shoulder':1,'elbow':1},0,1,'medium',[],[['dumbbells','flat_bench']],2,'double','kg_per_hand',3,(8,12),120,['Ладони друг к другу','Локти близко'],['chest_press_machine_seated','incline_machine_press']),
ex('barbell_bench_press','Жим штанги лёжа','horizontal_push',M('chest'),M('front_delts','triceps'),True,{'shoulder':3,'elbow':2,'wrist':1},0,2,'full',[('shoulder','Часто вызывает дискомфорт; фиксированная траектория и глубокое растяжение')],[['barbell','flat_bench']],3,'double','kg_total',3,(5,8),180,['Лопатки сведены'],['chest_press_machine_seated','db_neutral_grip_press','incline_machine_press']),
ex('incline_barbell_press','Жим штанги на наклонной','horizontal_push',M('chest'),M('front_delts','triceps'),True,{'shoulder':3,'elbow':2},0,2,'full',[('shoulder','Нагрузка на переднюю дельту и плечевой сустав')],[['barbell','adjustable_bench']],3,'double','kg_total',3,(6,10),150,['Угол 30°'],['incline_machine_press','db_incline_press_30']),
ex('smith_bench_press','Жим лёжа в Смите','horizontal_push',M('chest'),M('triceps','front_delts'),True,{'shoulder':2,'elbow':1},0,0,'medium',[('shoulder','Фиксированная траектория — подбери положение скамьи')],[['smith_machine','flat_bench']],2,'double','kg_total',3,(8,12),120,['Лопатки сведены'],['chest_press_machine_seated','db_neutral_grip_press']),
ex('pec_deck_fly','Сведение рук в тренажёре (бабочка)','chest_fly',M('chest'),M('front_delts'),False,{'shoulder':1},0,0,'medium',[('shoulder','Не уводи локти за линию спины')],[['pec_deck']],1,'double','kg_stack',3,(10,15),90,['Локти чуть согнуты'],['cable_crossover_fly','chest_press_machine_seated']),
ex('cable_crossover_fly','Сведение в кроссовере','chest_fly',M('chest'),M('front_delts'),False,{'shoulder':2},0,1,'deep_stretch',[('shoulder','Глубокая растянутая позиция — ограничь амплитуду')],[['cable_crossover']],2,'double','kg_stack',3,(10,15),90,['Лёгкий изгиб в локтях'],['pec_deck_fly']),
ex('low_to_high_cable_fly','Сведение снизу вверх в кроссовере','chest_fly',M('chest'),M('front_delts'),False,{'shoulder':1},0,1,'medium',[],[['cable_crossover']],2,'double','kg_stack',3,(10,15),90,['Руки идут вверх к подбородку'],['pec_deck_fly','cable_crossover_fly']),
ex('pushup','Отжимания от пола','horizontal_push',M('chest'),M('triceps','front_delts','abs'),True,{'shoulder':2,'wrist':1,'elbow':1},0,2,'full',[('shoulder','Локти под углом ~45°')],[],1,'rep_only','bodyweight',3,(8,15),90,['Корпус прямой','Локти под углом'],['chest_press_machine_seated','incline_pushup']),
ex('incline_pushup','Отжимания от опоры','horizontal_push',M('chest'),M('triceps','front_delts'),True,{'shoulder':1,'wrist':1},0,1,'medium',[],[['flat_bench']],1,'rep_only','bodyweight',3,(10,20),75,['Опора выше — легче'],['pushup','chest_press_machine_seated']),
ex('dips_chest','Отжимания на брусьях','horizontal_push',M('chest','triceps'),M('front_delts'),True,{'shoulder':3,'elbow':2},0,2,'deep_stretch',[('shoulder','Глубокое положение плеча под нагрузкой')],[['dip_station']],3,'double','bodyweight',3,(6,10),150,['Корпус слегка вперёд'],['chest_press_machine_seated','cable_pushdown_rope']),
# ---- back
ex('lat_pulldown_wide','Тяга верхнего блока широким хватом','vertical_pull',M('lats'),M('biceps','rear_delts'),True,{'shoulder':2,'elbow':1},0,0,'full',[('shoulder','Тяни к верху груди, не за голову')],[['lat_pulldown']],1,'double','kg_stack',3,(8,12),120,['Тяни к груди'],['lat_pulldown_neutral','assisted_pullup_ex']),
ex('lat_pulldown_underhand','Тяга верхнего блока обратным хватом','vertical_pull',M('lats'),M('biceps'),True,{'shoulder':1,'elbow':1},0,0,'full',[],[['lat_pulldown']],1,'double','kg_stack',3,(8,12),120,['Локти вниз и назад'],['lat_pulldown_neutral','assisted_pullup_ex']),
ex('assisted_pullup_ex','Подтягивания в гравитроне','vertical_pull',M('lats'),M('biceps','upper_back'),True,{'shoulder':2,'elbow':1},0,1,'full',[('shoulder','Не зависай в нижней точке на прямых руках')],[['assisted_pullup']],2,'double','kg_stack',3,(6,10),150,['Лопатки вниз'],['lat_pulldown_neutral','lat_pulldown_wide']),
ex('pullup','Подтягивания','vertical_pull',M('lats'),M('biceps','upper_back'),True,{'shoulder':2,'elbow':2},0,2,'full',[('shoulder','Начинай с активных лопаток')],[['pullup_bar']],3,'double','bodyweight',3,(5,10),150,['Лопатки вниз'],['assisted_pullup_ex','lat_pulldown_neutral']),
ex('chest_supported_row_machine','Тяга в тренажёре с упором в грудь','horizontal_pull',M('upper_back','lats'),M('biceps','rear_delts'),True,{'shoulder':1,'elbow':1,'lower_back':0},0,0,'full',[],[['row_machine']],1,'double','kg_stack',3,(8,12),120,['Грудь прижата','Сводим лопатки'],['cable_row_neutral','one_arm_db_row_bench']),
ex('one_arm_db_row_bench','Тяга гантели одной рукой с упором','horizontal_pull',M('lats','upper_back'),M('biceps','rear_delts'),True,{'shoulder':1,'lower_back':1},0,1,'full',[('lower_back','Опора рукой и коленом на скамью, спина нейтральная')],[['dumbbells','flat_bench']],2,'double','kg_per_hand',3,(8,12),90,['Тяни локоть к бедру'],['cable_row_neutral','chest_supported_row_machine']),
ex('single_arm_cable_row','Тяга блока одной рукой','horizontal_pull',M('lats','upper_back'),M('biceps'),True,{'shoulder':1,'lower_back':0},0,1,'full',[],[['single_cable']],1,'double','kg_stack',3,(10,12),90,['Корпус не вращай'],['cable_row_neutral','chest_supported_row_machine']),
ex('straight_arm_pulldown','Пуловер на верхнем блоке прямыми руками','vertical_pull',M('lats'),M('abs'),False,{'shoulder':1},0,0,'full',[],[['single_cable']],1,'double','kg_stack',3,(10,15),75,['Руки почти прямые'],['lat_pulldown_neutral']),
ex('face_pull','Тяга каната к лицу','rear_delt_fly',M('rear_delts','upper_back'),M('biceps'),False,{'shoulder':1},0,0,'medium',[],[['single_cable']],1,'double','kg_stack',3,(12,20),60,['Локти выше кистей'],['reverse_pec_deck','rear_delt_fly_db']),
ex('reverse_pec_deck','Обратные разведения в тренажёре','rear_delt_fly',M('rear_delts'),M('upper_back'),False,{'shoulder':1},0,0,'medium',[],[['pec_deck']],1,'double','kg_stack',3,(12,20),60,['Локти слегка согнуты'],['face_pull','rear_delt_fly_db']),
ex('barbell_row','Тяга штанги в наклоне','horizontal_pull',M('lats','upper_back'),M('biceps','lower_back','rear_delts'),True,{'lower_back':3,'shoulder':1},2,3,'full',[('lower_back','Длительная изометрия поясницы в наклоне')],[['barbell']],3,'double','kg_total',3,(6,10),150,['Спина нейтральная'],['chest_supported_row_machine','cable_row_neutral']),
ex('db_shrug','Шраги с гантелями','vertical_pull',M('upper_back'),M('forearms'),False,{'shoulder':1,'upper_back':1},1,0,'short',[],[['dumbbells']],1,'double','kg_per_hand',3,(10,15),75,['Без вращения плечами'],['face_pull']),
# ---- shoulders
ex('shoulder_press_machine_ex','Жим от плеч в тренажёре','vertical_push',M('front_delts','side_delts'),M('triceps'),True,{'shoulder':2,'elbow':1},1,0,'medium',[('shoulder','Нейтральный хват, стоп при щелчке/боли')],[['shoulder_press_machine']],1,'double','kg_stack',3,(8,12),120,['Не прогибай поясницу'],['db_shoulder_press_neutral','lateral_raise_db']),
ex('db_shoulder_press_neutral','Жим гантелей сидя нейтральным хватом','vertical_push',M('front_delts','side_delts'),M('triceps'),True,{'shoulder':2,'elbow':1,'lower_back':1},1,1,'medium',[('shoulder','Ладони друг к другу, не опускай ниже уровня ушей')],[['dumbbells','adjustable_bench']],2,'double','kg_per_hand',3,(8,12),120,['Спина на опоре'],['shoulder_press_machine_ex','lateral_raise_db']),
ex('ohp_barbell','Армейский жим стоя','vertical_push',M('front_delts','side_delts'),M('triceps','abs'),True,{'shoulder':3,'lower_back':2,'elbow':1},2,3,'full',[('shoulder','Жим над головой штангой — частая позиция дискомфорта'),('lower_back','Поясница склонна к прогибу')],[['barbell','squat_rack']],3,'double','kg_total',3,(5,8),180,['Ягодицы напряжены'],['shoulder_press_machine_ex','db_shoulder_press_neutral']),
ex('arnold_press','Жим Арнольда','vertical_push',M('front_delts','side_delts'),M('triceps'),True,{'shoulder':3,'elbow':1},1,2,'full',[('shoulder','Ротация плеча под нагрузкой — не лучший выбор при дискомфорте')],[['dumbbells','adjustable_bench']],3,'double','kg_per_hand',3,(8,12),120,['Контроль на ротации'],['db_shoulder_press_neutral','lateral_raise_db']),
ex('lateral_raise_db','Махи гантелей в стороны','lateral_raise',M('side_delts'),M('upper_back'),False,{'shoulder':1},0,1,'medium',[('shoulder','Поднимай до уровня плеч, не выше')],[['dumbbells']],1,'double','kg_per_hand',3,(12,20),60,['Локти слегка согнуты','Лёгкий наклон корпуса'],['cable_lateral_raise','machine_lateral_raise']),
ex('cable_lateral_raise','Махи в сторону на блоке','lateral_raise',M('side_delts'),[],False,{'shoulder':1},0,1,'medium',[],[['single_cable']],1,'double','kg_stack',3,(12,20),60,['Постоянное напряжение'],['lateral_raise_db','machine_lateral_raise']),
ex('machine_lateral_raise','Махи в стороны в тренажёре','lateral_raise',M('side_delts'),[],False,{'shoulder':1},0,0,'medium',[],[['lateral_raise_machine']],1,'double','kg_stack',3,(12,20),60,['Локти ведут движение'],['lateral_raise_db','cable_lateral_raise']),
ex('rear_delt_fly_db','Разведения гантелей на заднюю дельту','rear_delt_fly',M('rear_delts'),M('upper_back'),False,{'shoulder':1,'lower_back':1},0,1,'medium',[('lower_back','Опирайся грудью на наклонную скамью')],[['dumbbells','adjustable_bench']],2,'double','kg_per_hand',3,(12,20),60,['Грудь на скамье'],['reverse_pec_deck','face_pull']),
ex('front_raise_db','Подъёмы гантелей перед собой','vertical_push',M('front_delts'),[],False,{'shoulder':2},0,1,'medium',[('shoulder','Передняя дельта и так нагружена жимами')],[['dumbbells']],1,'double','kg_per_hand',3,(10,15),60,['Без раскачки'],['shoulder_press_machine_ex','db_shoulder_press_neutral']),
ex('upright_row','Тяга штанги к подбородку','vertical_pull',M('side_delts','upper_back'),M('biceps'),True,{'shoulder':3,'wrist':1},1,1,'medium',[('shoulder','Внутренняя ротация плеча под нагрузкой')],[['barbell']],2,'double','kg_total',3,(8,12),90,['—'],['lateral_raise_db','face_pull']),
# ---- arms
ex('ez_curl','Сгибание рук с EZ-грифом','elbow_flexion',M('biceps'),M('forearms'),False,{'elbow':1,'wrist':1},0,0,'full',[],[['ez_bar']],1,'double','kg_total',3,(8,12),75,['Локти прижаты'],['db_curl','cable_curl']),
ex('db_curl','Сгибание рук с гантелями','elbow_flexion',M('biceps'),M('forearms'),False,{'elbow':1},0,0,'full',[],[['dumbbells']],1,'double','kg_per_hand',3,(8,12),75,['Без раскачки'],['ez_curl','cable_curl']),
ex('hammer_curl','Молотковые сгибания','elbow_flexion',M('biceps'),M('forearms'),False,{'elbow':1},0,0,'full',[],[['dumbbells']],1,'double','kg_per_hand',3,(8,12),75,['Нейтральный хват'],['db_curl','cable_curl']),
ex('cable_curl','Сгибание рук на блоке','elbow_flexion',M('biceps'),[],False,{'elbow':1},0,0,'full',[],[['single_cable']],1,'double','kg_stack',3,(10,15),60,['Локти зафиксированы'],['db_curl','ez_curl']),
ex('incline_db_curl','Сгибания на наклонной скамье','elbow_flexion',M('biceps'),[],False,{'elbow':1,'shoulder':2},0,0,'deep_stretch',[('shoulder','Растянутое положение плеча сзади корпуса')],[['dumbbells','adjustable_bench']],2,'double','kg_per_hand',3,(8,12),75,['Локти назад не уводи'],['db_curl','cable_curl']),
ex('preacher_curl_ez','Сгибания на скамье Скотта','elbow_flexion',M('biceps'),[],False,{'elbow':2},0,0,'full',[('elbow','Не разгибай локоть до конца под тяжёлым весом')],[['preacher_bench','ez_bar']],2,'double','kg_total',3,(8,12),75,['Плавный возврат'],['ez_curl','cable_curl']),
ex('cable_pushdown_rope','Разгибания рук на блоке (канат)','elbow_extension',M('triceps'),[],False,{'elbow':1},0,0,'full',[],[['single_cable']],1,'double','kg_stack',3,(10,15),75,['Локти прижаты'],['cable_pushdown_bar','overhead_cable_extension']),
ex('cable_pushdown_bar','Разгибания рук на блоке (прямая рукоять)','elbow_extension',M('triceps'),[],False,{'elbow':1,'wrist':1},0,0,'full',[],[['single_cable']],1,'double','kg_stack',3,(8,12),75,['Корпус неподвижен'],['cable_pushdown_rope']),
ex('overhead_cable_extension','Французский жим на блоке стоя','elbow_extension',M('triceps'),[],False,{'elbow':1,'shoulder':2},0,1,'deep_stretch',[('shoulder','Руки над головой — ограничь амплитуду')],[['single_cable']],2,'double','kg_stack',3,(10,15),75,['Локти вперёд'],['cable_pushdown_rope']),
ex('skull_crusher_ez','Французский жим лёжа с EZ-грифом','elbow_extension',M('triceps'),[],False,{'elbow':2,'shoulder':1},0,0,'full',[('elbow','Нагрузка на локти')],[['ez_bar','flat_bench']],2,'double','kg_total',3,(8,12),90,['Локти неподвижны'],['cable_pushdown_rope','cable_pushdown_bar']),
ex('db_kickback','Разгибания руки с гантелью в наклоне','elbow_extension',M('triceps'),[],False,{'elbow':1,'lower_back':1},0,1,'short',[],[['dumbbells','flat_bench']],1,'double','kg_per_hand',3,(12,15),60,['Опора рукой на скамью'],['cable_pushdown_rope']),
ex('bench_dip','Обратные отжимания от скамьи','elbow_extension',M('triceps'),M('chest','front_delts'),True,{'shoulder':3,'elbow':2},0,1,'deep_stretch',[('shoulder','Плечо в глубокой экстензии под весом тела')],[['flat_bench']],2,'rep_only','bodyweight',3,(8,12),90,['—'],['cable_pushdown_rope','cable_pushdown_bar']),
# ---- core
ex('plank','Планка','core_antiextension',M('abs','obliques'),M(),False,{'lower_back':1,'shoulder':1},0,2,'short',[('lower_back','Не прогибай поясницу; при усталости остановись')],[],1,'time','seconds',3,(20,60),60,['Рёбра вниз','Таз подтянут'],['dead_bug','pallof_press']),
ex('side_plank','Боковая планка','core_antirotation',M('obliques','abs'),M(),False,{'shoulder':1,'lower_back':1},0,2,'short',[],[],2,'time','seconds',3,(15,45),60,['Тело в одну линию'],['pallof_press','plank']),
ex('dead_bug','Мёртвый жук','core_antiextension',M('abs'),M('obliques'),False,{'lower_back':0},0,1,'short',[],[['floor_mat']],1,'rep_only','bodyweight',3,(8,12),45,['Поясница прижата к полу'],['plank','pallof_press']),
ex('bird_dog','Птица-собака','core_antirotation',M('abs'),M('glutes','lower_back'),False,{'lower_back':1},0,2,'short',[],[['floor_mat']],1,'rep_only','bodyweight',3,(8,12),45,['Таз не поворачивать'],['dead_bug','plank']),
ex('pallof_press','Жим Паллофа на блоке','core_antirotation',M('obliques','abs'),M(),False,{'lower_back':0},0,2,'short',[],[['single_cable']],1,'double','kg_stack',3,(10,15),60,['Корпус не поворачивать'],['plank','side_plank']),
ex('cable_crunch','Скручивания на блоке','core_flexion',M('abs'),[],False,{'lower_back':2},1,1,'medium',[('lower_back','Сгибание позвоночника под нагрузкой — небольшой вес, без рывков')],[['single_cable']],2,'double','kg_stack',3,(10,15),60,['Сгибание из корпуса'],['ab_machine_crunch','dead_bug']),
ex('ab_machine_crunch','Скручивания в тренажёре','core_flexion',M('abs'),[],False,{'lower_back':1},0,0,'medium',[],[['ab_machine']],1,'double','kg_stack',3,(10,15),60,['Спина прижата к спинке'],['dead_bug','plank']),
ex('hanging_knee_raise','Подъём коленей в висе','core_flexion',M('abs'),M('forearms'),False,{'lower_back':1,'shoulder':1},0,2,'medium',[('shoulder','Висит на прямых руках — активные лопатки')],[['pullup_bar']],2,'rep_only','bodyweight',3,(8,12),75,['Без раскачки'],['ab_machine_crunch','dead_bug']),
ex('hanging_leg_raise','Подъём ног в висе','core_flexion',M('abs'),M('forearms'),False,{'lower_back':2,'shoulder':1},0,3,'full',[('lower_back','Прогиб поясницы при опускании ног')],[['pullup_bar']],3,'rep_only','bodyweight',3,(6,10),90,['Без раскачки'],['hanging_knee_raise','ab_machine_crunch']),
ex('reverse_crunch','Обратные скручивания','core_flexion',M('abs'),[],False,{'lower_back':1},0,1,'short',[],[['floor_mat']],1,'rep_only','bodyweight',3,(10,15),45,['Таз отрывается от пола вверх'],['dead_bug','ab_machine_crunch']),
ex('situp','Подъём корпуса (sit-up)','core_flexion',M('abs'),M('quads'),False,{'lower_back':2},0,1,'full',[('lower_back','Многократная нагрузка на поясничный отдел')],[['floor_mat']],1,'rep_only','bodyweight',3,(10,20),45,['—'],['reverse_crunch','ab_machine_crunch']),
ex('russian_twist','Русские скручивания','core_antirotation',M('obliques'),M('abs'),False,{'lower_back':3},0,2,'medium',[('lower_back','Ротация позвоночника с нагрузкой')],[['floor_mat']],2,'rep_only','bodyweight',3,(10,20),45,['—'],['pallof_press','side_plank']),
ex('ab_wheel','Ролик для пресса','core_antiextension',M('abs'),M('lats'),False,{'lower_back':3,'shoulder':2},0,3,'full',[('lower_back','Высокая нагрузка на поясницу при прогибе')],[],3,'rep_only','bodyweight',3,(6,10),90,['—'],['plank','dead_bug']),
ex('suitcase_carry','Прогулка с гантелью в одной руке','carry',M('obliques'),M('forearms','abs'),False,{'lower_back':1},1,2,'short',[],[['dumbbells']],1,'time','seconds',3,(20,40),60,['Корпус не наклонять'],['pallof_press','side_plank']),
ex('farmers_carry','Прогулка фермера','carry',M('forearms'),M('upper_back','abs'),True,{'lower_back':1},2,2,'short',[('lower_back','Умеренный вес, корпус прямой')],[['dumbbells']],1,'time','seconds',3,(20,40),75,['Осанка'],['suitcase_carry']),
# ---- cardio-like
ex('incline_walk','Ходьба в горку на дорожке','carry',M('calves','quads'),M('glutes'),False,{'knee':1},0,0,'medium',[],[['treadmill']],1,'time','seconds',1,(600,1800),0,['Лёгкий темп'],['bike_steady']),
ex('bike_steady','Велотренажёр в спокойном темпе','knee_extension',M('quads','calves'),M('glutes'),False,{'knee':1},0,0,'medium',[],[['exercise_bike']],1,'time','seconds',1,(600,1800),0,['Ровный темп'],['incline_walk']),
]
# ----- fix a few keys so substitutes resolve
renames = {'assisted_pullup_ex': 'assisted_pullup_ex'}
out = list(keep.values())
seen = set(keep)
for e in N:
    if e['key'] in seen: continue
    out.append(e); seen.add(e['key'])
# make existing exercises point to new ones where useful (curated, symmetric)
add_subs = {'leg_press':['hack_squat'],'chest_press_machine_seated':['incline_machine_press','db_neutral_grip_press'],'cable_row_neutral':['chest_supported_row_machine'],'lat_pulldown_neutral':['lat_pulldown_wide','assisted_pullup_ex'],'lying_leg_curl':['seated_leg_curl'],'rdl_db':['cable_pull_through','back_extension_45']}
for e in out:
    for s in add_subs.get(e['key'],[]):
        if s not in e['curatedSubstituteKeys']: e['curatedSubstituteKeys'].append(s)
json.dump(out, open(ex_path, 'w'), ensure_ascii=False, indent=2)
print(len(out), 'exercises')
