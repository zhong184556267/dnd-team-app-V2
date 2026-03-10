/**
 * D&D 5e 职业数据库：生命骰、施法类型、豁免熟练、职业特性等
 * 角色卡通过调用此处数据计算施法等级、展示可选特性并在角色上勾选已获得特性。
 */

/** 施法类型：full=全施法, half=半施法, third=三分之一施法, pact=契约(邪术师，单独算槽位) */
export const SPELLCASTING_TYPES = {
  full: 'full',
  half: 'half',
  third: 'third',
  pact: 'pact',
}

/** 施法属性 */
export const SPELL_ABILITY_KEYS = ['int', 'wis', 'cha']

/**
 * 职业数据：生命骰、施法、豁免熟练、特性列表
 * features: { id, name, description, level, subclass? } 按等级排序
 */
const CLASS_DATA = {
  野蛮人: {
    hitDice: 12,
    spellcasting: null,
    saveProficiencies: ['str', 'con'],
    features: [
      { id: 'rage', name: '狂暴', description: '在你的回合内可用奖励动作进入狂暴，持续至满足结束条件。', level: 1 },
      { id: 'unarmored_defense', name: '无甲防御', description: '不穿护甲时 AC = 10 + 敏捷 + 体质。', level: 1 },
      { id: 'reckless_attack', name: '鲁莽攻击', description: '首次攻击可令该回合攻击具优势，但攻击对你具优势。', level: 2 },
      { id: 'danger_sense', name: '危险感知', description: '对可见的敏捷豁免具优势。', level: 2 },
      { id: 'extra_attack', name: '额外攻击', description: '在你的回合内执行攻击动作时，可攻击两次。', level: 5 },
      { id: 'fast_movement', name: '快速移动', description: '未穿重甲时速度 +10 尺。', level: 5 },
    ],
  },
  吟游诗人: {
    hitDice: 8,
    spellcasting: { type: 'full', ability: 'cha' },
    saveProficiencies: ['dex', 'cha'],
    features: [
      { id: 'spellcasting_bard', name: '施法', description: '你通过乐器或歌声施法，施法关键属性为魅力。', level: 1 },
      { id: 'bardic_inspiration', name: '激励', description: '用奖励动作赋予一名生物 d6 激励骰，用于一次检定或攻击。', level: 1 },
      { id: 'jack_of_all_trades', name: '万事通', description: '未熟练技能的属性检定可加上 half 熟练加值。', level: 2 },
      { id: 'song_of_rest', name: '休憩曲', description: '短休时若用激励恢复生命，可额外恢复 d6。', level: 2 },
      { id: 'font_of_inspiration', name: '激励之泉', description: '短休或长休后恢复所有激励次数。', level: 5 },
    ],
  },
  牧师: {
    hitDice: 8,
    spellcasting: { type: 'full', ability: 'wis' },
    saveProficiencies: ['wis', 'cha'],
    features: [
      { id: 'spellcasting_cleric', name: '施法', description: '你通过信仰与圣徽施法，施法关键属性为感知。', level: 1 },
      { id: 'divine_domain', name: '神圣领域', description: '选择领域，获得领域法术与 1 级特性。', level: 1 },
      { id: 'channel_divinity', name: '引导神力', description: '可引导正能量/负能量，次数随等级增加。', level: 2 },
      { id: 'destroy_undead', name: '摧毁亡灵', description: '引导神力可摧毁一定 CR 的亡灵。', level: 5 },
    ],
  },
  德鲁伊: {
    hitDice: 8,
    spellcasting: { type: 'full', ability: 'wis' },
    saveProficiencies: ['int', 'wis'],
    flavor: '德鲁伊的古老结社号令着自然的伟力。德鲁伊们驱使着动物、植物和四大元素的魔法，他们治愈伤害，化身动物，和用元素降下毁灭。德鲁伊关心精妙的生态平衡与人们和自然和谐共处的需求，常守卫圣地或未经玷污的自然区域，在重大危险出现时作为冒险者直面威胁。',
    features: [
      { id: 'spellcasting_druid', name: '施法', description: '你通过研究自然的神秘伟力施展法术。戏法从德鲁伊法术列表选择，准备法术数量见特性表；长休可替换准备法术。施法属性为感知，可使用德鲁伊法器作为施法法器。', level: 1 },
      { id: 'druidic', name: '德鲁伊语', description: '你学会德鲁伊之间的秘密语言，并始终准备着法术动物交谈。可用德鲁伊语传递隐藏信息，他人需 DC15 智力（调查）检定才能意识到信息存在。', level: 1 },
      { id: 'primal_order', name: '原初职能', description: '选择一项：术师——额外学会一道德鲁伊戏法，智力（奥秘和自然）检定加值等于感知调整值（最低+1）；卫士——获得军用武器熟练和中甲受训。', level: 1 },
      { id: 'wild_shape', name: '荒野变形', description: '附赠动作变形为已学会的野兽形态，持续德鲁伊等级一半的小时数。使用次数见特性表，短休恢复 1 次、长休全恢复。已知形态数量与最大 CR 随等级提升；8 级起可用飞行形态。变形时获得等于德鲁伊等级的临时生命值，保留人格、记忆与语言，无法施法但专注不打断。', level: 2 },
      { id: 'wild_companion', name: '荒野伙伴', description: '魔法动作消耗一个法术位或一次荒野变形次数施展寻获魔宠，无需材料；魔宠为妖精，长休时消失。', level: 2 },
      { id: 'druid_subclass', name: '德鲁伊子职', description: '选择一项子职：大地结社、月亮结社、海洋结社或星辰结社，获得对应特性。', level: 3 },
      { id: 'asi_druid', name: '属性值提升', description: '获得属性值提升专长或满足条件的其他专长。亦于 8、12、16 级获得。', level: 4 },
      { id: 'wild_resurgence', name: '荒野复苏', description: '每回合一次，若没有荒野变形次数可消耗一个法术位（无需动作）获得一次荒野变形次数；或消耗一次荒野变形次数（无需动作）获得一个一环法术位，此后直至长休无法再以此法获得法术位。', level: 5 },
      { id: 'elemental_fury', name: '元素之怒', description: '选择其一：强力施法——德鲁伊戏法造成的伤害可加上感知调整值；原力蛮击——每回合一次，武器攻击或荒野变形中的野兽攻击命中时，可对目标额外造成 1d8 寒冷、火焰、闪电或雷鸣伤害（命中时选择）。', level: 7 },
      { id: 'improved_elemental_fury', name: '元素神威', description: '强力施法：施法距离 10 尺及以上的德鲁伊戏法施法距离提升 300 尺。原力蛮击：原力蛮击的额外伤害提升至 2d8。', level: 15 },
      { id: 'beast_spells', name: '兽形施法', description: '你可以在任何荒野变形下施法。需要标价材料成分或消耗材料成分的法术无法在荒野变形下施展。', level: 18 },
      { id: 'epic_boon_druid', name: '传奇恩惠', description: '获得一项传奇恩惠专长或其他适用的专长。', level: 19 },
      { id: 'archdruid', name: '大德鲁伊', description: '不凋化形：投先攻时若没有荒野变形次数则获得一次。自然术使：可将荒野变形次数转化为法术位（每 1 次数=2 环阶），长休前仅能使用一次。青春永驻：每过 10 年身体仿佛只过 1 年。', level: 20 },
    ],
    subclasses: {
      大地结社: { flavor: '与大地与生长之力结盟的德鲁伊结社。', features: [] },
      月亮结社: { flavor: '与月亮与野兽之灵结盟的德鲁伊结社。', features: [] },
      海洋结社: { flavor: '与海洋与风暴结盟的德鲁伊结社。', features: [] },
      星辰结社: { flavor: '与星辰与预兆结盟的德鲁伊结社。', features: [] },
    },
  },
  战士: {
    hitDice: 10,
    spellcasting: null,
    saveProficiencies: ['str', 'con'],
    features: [
      { id: 'fighting_style', name: '战斗风格', description: '选择一种战斗风格获得对应加成。', level: 1 },
      { id: 'second_wind', name: '回气', description: '在你的回合用奖励动作恢复 1d10+战士等级生命，短休恢复。', level: 1 },
      { id: 'action_surge', name: '动作如潮', description: '可在回合内多执行一个动作，短休或长休恢复。', level: 2 },
      { id: 'extra_attack_fighter', name: '额外攻击', description: '执行攻击动作时可攻击两次（5 级两次，11 级三次，20 级四次）。', level: 5 },
    ],
  },
  武僧: {
    hitDice: 8,
    spellcasting: null,
    saveProficiencies: ['str', 'dex'],
    features: [
      { id: 'martial_arts', name: '武艺', description: '未持武或仅用武僧武器时可用敏捷代替力量，并可附赠拳脚。', level: 1 },
      { id: 'unarmored_defense_monk', name: '无甲防御', description: '不穿护甲时 AC = 10 + 敏捷 + 感知。', level: 1 },
      { id: 'ki', name: '气', description: '拥有气点，用于疾跑、闪避、连击、震慑拳等。', level: 2 },
      { id: 'unarmored_movement', name: '无甲移动', description: '不穿护甲时速度增加。', level: 2 },
      { id: 'extra_attack_monk', name: '额外攻击', description: '执行攻击动作时可攻击两次。', level: 5 },
    ],
  },
  圣武士: {
    hitDice: 10,
    spellcasting: { type: 'half', ability: 'cha' },
    saveProficiencies: ['wis', 'cha'],
    features: [
      { id: 'divine_sense', name: '神圣感知', description: '可感知一定范围内的天界、邪魔、不死生物。', level: 1 },
      { id: 'lay_on_hands', name: '圣疗', description: '可用触碰恢复生命或驱散疾病与毒素。', level: 1 },
      { id: 'fighting_style_paladin', name: '战斗风格', description: '选择一种战斗风格。', level: 2 },
      { id: 'spellcasting_paladin', name: '施法', description: '半施法者，施法关键属性为魅力。', level: 2 },
      { id: 'divine_smite', name: '至圣斩', description: '命中后可用法术位造成额外光耀伤害。', level: 2 },
      { id: 'extra_attack_paladin', name: '额外攻击', description: '执行攻击动作时可攻击两次。', level: 5 },
    ],
  },
  游侠: {
    hitDice: 10,
    spellcasting: { type: 'half', ability: 'wis' },
    saveProficiencies: ['str', 'dex'],
    features: [
      { id: 'favored_enemy', name: '宿敌', description: '对特定类型生物在相关检定上获得加值。', level: 1 },
      { id: 'natural_explorer', name: '自然探索者', description: '在特定地形获得移动与探索加值。', level: 1 },
      { id: 'spellcasting_ranger', name: '施法', description: '半施法者，施法关键属性为感知。', level: 2 },
      { id: 'ranger_archetype', name: '游侠范型', description: '选择范型，获得对应特性。', level: 3 },
      { id: 'extra_attack_ranger', name: '额外攻击', description: '执行攻击动作时可攻击两次。', level: 5 },
    ],
  },
  游荡者: {
    hitDice: 8,
    spellcasting: null,
    saveProficiencies: ['dex', 'int'],
    features: [
      { id: 'expertise', name: '专精', description: '两项技能获得双倍熟练加值。', level: 1 },
      { id: 'sneak_attack', name: '偷袭', description: '对具有优势或邻接敌人的目标造成额外伤害。', level: 1 },
      { id: 'thieves_cant', name: '盗贼黑话', description: '掌握盗贼间的秘密交流方式。', level: 1 },
      { id: 'cunning_action', name: '灵巧动作', description: '可用附赠动作疾跑、撤离、躲藏。', level: 2 },
      { id: 'roguish_archetype', name: '游荡者范型', description: '选择范型（如诡术师为三分之一施法）。', level: 3 },
      { id: 'uncanny_dodge', name: '直觉闪避', description: '被可见攻击命中时可用反应将伤害减半。', level: 5 },
    ],
  },
  术士: {
    hitDice: 6,
    spellcasting: { type: 'full', ability: 'cha' },
    saveProficiencies: ['con', 'cha'],
    features: [
      { id: 'spellcasting_sorcerer', name: '施法', description: '施法关键属性为魅力，使用法术点与已知法术。', level: 1 },
      { id: 'sorcerous_origin', name: '术法起源', description: '选择起源，获得起源特性。', level: 1 },
      { id: 'font_of_magic', name: '术法点', description: '可将法术位与术法点互相转换。', level: 2 },
      { id: 'metamagic', name: '超魔', description: '可选择超魔选项，用术法点改变施法方式。', level: 3 },
    ],
  },
  邪术师: {
    hitDice: 8,
    spellcasting: { type: 'pact', ability: 'cha' },
    saveProficiencies: ['wis', 'cha'],
    features: [
      { id: 'otherworldly_patron', name: '异界宗主', description: '选择宗主，获得宗主特性。', level: 1 },
      { id: 'pact_magic', name: '契约魔法', description: '契约法术位单独计算，短休恢复；施法关键属性为魅力。', level: 1 },
      { id: 'eldritch_invocations', name: '魔能祈唤', description: '可选择祈唤增强契约能力。', level: 2 },
      { id: 'pact_boon', name: '契约恩赐', description: '3 级选择链、刃或书契。', level: 3 },
    ],
    subclasses: {
      邪魔宗主: {
        flavor: '与下层位面之物签订契约。宗主可能为恶魔领主（如狄魔高根、奥喀斯）、大魔鬼（如阿斯蒙蒂斯）、或强大的深狱炼魔、巴洛炎魔、尤格罗斯魔、夜鬼婆等；其目标邪恶，追求万物堕落与毁灭，最终连你亦无法独善其身。',
        features: [
          { id: 'fiend_spells', name: '邪魔法术', description: '到达表中魔契师等级时，始终准备对应法术。3 级：燃烧之手、命令术；5 级：灼热射线、暗示术；7 级：火焰护盾、火墙术；9 级：指使术、疫病虫群。', level: 3 },
          { id: 'dark_ones_blessing', name: '黑暗赐福', description: '当你将一名敌人生命值降至 0 时，获得临时生命值 = 魅力调整值 + 魔契师等级（至少 1）。若 10 尺内你的敌人被他人降至 0，你同样获得此增益。', level: 3 },
          { id: 'dark_ones_own_luck', name: '黑暗强运', description: '进行属性检定或豁免检定时，可在看到掷骰结果后、结果生效前使用此特性，为此次掷骰增添一个 d10。使用次数 = 魅力调整值（至少 1），单次检定只能用 1 次。长休后恢复所有次数。', level: 6 },
          { id: 'fiendish_resilience', name: '邪魔体魄', description: '每当完成短休或长休时，选择一种除力场外的伤害类型；在下次以此特性改选前，你对所选类型具有抗性。', level: 10 },
          { id: 'hurl_through_hell', name: '直坠噩梦', description: '每回合一次，当你以攻击检定命中一个生物时，可尝试将目标瞬间送入下层位面。目标进行对抗你法术豁免 DC 的魅力豁免，失败则消失并坠入噩梦般景色；若非邪魔则受 8d10 心灵伤害，并陷入失能直至你下一回合结束，随后返回原空间或最近未占据空间。使用后直至长休无法再次使用；也可消耗一个契约魔法法术位（无需动作）重置。', level: 14 },
        ],
      },
      至高妖精宗主: {
        flavor: '与妖精荒野、神秘妖精国度的存在签订契约。宗主可能为至高妖精（如霜冻亲王、薄暮王庭之主空暗女王、仲夏王庭泰坦尼亚）或远古鬼婆，也可能与众多妖精结成好感与人情交织的网络。其行为往往难以理解，有时甚至不可理喻。',
        features: [
          { id: 'archfey_spells', name: '至高妖精法术', description: '到达表中魔契师等级时，始终准备对应法术。3 级：妖火、睡眠术、安定心神、迷踪步、魅影之力；5 级：闪现术、植物滋长；7 级：支配野兽、高等隐形术；9 级：支配类人、伪装术。', level: 3 },
          { id: 'fey_presence', name: '妖精步伐', description: '可无需法术位施展迷踪步，次数 = 魅力调整值（至少 1），长休恢复。施展迷踪步时可选额外效应：复苏步伐——传送后你或 10 尺内一可见生物获得 1d10 临时生命值；嘲弄步伐——传送前空间 5 尺内生物需通过对抗你法术豁免 DC 的感知豁免，否则在对除你外的生物攻击检定时具劣势，直至你下一回合开始。', level: 3 },
          { id: 'misty_escape', name: '雾遁', description: '当你受到伤害时，可用反应施展迷踪步。妖精步伐新增选项：无踪步伐——获得隐形直至下一回合开始或你攻击/造成伤害/施法；惊惧步伐——传送前或传送后空间（由你选）5 尺内生物进行对抗你法术豁免 DC 的感知豁免，失败则受 2d10 心灵伤害。', level: 6 },
          { id: 'beguiling_defenses', name: '斗转星移', description: '对魅惑状态免疫。当可见敌人的攻击检定命中你后，可用反应使该次伤害减半（向下取整），并迫使攻击者进行对抗你法术豁免 DC 的感知豁免，失败则受到心灵伤害，数值等于你本次承受的实际伤害。此反应使用后直至长休无法再次使用；可消耗一个契约魔法法术位（无需动作）重置。', level: 10 },
          { id: 'bewitching_magic', name: '醉心魔法', description: '当你以一个动作消耗法术位施展一道幻术或惑控法术时，可以无需法术位地立刻施展迷踪步作为该动作的一部分。', level: 14 },
        ],
      },
    },
  },
  法师: {
    hitDice: 6,
    spellcasting: { type: 'full', ability: 'int' },
    saveProficiencies: ['int', 'wis'],
    flavor: '法师以他们对魔法内在运作机理的详尽研究而著称。他们施展的法术既可以化为爆焰、电弧，亦可以进行微妙的欺瞒与壮丽转化；可从其他位面咒唤怪物、预见未来、形成防护，最强大的法术能转化物质、召来流星或打开通往其他世界的大门。大多数法师将魔法当作学术研究，研究法术学派分类；亦有贤者、讲师、顾问或为知识诱惑而深入遗迹的冒险者。',
    features: [
      { id: 'spellcasting_wizard', name: '施法', description: '你通过研究奥术施展法术。戏法从法师法术表选择，长休可替换其一；升级时戏法数量见特性表。法术书记录你已知的一环及以上法术，最初含六道自选一环法术，之后每级可添加两道符合你法术位环阶的法师法术。准备法术数量见特性表，长休时可替换准备列表。施法属性为智力；可使用奥术法器或法术书作为施法法器。发现法师法术后可抄入法术书：每环阶 2 小时与 50GP；从自己的书复制到新书每环阶 1 小时与 10GP。', level: 1 },
      { id: 'ritual_adept', name: '仪式学家', description: '你能以仪式施展你法术书中任何带有仪式标签的法术，无需准备，但施展时必须阅读法术书。', level: 1 },
      { id: 'arcane_recovery', name: '奥术回想', description: '完成短休后，可选择恢复已消耗的法术位。所恢复的法术位环阶总和不得大于法师等级的一半（向上取整），且任一法术位环阶均须小于六环。此特性一经使用，直至完成长休无法再次使用。', level: 1 },
      { id: 'scholar', name: '学者', description: '从下列技能中选择一项你具有熟练的技能：奥秘、历史、调查、医药、自然或宗教。你获得所选技能的专精。', level: 2 },
      { id: 'wizard_subclass', name: '法师子职', description: '选择一项子职：防护师、预言师、塑能师、幻术师或剑咏者，获得对应特性。', level: 3 },
      { id: 'asi_wizard', name: '属性值提升', description: '获得属性值提升专长或满足条件的其他专长。亦于 8、12、16 级获得。', level: 4 },
      { id: 'memorize_spell', name: '记忆法术', description: '每当你完成一次短休时，你可以研究法术书并将其中一道你已准备的一环及以上法术替换为你法术书中的另一道一环及以上法术。', level: 5 },
      { id: 'spell_mastery', name: '法术精通', description: '从法术书中选择一道施法时间为动作的一环法术和一道二环法术；你总是准备这些法术，且能不消耗法术位地以最低环施展它们。升环施展则需正常消耗法术位。长休时可研究法术书将其中一道更换为同环阶的另一道符合条件的法术。', level: 18 },
      { id: 'epic_boon_wizard', name: '传奇恩惠', description: '获得一项传奇恩惠专长或其他适用的专长。', level: 19 },
      { id: 'signature_spells', name: '招牌法术', description: '从法术书中选择两道三环法术作为招牌法术。你总是准备这些法术，且能不消耗法术位地以三环施展每道各一次；此特性一经使用，直到完成短休或长休都不能再次以此法施展这两道法术。升环施展则需正常消耗法术位。', level: 20 },
    ],
    subclasses: {
      防护师: { flavor: '专精防护与结界学派的法师子职。', features: [] },
      预言师: { flavor: '专精预言与洞察学派的法师子职。', features: [] },
      塑能师: { flavor: '专精塑能学派的法师子职。', features: [] },
      幻术师: { flavor: '专精幻术学派的法师子职。', features: [] },
      剑咏者: {
        flavor: '剑咏者将剑术与舞蹈相结合的奥法传承。在战斗中运用优雅招式抵御伤害，将魔法导入攻击与防御。与古代精灵社会紧密联系，多数剑咏者出身精灵国度或与之交融的社群，为帮助民众与成就伟业将天赋带至各处。',
        features: [
          { id: 'bladesong', name: '剑歌', description: '附赠动作唤起剑歌（须未着装护甲或使用盾牌），持续 1 分钟；失能、着装护甲或盾牌、或双手持一把武器攻击时结束。可随时解除。使用次数等于智力调整值（至少 1），长休恢复全部；使用奥术回想时恢复 1 次。激活期间：灵动——AC 获得等于智力调整值的加值（最低+1），速度+10 尺，敏捷（特技）检定优势；剑法——用熟练的近战武器攻击时可用智力替代力量或敏捷进行攻击与伤害掷骰；专注——维持专注的体质豁免可加上智力调整值。', level: 3 },
          { id: 'training_war_song', name: '战歌训练', description: '获得所有不具有双手及重型词条的近战军用武器熟练。你可以使用你具有熟练的近战武器作为法师法术的施法法器。此外，从特技、运动、表演或游说中选择一项获得熟练。', level: 3 },
          { id: 'extra_attack_bladesinger', name: '额外攻击', description: '执行攻击动作时可以进行两次攻击而非一次。你可以将其中一次替换为施展一道施法时间为动作的法师戏法。', level: 6 },
          { id: 'song_of_defense', name: '守御之歌', description: '剑歌激活期间，当你受到伤害时，可以用反应消耗一枚法术位，将该伤害降低等同于该法术位环阶 5 倍的数值。', level: 10 },
          { id: 'song_of_victory', name: '胜利之歌', description: '在你施展了一道施法时间为动作的法术之后，你可以用附赠动作用武器进行一次攻击。', level: 14 },
        ],
      },
    },
  },
  // 繁星特色 · 基础职业
  魂灵学者: {
    hitDice: 6,
    spellcasting: { type: 'full', ability: 'wis' },
    saveProficiencies: ['int', 'wis'],
    isFanxing: true,
    features: [
      { id: 'soul_point', name: '魂力点', description: '你获得等于等级的魂力点，代表对周围灵魂的直接操控能量。耗尽后每再消耗一点需进行智力豁免 DC=10+已消耗魂力点，失败则进入灵崩症直至下次长休。灵崩症：施法需 DC16 专注否则失败且环位消耗；成功施法后下一回合该法术会在原目标原地点再释放一次。', level: 1 },
      { id: 'spellcasting_soul', name: '施法', description: '手册记录法术。1 级：4 个灵能法术 + 2 个神术或奥术；学习神术/奥术需 DC10+环位 智力鉴定，灵能自动成功（超环位则需智力鉴定）。如法师般休息后 1 小时准备法术。每级可加一个灵能入册。法术 DC=8+熟练+感知，攻击=熟练+感知。戏法从牧师或法师表选。仪式施法：有仪式标签且手册有载则可仪式施放。法器：3 磅精石制法器。', level: 1 },
      { id: 'psychic_focus', name: '灵能集中', description: '灵能集中能力，详见模组。', level: 1 },
      { id: 'soul_weaving', name: '魂灵异能', description: '与环境中魂灵交流的特殊能力。灵能预知：消耗 2 魂力点，可释放已学未准备的法术，仍消耗环位。无形灵动：消耗 1 魂力点，本次施法无动静与声音。创作法术：消耗等同环位魂力点，创作并立即以环位释放一个你未学的神术或奥术（不可造魔法物品）。强效灵能：消耗等同环位魂力点（戏法 1 点），本次法术目标豁免劣势。', level: 3 },
      { id: 'extra_feat_psychic', name: '额外专长（灵能）', description: '在 5、9、15、20 级从灵能列表学习一个灵能专长。', level: 5 },
      { id: 'soul_insight', name: '魂灵洞悉', description: '附赠动作，选择 60 尺内一生物；若其有灵魂则获知其具体位置（真实视觉），遮蔽也可察觉。效果持续至你下一回合开始。短休后可再次使用。', level: 6 },
      { id: 'read_soul', name: '阅读灵魂', description: '观察一生物 10 分钟以上后，可看出其灵魂构造、特性与味道（他人会注意到你眼珠扩散呆滞）。可选得知两项：某一基础属性、CR 等级、总生命值、灵魂真名。', level: 8 },
    ],
  },
  // 繁星特色 · 基础职业
  火铳手: {
    hitDice: 10,
    spellcasting: null,
    saveProficiencies: ['dex', 'con'],
    isFanxing: true,
    flavor: '远程精确杀手，以火器为核心的爆发输出职业。熟练轻甲、简易武器、火器；工具为火器匠工具。',
    features: [
      { id: 'firearm_expertise', name: '火器专精', description: '获得火器熟练；装填时不会引发借机攻击。', level: 1 },
      { id: 'steady_shot', name: '维稳射击', description: '若该回合未移动，本回合第一次火器攻击获得优势。', level: 1 },
      { id: 'focus_points', name: '专注点', description: '专注点每 2 级获得 1 点（2 级 2 点起），战斗短休回复。可消耗：1 点 聚精会神(2 级) 攻击=10+职业等级+敏捷+熟练不掷骰；1 点 快速装填(2 级) 装填变反应/全回合变标准/标准变附赠；1 点 锁定弱点(3 级) 命中可视为暴击；1 点 预判(3 级 战场先知) 先攻优势；1 点 骑枪齐射(3 级 库罗骑士) 骑乘时马匹移动不失去维稳优势；1 点 死不旋踵(3 级 敢死先锋) 反应 10 尺内火器攻击；1 点 精准射击(6 级) 命中后目标体质豁免伤害减半否则倒地；4 点 突袭射击(13 级) 优势下火器攻击额外 2d6 武器伤害，暴击倍率翻倍，每回合一次。', level: 2 },
      { id: 'predictive_shot', name: '预判射击', description: '攻击时可将熟练加值加到攻击骰或伤害骰上。', level: 2 },
      { id: 'gunslinger_archetype', name: '子职业', description: '选择：战场先知（隐匿/察觉专精，7 级猎手直觉每回合一次免费察觉，14 级幽影身法攻击后隐匿未发现则维稳仍有效）、库罗骑士（3 级骑枪机动用自己移动换坐骑移动，7 级骑士守护反应转移伤害/坐骑豁免优势且不恐惧魅惑，14 级战场统御攻击时坐骑移动 15 尺/骑乘不引发对坐骑借机）、敢死先锋（3 级血肉堡垒每级+3 HP 恐惧豁免优势，7 级铁血坚守 HP 半以下感知智力魅力豁免优势，14 级死不旋踵 1 专注点改为降至 1 HP，短休一次）。', level: 3 },
      { id: 'asi_gunslinger', name: '属性值提升', description: '第 4、8、12、16、19 级可获得属性提升或专长。', level: 4 },
      { id: 'extra_attack_gunslinger', name: '额外攻击', description: '执行攻击动作时可攻击两次（5 级）；11 级可攻击三次。', level: 5 },
      { id: 'full_focus', name: '全神贯注', description: '短休前可重新获得所有专注点。6 级 1 次/天，12 级 2 次/天，18 级 3 次/天。', level: 6 },
      { id: 'disrupting_shot', name: '干扰射击', description: '火器攻击命中时可不造成伤害，改为迫使目标消耗反应进行一次移动，移动距离为该生物一半速度、最多 30 尺。', level: 7 },
      { id: 'deadly_focus', name: '致命专注', description: '火器攻击时暴击骰 -1（9 级）。17 级必杀手：暴击骰 -2。', level: 9 },
      { id: 'precise_shot', name: '精准射击', description: '消耗 1 点专注点（6 级起）：命中后目标体质豁免伤害减半，失败则倒地。', level: 13 },
      { id: 'barrage_fire', name: '弹雨火力', description: '每回合可进行一次额外火器攻击，伤害减半。', level: 13 },
      { id: 'unwavering_precision', name: '不屈精准', description: '15 级获得，详见模组。', level: 15 },
      { id: 'headshot', name: '爆头', description: '远程武器对生物造成重击时，可选择爆头：若其生命值不高于 100 则死亡；否则额外受到 10d10 伤害（武器伤害类型）。使用后直至短休或长休无法再次使用。', level: 20 },
    ],
  },
  // 繁星特色 · 基础职业
  器魂术士: {
    hitDice: 6,
    spellcasting: { type: 'full', ability: 'int' },
    saveProficiencies: ['int', 'wis'],
    isFanxing: true,
    flavor: '以晶石石板为法器，学习并准备法术；擅长制造与拆解魔法物品，使用制造经验与学院材料。熟练轻甲、简易武器；工具为盗贼工具、工匠工具、木匠工具。',
    features: [
      { id: 'spellcasting_artificer', name: '施法', description: '晶石石板为施法法器，默认已知戏法。见到卷轴或带环位魔法的魔法物品时可学习并记录到石板，奥秘鉴定 DC=20+环位，失败则升级前无法记录该法术。石板除戏法外有 20 个法术空位，满后可删旧录新。记录法术如法师般准备。1 级选 4 个 1 环法术入石板，之后每级可新记录 1 个。法表：法师法表 + 额外法术（1～5 环见模组）。', level: 1 },
      { id: 'craft_reserve', name: '制造经验', description: '制造经验点数可代替经验值用于制造魔法物品。升级时更新制造经验，不累加；升级前未使用的点数消失。制造时可用制造经验补充经验消耗，亦可与角色经验同时使用。', level: 1 },
      { id: 'college_materials', name: '学院材料', description: '制作非药水、非卷轴的魔法物品时，成本中的金币可以 1 磅晶石等价 2500 金币进行加工。', level: 1 },
      { id: 'artificer_knowledge', name: '物品知识', description: '物品知识检定加值 = 器魂术士等级 + 智力调整值。持续研究物品 1 分钟后进行检定（DC 15）可判断是否散发魔法灵光，无法辨识具体作用。不能取 10 或取 20，且无法对同一物品重复辨识。', level: 1 },
      { id: 'item_creation', name: '物品制造', description: '即使不符合法术前提也可制造魔法物品。须进行使用魔法装置检定（DC 20+施法者等级）模拟每道前提法术。失败可次日重试，直至制造期限；期限届满可做最后一次检定，仍失败则制造失败，时间、金钱与经验不退还。', level: 1 },
      { id: 'scribe_scroll', name: '抄录卷轴', description: '可抄录卷轴，详见制造规则。', level: 1 },
      { id: 'disarm_trap', name: '解除陷阱', description: '可解除陷阱，详见模组。', level: 1 },
      { id: 'craft_wand', name: '制造魔杖', description: '获得制造魔杖能力，详见制造规则。', level: 2 },
      { id: 'craft_wondrous', name: '制造奇物', description: '获得制造奇物能力，详见制造规则。', level: 3 },
      { id: 'asi_artificer', name: '额外专长', description: '第 4、8、12、16、20 级可获得额外专长。', level: 4 },
      { id: 'craft_magic_arms', name: '制造魔法武器及防具', description: '获得制造魔法武器与防具能力，详见制造规则。', level: 5 },
      { id: 'retain_essence', name: '拆解萃取', description: '可从魔法物品中抽取制造经验：花费 1 天拆解，需相应制造专长；成功则物品消失、获得制造经验，升级前未用完的拆解所得同样消失。晶石打造物品可退回晶石，磅数 = (经验值/20)*0.1，保留一位小数。', level: 5 },
      { id: 'metamagic_spell_trigger', name: '超魔即发型魔法物品', description: '可配合超魔专长使用即发型魔法物品（如魔杖），需掌握相应专长。消耗的额外使用次数 = 超魔所需提升的法术环位（如瞬发 4 次、强效 3 次、默发 2 次）。无法用于无使用次数的物品（如祈祷念珠）。', level: 7 },
      { id: 'craft_armor', name: '制作盔甲', description: '获得制作盔甲相关能力，详见制造规则。', level: 9 },
      { id: 'metamagic_spell_completion', name: '超魔储备型魔法物品', description: '可配合超魔专长使用储备型魔法物品（如卷轴）。每日使用次数 = 3 + 智力调整值。', level: 11 },
      { id: 'craft_ring', name: '制造戒指', description: '获得制造戒指能力，详见制造规则。', level: 14 },
    ],
  },
  // 繁星特色 · 进阶职业
  圣魂之刃: {
    hitDice: 10,
    spellcasting: { type: 'half', ability: null },
    saveProficiencies: ['str', 'wis'],
    isFanxing: true,
    requirements: '阵营：任意非邪恶。必须掌握引导神力。必须成为现能者。基础等级：6 级或以上。',
    flavor: '信仰神圣与誓言的侍者在听不见神谕后，从与自我对话中感应到灵魂之力，将灵能凝成发光的半固态心灵能量剑「念刃(mindblade)」。形态与颜色因人而异，代替心中信仰成为践行理想的利刃。',
    features: [
      { id: 'soul_blade_spellcasting', name: '施法', description: '继承进阶前等级最高的施法职业法表；每 2 级提升一次施法者等级（及已知法术）。计算引导神力次数时可加上圣魂之刃等级。', level: 1 },
      { id: 'mindblade', name: '念刃', description: '随时创造由灵能构成的半固体念刃，持续 10 分钟。词条：轻型、迅击、视为精通武器。如适合体型的短剑，可用力量或施法属性做攻击与伤害检定，魔法武器，造成圣光伤害。受武器增强魔法/灵能影响；随总等级增强：4 级 +1、8 级 +2、12 级 +3、16 级 +4、20 级 +5。反魔法/灵能立场中需 DC15 感知或魅力豁免通过则可在等于职业等级轮数内维持，否则念刃消失；未通过时可在回合内以移动动作意志豁免重塑。', level: 1 },
      { id: 'psychic_smite', name: '灵能重击', description: '消耗一次引导神力，将灵能与神力灌注念刃；用念刃命中造成额外 3d8 心灵伤害。放弃或念刃消失后，下次创造时仍储有该能量。', level: 1 },
      { id: 'instant_materialize', name: '即时物化', description: '以自由动作（非移动动作）创造念刃；每回合只能尝试创造念刃一次。', level: 2 },
      { id: 'asi_soulblade', name: '属性值提升', description: '第 4、第 8 级可选择一项属性 +2 或两项各 +1（不超过 20），或选一个专长。', level: 4 },
      { id: 'mindblade_shaping', name: '念刃塑形', description: '长休可改选形态。1) 双拳刃：2d4，轻型迅击，双持客+双持战斗；攻击动作中一次可跳至 60 尺内生物背后攻击，该回合攻击优势；与战士双打不叠加。2) 念盾：2d6，擦略 20/60，视为近战，增强值等于 AC 加值；盾牌大师；攻击动作投掷盾牌命中后弹射 10 尺内生物 2d6，每次命中递减 -5。3) 双手巨刃：2d10 横扫，巨武器大师，仅双手，重击 ×4；与战士双打不叠加。', level: 4 },
      { id: 'enhanced_mindblade', name: '增强念刃', description: '念刃增强加值可改为下列附魔（原增强值可部分用于附魔，如 +2 可为护身+1 等）。护身 +1：AC+1 并自行对抗针对持有者的近远程攻击。锐锋 +1：精通武器擦伤，已有则翻倍。幸运 +1：每日 1 次重投命中 d20。流血 +2：命中后每回合 2 伤害，可叠至 6。撞击 +2：命中额外 5 伤害。榨心 +2：目标损失相当于该次武器伤害一半的灵能点。爆破 +2：重击额外 3d6。贯穿 +2：贯穿魔法护盾。血光 +2：命中者一回合无法回复生命。吸命 +3：重击伤害转为临时生命。破灵 +3：重击目标承受等级 -1，可叠加，长休恢复 1。狂斩 +3：斩杀后可再攻击一次。', level: 6 },
      { id: 'divine_psychic_bond', name: '神念相同', description: '在继承进阶前引导神力次数与能力基础上，额外增加一次引导神力使用次数；短休恢复。', level: 8 },
      { id: 'mindblade_storm', name: '念刃风暴', description: '消耗一次引导神力，念刃获得最终增强，神力与灵能借念刃轰向四周。拳刃形态·流星乱击：攻击动作，以自身为起点锥形 30 尺内生物敏捷豁免，失败则受 d10+圣魂之刃等级 d6 伤害，每日一次。念盾形态·绝对防御：攻击动作，自身为中心半径 30 尺大型以下敌对生物被弹开并受 8d8 伤害；形成半圆灵能护罩隔绝罩外魔法/物理/灵能直至你下回合结束，每日一次。双手巨刃·破天一击：消耗所有动作蓄力，蓄力间无法被强制移动、所受伤害减半（生命不低于 1），至下一回合先攻第一位前，对身前宽 10 尺长 60 尺生物造成你扣掉血量两倍的伤害，范围内生物敏捷豁免失败再受 15d10+30 伤害。', level: 10 },
    ],
  },
  // 繁星特色 · 进阶职业（蓝御法师 / 雷鸟法师）
  蓝御法师: {
    hitDice: 8,
    spellcasting: { type: 'full', ability: 'int' },
    saveProficiencies: [],
    isFanxing: true,
    requirements: '阵营：任意非邪恶。武术步法：必须已知至少一种步法。法术：能够施展 2 级奥术。属性：体质 15 或以上。基础等级：6 级或以上。',
    features: [
      { id: 'thunderbird_spellcasting', name: '施法', description: '除第1级与第6级外，每级如同提升进阶前的奥术施法职业一样提升施法者等级（及已知法术）。不获得原职业其他能力。若之前有多个奥术施法职业，须选择增加哪个职业的等级。', level: 1 },
      { id: 'arcane_wrath', name: '奥术之怒', description: '可用反应动作耗费一个法术位，使本回合第一次近战武器命中造成额外伤害：每环 1d10（如耗费三环则 3d10）。', level: 1 },
      { id: 'rite_of_waking', name: '觉醒仪式', description: '与玉大师完成十分钟仪式，激发体内元素之力；显现元素特质（闪电蓝/冰冻白/强酸绿/火焰红）与属性气焰。在奥秘检定上获得 +2 加值。', level: 1 },
      { id: 'mystic_phoenix_stance', name: '秘凤步法', description: '附赠动作启动或关闭。启动后回合结束起 AC 获得 +2 闪避加值。启动时可选择花费一个环位，获得伤害减免 = 2×该环位。', level: 2 },
      { id: 'asi_thunderbird', name: '属性值提升', description: '第 4、第 8 级可选择一项属性 +2 或两项属性各 +1，不可超过 20。', level: 4 },
      { id: 'empowering_strike', name: '强效打击', description: '近战武器命中敌人后，在你下一回合结束前施展的一个奥术强效（伤害 1.5 倍）。每短休一次。', level: 4 },
      { id: 'firebird_stance', name: '雷鸟步法', description: '附赠动作启动/取消或切换。激活时吸收 10 点雷电伤害；施展雷电法术时视为提升三环。启动时可花费环位：对 10 尺内生物造成每环 1d6 伤害（敏豁减半，DC 12+施法关键属性调整），半闪电半无属性；灵光持续 1 分钟。', level: 6 },
      { id: 'jade_phoenix_master', name: '大师之资', description: '获得玉大师资格，可替合适候选人进行觉醒仪式。可冥想一分钟感知最近玉法师/大师/候选者的方向与距离。', level: 6 },
      { id: 'quickening_strike', name: '瞬发打击', description: '近战武器命中后，可用附赠动作在本回合施展一个 5 环或以下的法术。每短休一次。', level: 8 },
      { id: 'emerald_immolation', name: '翡翠献祭', description: '魔法动作：半径 20 尺绿色火焰 20d6（敏豁减半，DC 19+施法关键属性）；半火焰半无属性。豁免失败异界生物需意志豁免否则被驱逐。你被摧毁，1d6 轮后于原地重生并眩晕一轮，穿戴物品一并重生。相当于 9 环法术。', level: 10 },
    ],
  },
  // 繁星特色 · 进阶职业（《韵跃卷谱》）
  奥音实验者: {
    hitDice: 6,
    spellcasting: null,
    saveProficiencies: [],
    isFanxing: true,
    requirements: '法术施放：能施展至少 2 级法术。须能释放魔嘴术、次级幻影，且能释放八门法术学派各一种魔法。熟练晶石类魔法物品。',
    flavor: '精通晶石魔法物品者，在研究中发现以魔法激活晶石时的灵光声响，反复灌输后归纳出发音规律，自称硬核音乐先锋，世人称奥音实验者。除用晶石释放奇异声响外，亦以魔嘴术、次级幻影重复固定声音产生类音乐效果。',
    features: [
      { id: 'eerie_echo', name: '诡异回响', description: '将奥术能量转化为诡异音波，使用晶石魔法物品时视为乐器。标准动作在 30 尺处释放非魔法音效，范围 10 尺直径，消耗 0.1 磅晶石抛投；区域内生物感知豁免（DC=10+智力修正），失败者受「震慑」式效果，区域内生物感知或体质豁免劣势。需维持专注且看得见晶石；主动作或附赠动作维持，每回合可选一次触发带「回响：」的附加效果（仅能选一个区域触发），继续消耗 0.1 磅晶石。晶石耗尽需重抛。范围随等级：3 级 15 尺、5 级 20 尺、7 级 25 尺、9 级 30 尺。5 级可多一个区域、10 级再多一个，每多一区域需消耗一环位。专注中断则所有区域结束。', level: 1 },
      { id: 'echo_resonance', name: '回响：震荡', description: '在诡异回响区域内消耗一环位释放震荡波，体质豁免（DC=10+智力修正+职业等级）失败 2d6 雷鸣伤害，成功减半。伤害与范围随职业等级提升；3 级起每级 +1d6。', level: 2 },
      { id: 'echo_phantasmal', name: '回响：虚幻音波', description: '在诡异回响区域内制造虚假音波干扰，目标感知豁免（DC=10+智力修正+职业等级），失败则区域内生物豁免与攻击掷骰受 1d6 惩罚，直至你下一回合开始。', level: 3 },
      { id: 'melody_rhythm', name: '旋律韵律', description: '将奥术能量与情感波动结合。在诡异回响区域内施放「魅惑」或「恐惧」类法术时，目标更易被操控，该法术 DC+2。', level: 4 },
      { id: 'audio_negation', name: '音频消除', description: '诡异回响区域内无人能发出自己的声音，被奥术震动淹没；区域内视为沉默术效果，此效果不作用于你。', level: 5 },
      { id: 'echo_sound_warp', name: '回响：音场扭曲', description: '在诡异回响区域内消耗一环位，区域内所有目标体质豁免（DC=10+智力修正+职业等级），失败者看到并听到令人反胃的声调，下一回合内只能选择移动动作或附赠+主动作（不影响反应），持续至你回合开始前。', level: 6 },
      { id: 'echo_resonant_vibe', name: '回响：共鸣震动', description: '消耗一环位启动。燃烧之曲：区域内生物获得 15 点抗火；副歌时区域内生物敏捷豁免（DC=10+智力修正+职业等级）失败受 6d6 火焰伤害。毁灭之歌：区域内构装生物受每职业等级 1d8 伤害（无豁免）。霜之挽歌：区域内生物获得 15 点抗寒；副歌时体质检定（DC=10+智力修正+职业等级）失败受 10d6 寒冷伤害。', level: 7 },
      { id: 'echo_rebirth', name: '回响：重生', description: '消耗 1 个 3 环以上法术位启动。诡异回响区域内缓和音波进行治疗或恢复，可恢复 5d8+智力修正的生命值。', level: 8 },
      { id: 'echo_stun_mind', name: '回响：震慑心灵', description: '在诡异回响区域内释放灵魂震动，区域内生物体质豁免，失败则被震慑。消耗 1 个 6 环法术位启动。', level: 9 },
      { id: 'mind_resonance', name: '心灵共振', description: '诡异回响区域内选择一名生物，感知检定（DC=10+智力修正+职业等级）；若在区内你可操控其移动与一次攻击动作，控制效果持续至其下一回合开始；离开区域后受 8d8+40 心灵伤害。使用后长休才能再次使用。', level: 10 },
    ],
  },
  // 繁星特色 · 进阶职业
  斯兰亲卫: {
    hitDice: 10,
    spellcasting: null,
    saveProficiencies: [],
    isFanxing: true,
    requirements: '12 级人物。非牧师职业。熟练火器。',
    flavor: '为斯兰帝国效力的精锐近卫，以无惧与传奇名望著称，擅长护卫同伴、顺势斩与指挥官光环。',
    features: [
      { id: 'swift_adjust', name: '迅捷调整', description: '每轮一次，可以一个自由动作进行重整（切换手上装备或武器）。', level: 1 },
      { id: 'fearless', name: '无惧', description: '因对自身能力与斯兰帝国的信心，不为他人决定所惧。成为此职业时免疫恐惧。', level: 1 },
      { id: 'indomitable', name: '不屈', description: '同战士职业的不屈能力。1 级时每日 2 次，5 级时 3 次。', level: 1 },
      { id: 'cleave', name: '顺势斩', description: '当你击杀一名生物时，可将此次攻击检定顺延至被击杀单位 5 尺内、你触及内的另一名敌对生物；攻击检定沿用之前结果，伤害重新计算。', level: 1 },
      { id: 'guardian', name: '护卫', description: '每轮开始时，若 5 尺内有一名生命骰数少于你的同伴，可将 2 点 AC 转移给该同伴（你的 AC 降低同值）。护卫等级每提升一次，可转移 AC+1（2 级时 +2，3 级时 +3，4 级时 +4）。', level: 1 },
      { id: 'legendary_renown', name: '传奇名望', description: '名声远播，功绩被传颂。当人们认出你时对你更友好。可将职业等级加到改善非敌对、非不友好 NPC 态度的交涉检定上。', level: 1 },
      { id: 'asi_silan', name: '属性值提升', description: '第 2 级获得属性提升或专长。', level: 2 },
      { id: 'strive_hard', name: '奋尽全力', description: '进行任意技能检定时获得加值，每日一次，须在检定前宣布使用。2 级 +2，4 级 +3，6 级 +4，8 级 +5。', level: 2 },
      { id: 'gifted_commander', name: '天赋指挥官', description: '获得指挥官光环，短休时可切换所准备的光环效果。光环影响 30 尺内盟友：1.移动—回合开始在你 30 尺内的盟友移动速度 +5 尺士气。2.双击—30 尺内盟友近战自然 20 时可立刻再进行一次同武器近战攻击。3.机动—回合内移动至少 10 尺则该回合下一次近战攻击 +2 士气。4.保护—对惊惧或恐慌敌人造成额外 1d6 伤害（士气加值）。5.投法—30 尺内盟友范围伤害法术额外 1d6 伤害（士气加值）。6.威压—士气检定 +5 士气加值，但士气检定失败则立刻恐慌。', level: 3 },
      { id: 'greater_cleave', name: '至高顺势斩', description: '执行顺势斩时可以马上移动 5 尺。', level: 3 },
      { id: 'iron_will', name: '钢铁意志', description: '感知豁免检定 +2。', level: 3 },
      { id: 'mighty_cleave', name: '强势顺势斩', description: '顺势斩强化，详见模组。', level: 6 },
      { id: 'judgment_strike', name: '审判一击', description: '当一名同伴陷入无助或失去意识时，可对击倒该盟友的生物进行一次审判一击。攻击检定加上魅力调整值（若为正）；命中时额外造成 2d8 立场伤害。每日使用次数 = 魅力调整值（至少 1），每轮最多 1 次；可对同一敌人多次使用。', level: 7 },
      { id: 'action_surge', name: '动作如潮', description: '同战士。5 级时获得，可用 2 次。', level: 5 },
      { id: 'extra_attack_silan', name: '额外攻击', description: '同战士。8 级时执行攻击动作可攻击 3 次。', level: 8 },
    ],
  },
}

