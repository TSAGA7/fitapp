#!/usr/bin/env python3
"""Upserts extra exercises into packages/seed/data/exercises.json (by key) and bumps catalogVersion."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'packages' / 'seed' / 'data'
ex_path, eq_path, meta_path = root / 'exercises.json', root / 'equipment.json', root / 'meta.json'
M = lambda *a: list(a)

def ex(key, name, pattern, prim, sec, comp, joint, axial, stab, rom, pain, equip, skill, prog, unit, sets, reps, rest, cues, subs, variants=None):
    return dict(key=key, name=name, movementPattern=pattern, primaryMuscles=prim, secondaryMuscles=sec, isCompound=comp,
        jointStress=joint, axialLoad=axial, stabilityRequirement=stab, rangeOfMotion=rom,
        painSensitiveAreas=[dict(area=a, note=n) for a, n in pain], equipmentRequirements=equip, skillLevel=skill,
        progressionType=prog, loadUnit=unit, defaultSets=sets, defaultRepRange=dict(min=reps[0], max=reps[1]), defaultRestSec=rest,
        cues=cues, curatedSubstituteKeys=subs,
        variants=[dict(key='default', label='Стандартный вариант', note=None)] + [dict(key=k, label=l, note=n) for k, l, n in (variants or [])])

NEW = [
# ---- вакуум и дыхание (поперечная мышца живота)
ex('vacuum_standing','Вакуум стоя','core_antiextension',M('abs'),M('obliques'),False,{'lower_back':0},0,1,'short',[('lower_back','Не прогибай поясницу; при головокружении остановись и подыши спокойно')],[],1,'time','seconds',3,(10,30),30,['Полный выдох до конца','Втяни живот к позвоночнику и держи','Рёбра вниз, плечи расслаблены','Грудью не дыши — вдох через рёбра'],['vacuum_quadruped','vacuum_lying','dead_bug']),
ex('vacuum_quadruped','Вакуум на четвереньках','core_antiextension',M('abs'),M('obliques'),False,{'lower_back':0,'wrist':1},0,1,'short',[('wrist','Если давит на запястья — опирайся на кулаки или предплечья')],[],1,'time','seconds',3,(10,30),30,['Спина ровная, не провисай','Выдохни и втяни живот к позвоночнику','Держи без задержки лишнего напряжения в шее'],['vacuum_standing','vacuum_lying','bird_dog']),
ex('vacuum_lying','Вакуум лёжа','core_antiextension',M('abs'),[],False,{'lower_back':0},0,0,'short',[],[],1,'time','seconds',3,(10,30),30,['Колени согнуты, стопы на полу','Выдох и втяжение живота','Поясница не отрывается от пола'],['vacuum_standing','vacuum_quadruped','dead_bug']),
ex('breathing_90_90','Диафрагмальное дыхание 90/90','core_antiextension',M('abs'),M('obliques'),False,{'lower_back':0},0,0,'short',[],[],1,'time','seconds',2,(30,60),20,['Лёжа, ноги на стуле под 90°','Вдох носом — рёбра расширяются в стороны','Долгий выдох ртом, рёбра опускаются, живот подтягивается','Поясница мягко прижата'],['vacuum_lying','vacuum_standing','dead_bug']),
ex('heel_slide','Скольжение пяткой лёжа','core_antiextension',M('abs'),[],False,{'lower_back':0},0,0,'short',[],[],1,'rep_only','bodyweight',2,(8,12),30,['Поясница прижата','Сначала выдох и включение поперечной, потом движение'],['dead_bug','vacuum_lying']),
# ---- пресс
ex('crunch_floor','Скручивания на полу','core_flexion',M('abs'),[],False,{'lower_back':1},0,0,'short',[('lower_back','Не тяни шею руками')],[],1,'rep_only','bodyweight',3,(12,20),45,['Выдох на подъёме','Подбородок от груди'],['reverse_crunch','ab_machine_crunch']),
ex('bicycle_crunch','Велосипед','core_flexion',M('abs','obliques'),[],False,{'lower_back':1},0,1,'medium',[],[],1,'rep_only','bodyweight',3,(12,20),45,['Медленно','Локоть к противоположному колену'],['crunch_floor','reverse_crunch']),
ex('lying_leg_raise','Подъём ног лёжа','core_flexion',M('abs'),M('quads'),False,{'lower_back':2},0,1,'medium',[('lower_back','Поясница должна оставаться прижатой — иначе согни колени')],[],2,'rep_only','bodyweight',3,(8,15),60,['Поясница прижата','Опускай медленно'],['reverse_crunch','dead_bug']),
ex('flutter_kicks','Ножницы (флаттер-киксы)','core_antiextension',M('abs'),M('quads'),False,{'lower_back':1},0,1,'short',[('lower_back','Поясница прижата; иначе подними ноги выше')],[],2,'time','seconds',3,(20,40),45,['Поясница прижата','Мелкая амплитуда'],['hollow_hold','dead_bug']),
ex('hollow_hold','Лодочка (hollow hold)','core_antiextension',M('abs'),[],False,{'lower_back':1},0,2,'short',[('lower_back','Не отрывай поясницу от пола — упрощай вариант')],[],2,'time','seconds',3,(15,40),45,['Поясница прижата','Подбородок к груди'],['dead_bug','plank'],[('tuck','Со сгруппированными коленями','Проще')]),
ex('mountain_climber','Скалолаз','core_antiextension',M('abs'),M('front_delts','quads'),False,{'wrist':1,'shoulder':1},0,2,'short',[('wrist','Опирайся на кулаки при дискомфорте')],[],2,'time','seconds',3,(20,40),45,['Таз не поднимать','Колени к груди по очереди'],['plank','dead_bug']),
ex('plank_shoulder_tap','Планка с касанием плеча','core_antirotation',M('abs','obliques'),M('front_delts'),False,{'shoulder':1,'wrist':1},0,3,'short',[],[],2,'rep_only','bodyweight',3,(10,20),45,['Таз не качается','Ноги шире — легче'],['plank','side_plank','bird_dog']),
ex('cable_woodchop','Дровосек на блоке','core_antirotation',M('obliques','abs'),M('front_delts'),False,{'lower_back':1},0,2,'medium',[('lower_back','Поворот из грудного отдела, не из поясницы')],[['single_cable']],2,'double','kg_stack',3,(10,15),60,['Бёдра развёрнуты в ту же сторону','Руки прямые'],['pallof_press','side_plank']),
ex('side_crunch_cable','Боковые скручивания на блоке','core_antirotation',M('obliques'),M('abs'),False,{'lower_back':1},0,1,'medium',[],[['single_cable']],2,'double','kg_stack',3,(10,15),60,['Сгибание вбок без поворота'],['side_plank','pallof_press']),
ex('decline_crunch','Скручивания на наклонной скамье','core_flexion',M('abs'),[],False,{'lower_back':2},0,1,'medium',[('lower_back','Малый угол; не тяни шею')],[['adjustable_bench']],2,'rep_only','bodyweight',3,(10,15),60,['Амплитуда короткая','Без рывков'],['crunch_floor','reverse_crunch']),
ex('toe_touch_lying','Касание носков лёжа','core_flexion',M('abs'),[],False,{'lower_back':1},0,0,'short',[],[],1,'rep_only','bodyweight',3,(12,20),45,['Ноги вверх, тянись к носкам','Выдох на подъёме'],['crunch_floor','reverse_crunch']),
# ---- ноги / ягодицы (свой вес и оборудование)
ex('bodyweight_squat','Приседания с собственным весом','squat',M('quads','glutes'),M('adductors'),True,{'knee':1,'hip':1,'lower_back':0},0,1,'full',[('knee','Колени по линии носков, глубина — комфортная')],[],1,'rep_only','bodyweight',3,(12,20),60,['Вес на всей стопе','Корпус прямой','Руки перед собой'],['goblet_squat_db','leg_press']),
ex('wall_sit','Стульчик у стены','squat',M('quads'),M('glutes'),False,{'knee':2},0,0,'short',[('knee','При боли в коленях уменьши угол сгибания')],[],1,'time','seconds',3,(20,60),60,['Бёдра параллельно полу или выше','Спина прижата к стене'],['bodyweight_squat','leg_press']),
ex('split_squat_bw','Сплит-присед с собственным весом','lunge',M('quads','glutes'),M('adductors'),True,{'knee':2,'hip':1},0,2,'full',[('knee','Колено не заваливать внутрь')],[],2,'rep_only','bodyweight',3,(8,14),60,['Корпус вертикально','Передняя пятка прижата'],['reverse_lunge_db','bodyweight_squat']),
ex('reverse_lunge_bw','Обратные выпады с собственным весом','lunge',M('quads','glutes'),M('hamstrings'),True,{'knee':1,'hip':1},0,2,'full',[],[],1,'rep_only','bodyweight',3,(8,14),60,['Шаг назад','Корпус вертикально'],['reverse_lunge_db','split_squat_bw']),
ex('single_leg_glute_bridge','Ягодичный мост на одной ноге','hip_extension',M('glutes'),M('hamstrings'),False,{'hip':0,'lower_back':0},0,2,'short',[],[],2,'rep_only','bodyweight',3,(8,15),45,['Таз ровно','Пауза наверху'],['glute_bridge_bw','hip_thrust_barbell']),
ex('single_leg_rdl_bw','Румынская тяга на одной ноге','hinge',M('hamstrings','glutes'),M('lower_back'),True,{'hip':1,'lower_back':1,'ankle':1},0,3,'medium',[('lower_back','Спина нейтральная; опирайся рукой о стену при потере баланса')],[],3,'rep_only','bodyweight',3,(8,12),60,['Таз назад, спина ровная','Медленно'],['rdl_db','cable_pull_through']),
ex('superman_hold','Суперман','hip_extension',M('lower_back','glutes'),[],False,{'lower_back':1},0,1,'short',[('lower_back','Без переразгибания — подъём небольшой')],[],1,'time','seconds',3,(15,30),45,['Подбородок к полу','Подъём невысокий'],['glute_bridge_bw','single_leg_glute_bridge']),
ex('bodyweight_calf_raise','Подъёмы на носки с собственным весом','calf_raise',M('calves'),[],False,{'ankle':1},0,1,'full',[],[],1,'rep_only','bodyweight',3,(15,25),45,['Пауза наверху','Опускайся медленно'],['leg_press_calf_raise','standing_calf_raise_machine']),
ex('cable_glute_kickback','Отведение ноги назад на блоке','hip_extension',M('glutes'),M('hamstrings'),False,{'hip':1,'lower_back':1},0,1,'medium',[('lower_back','Не прогибай поясницу')],[['single_cable']],1,'double','kg_stack',3,(10,15),60,['Корпус неподвижен','Пауза в конце'],['glute_bridge_bw','hip_abduction_machine_ex']),
ex('band_lateral_walk','Шаги в стороны с резинкой','hip_extension',M('glutes'),M('adductors'),False,{'knee':1,'hip':1},0,1,'short',[],[['resistance_band']],1,'rep_only','bodyweight',3,(12,20),45,['Полуприсед, колени не заваливать','Шаги маленькие'],['hip_abduction_machine_ex','glute_bridge_bw']),
ex('hip_adduction_machine_ex','Сведение бёдер в тренажёре','squat',M('adductors'),[],False,{'hip':1,'knee':0},0,0,'medium',[],[['hip_adduction_machine']],1,'double','kg_stack',3,(12,20),60,['Спина прижата','Без рывков'],['leg_press','goblet_squat_db']),
ex('kettlebell_goblet_squat','Гоблет-присед с гирей','squat',M('quads','glutes'),M('abs'),True,{'knee':1,'hip':1,'lower_back':1},1,1,'full',[],[['kettlebell']],1,'double','kg_total',3,(8,12),90,['Гиря у груди','Корпус прямой'],['goblet_squat_db','leg_press']),
# ---- грудь / плечи / руки (свой вес и добавки)
ex('knee_pushup','Отжимания с колен','horizontal_push',M('chest'),M('triceps','front_delts'),True,{'shoulder':1,'elbow':1,'wrist':1},0,1,'medium',[],[],1,'rep_only','bodyweight',3,(8,15),60,['Корпус прямой от колен до головы','Локти под 45°'],['pushup','incline_pushup']),
ex('decline_pushup','Отжимания с упором ног','horizontal_push',M('chest','front_delts'),M('triceps'),True,{'shoulder':2,'elbow':1,'wrist':1},0,2,'full',[('shoulder','Нагрузка на плечо выше — при дискомфорте верни обычные отжимания')],[['flat_bench']],2,'rep_only','bodyweight',3,(6,12),90,['Корпус жёсткий','Локти под 45°'],['pushup','incline_pushup']),
ex('pike_pushup','Отжимания «домиком»','vertical_push',M('front_delts','side_delts'),M('triceps'),True,{'shoulder':2,'wrist':1,'elbow':1},0,2,'full',[('shoulder','Давит на плечи — иди на комфортную глубину')],[],2,'rep_only','bodyweight',3,(6,12),90,['Таз вверх','Голова между рук'],['shoulder_press_machine_ex','db_shoulder_press_neutral']),
ex('diamond_pushup','Отжимания узким хватом','elbow_extension',M('triceps'),M('chest'),True,{'wrist':2,'elbow':2,'shoulder':1},0,2,'medium',[('elbow','При дискомфорте в локтях — шире руки')],[],2,'rep_only','bodyweight',3,(6,12),75,['Локти вдоль корпуса'],['bench_dip','cable_pushdown_rope']),
ex('prone_y_raise','Подъём рук Y лёжа','rear_delt_fly',M('rear_delts','upper_back'),[],False,{'shoulder':1,'lower_back':1},0,1,'short',[],[],1,'rep_only','bodyweight',3,(10,15),45,['Большие пальцы вверх','Лопатки вниз и к центру'],['face_pull','reverse_pec_deck']),
ex('incline_db_fly','Разведение гантелей на наклонной','chest_fly',M('chest'),M('front_delts'),False,{'shoulder':2,'elbow':1},0,1,'deep_stretch',[('shoulder','Не уходи глубоко в растяжение')],[['dumbbells','adjustable_bench']],2,'double','kg_per_hand',3,(10,15),90,['Локти чуть согнуты','Амплитуда комфортная'],['pec_deck_fly','cable_crossover_fly']),
ex('concentration_curl','Концентрированный подъём на бицепс','elbow_flexion',M('biceps'),[],False,{'elbow':1},0,0,'full',[],[['dumbbells']],1,'double','kg_per_hand',3,(10,15),60,['Локоть упёрт в бедро'],['db_curl','hammer_curl']),
ex('cable_hammer_curl','Молотки на канате','elbow_flexion',M('biceps'),M('forearms'),False,{'elbow':1},0,0,'full',[],[['single_cable']],1,'double','kg_stack',3,(10,15),60,['Нейтральный хват','Локти прижаты'],['hammer_curl','cable_curl']),
ex('wrist_curl_db','Сгибание запястий с гантелью','elbow_flexion',M('forearms'),[],False,{'wrist':2},0,0,'medium',[('wrist','Небольшой вес; при боли в запястье пропусти')],[['dumbbells']],1,'double','kg_per_hand',3,(12,20),45,['Предплечье на скамье'],['hammer_curl','db_curl']),
ex('db_pullover','Пуловер с гантелью','vertical_pull',M('lats'),M('chest','triceps'),False,{'shoulder':2,'elbow':1},0,1,'deep_stretch',[('shoulder','Большое растяжение плеча — амплитуда комфортная')],[['dumbbells','flat_bench']],2,'double','kg_total',3,(10,15),90,['Руки чуть согнуты','Грудная клетка расширена'],['straight_arm_pulldown','lat_pulldown_neutral']),
ex('wide_cable_row','Тяга блока к груди широким хватом','horizontal_pull',M('upper_back','rear_delts'),M('lats','biceps'),True,{'shoulder':1,'elbow':1,'lower_back':1},0,1,'full',[('shoulder','Локти не уводи слишком высоко')],[['seated_row_cable']],1,'double','kg_stack',3,(10,12),90,['Лопатки сводятся','Корпус неподвижен'],['cable_row_neutral','chest_supported_row_machine']),
ex('seal_row_db','Тяга гантелей лёжа на скамье','horizontal_pull',M('upper_back','lats'),M('rear_delts','biceps'),True,{'shoulder':1,'elbow':1,'lower_back':0},0,0,'full',[],[['dumbbells','adjustable_bench']],2,'double','kg_per_hand',3,(8,12),90,['Грудь на скамье — поясница не работает','Локти вдоль корпуса'],['chest_supported_row_machine','one_arm_db_row_bench']),
]

exs = json.load(open(ex_path))
by = {e['key']: i for i, e in enumerate(exs)}
for e in NEW:
    if e['key'] in by: exs[by[e['key']]] = e
    else: exs.append(e)
json.dump(exs, open(ex_path, 'w'), ensure_ascii=False, indent=2)
meta = json.load(open(meta_path)); meta['catalogVersion'] = max(meta['catalogVersion'], 3)
json.dump(meta, open(meta_path, 'w'))
print(len(exs), 'exercises, catalogVersion', meta['catalogVersion'])