/** 子职与三分之一施法（仅影响施法等级，不单独建完整职业条） */
const SUBCLASS_SPELLCASTING = {
  战士: { 奥法骑士: 'third' },
  游荡者: { 诡术师: 'third' },
}

/** 所有职业名（含繁星进阶），用于下拉等 */
export const CLASS_LIST = Object.keys(CLASS_DATA)
export const ALL_CLASS_NAMES = CLASS_LIST

/** 职业别名（雷鸟法师即蓝御法师） */
const CLASS_ALIASES = { 雷鸟法师: '蓝御法师', 魂灵术士: '魂灵学者' }

export function getClassData(className) {
  const key = CLASS_ALIASES[className] ?? className
  return CLASS_DATA[key] ?? null
}

/** 是否为繁星特色职业（基础或进阶） */
export function isFanxingClass(className) {
  return getClassData(className)?.isFanxing === true
}

/** 职业生命骰（与 formulas 统一入口，可被 formulas 引用） */
export function getHitDice(className) {
  const data = getClassData(className)
  return data?.hitDice ?? 8
}

/** 导出为名→骰面，供 formulas.calcMaxHP 使用 */
export const CLASS_HIT_DICE = Object.fromEntries(
  Object.entries(CLASS_DATA).map(([name, d]) => [name, d.hitDice])
)

/**
 * 收集角色所有职业等级（主职 + 兼职 + 进阶）
 */
export function getCharacterClasses(character) {
  const out = []
  const main = character?.['class']
  const mainLevel = Math.max(0, Math.min(20, Number(character?.classLevel) ?? 0))
  if (main && mainLevel > 0) out.push({ name: main, level: mainLevel, subclass: character?.subclass?.trim() || null })
  const multiclass = character?.multiclass ?? []
  multiclass.forEach((m) => {
    const name = m?.['class']
    const level = Math.max(0, Math.min(20, Number(m?.level) ?? 0))
    if (name && level > 0) out.push({ name, level, subclass: m?.subclass?.trim() || null })
  })
  const prestige = character?.prestige ?? []
  prestige.forEach((p) => {
    const name = p?.['class']
    const level = Math.max(0, Math.min(20, Number(p?.level) ?? 0))
    if (name && level > 0) out.push({ name, level, subclass: null })
  })
  return out
}

/**
 * 计算施法等级（用于法术位表）
 * 规则：全施法=等级，半施法=floor(等级/2)，三分之一=floor(等级/3)；契约(邪术师)不加入此值。
 */
export function getSpellcastingLevel(character) {
  const classes = getCharacterClasses(character)
  let level = 0
  for (const { name, level: lv, subclass } of classes) {
    const data = getClassData(name)
    if (!data?.spellcasting) {
      const subSpell = subclass && SUBCLASS_SPELLCASTING[name]?.[subclass]
      if (subSpell === 'third') level += Math.floor(lv / 3)
      continue
    }
    switch (data.spellcasting.type) {
      case 'full':
        level += lv
        break
      case 'half':
        level += Math.floor(lv / 2)
        break
      case 'third':
        level += Math.floor(lv / 3)
        break
      case 'pact':
        break
      default:
        break
    }
  }
  return Math.min(20, level)
}

/**
 * 契约等级（仅邪术师等级之和），用于契约法术位
 */
export function getPactLevel(character) {
  const classes = getCharacterClasses(character)
  return classes
    .filter((c) => (getClassData(c.name)?.spellcasting?.type) === 'pact')
    .reduce((s, c) => s + c.level, 0)
}

/**
 * 主施法属性（取第一个有施法的职业，含契约）
 */
export function getPrimarySpellcastingAbility(character) {
  const classes = getCharacterClasses(character)
  for (const { name } of classes) {
    const data = getClassData(name)
    const ability = data?.spellcasting?.ability
    if (ability) return ability
  }
  return null
}

/**
 * 按角色职业与等级，汇总可用的职业特性（来自数据库，供角色卡勾选展示）
 */
export function getAvailableFeatures(character) {
  const classes = getCharacterClasses(character)
  const list = []
  for (const { name, level, subclass } of classes) {
    const data = getClassData(name)
    if (data?.features) {
      for (const f of data.features) {
        if (f.level > level) continue
        if (f.subclass && f.subclass !== subclass) continue
        list.push({
          ...f,
          sourceClass: name,
          sourceSubclass: f.subclass || null,
        })
      }
    }
    if (data?.subclasses?.[subclass]?.features) {
      for (const f of data.subclasses[subclass].features) {
        if (f.level > level) continue
        list.push({
          ...f,
          sourceClass: name,
          sourceSubclass: subclass,
        })
      }
    }
  }
  return list
}

/**
 * 根据角色已选特性 ID 与职业，解析出完整特性信息（用于展示）
 */
export function resolveSelectedFeatures(character) {
  const selected = character?.selectedClassFeatures ?? []
  if (!Array.isArray(selected) || selected.length === 0) return []
  const available = getAvailableFeatures(character)
  const byId = new Map()
  available.forEach((f) => {
    const key = f.sourceSubclass ? `${f.sourceClass}:${f.sourceSubclass}:${f.id}` : `${f.sourceClass}:${f.id}`
    byId.set(key, f)
  })
  return selected
    .map((key) => {
      const f = byId.get(key)
      return f ? { ...f, selectedKey: key } : null
    })
    .filter(Boolean)
}
