import type { AppLocale } from '../locale'

export const SCIENCE_BODY_IDS = [
  'asteria',
  'cinder',
  'cinder-scoria',
  'aurelia',
  'aurelia-cyra',
  'pelagos',
  'pelagos-tethra',
  'pelagos-neris',
  'viridia',
  'viridia-luma',
  'orison',
  'orison-ember',
  'orison-ione',
  'orison-lyric',
  'orison-kestrel',
  'orison-morrow',
  'caelora',
  'caelora-mistral',
  'caelora-serein',
  'caelora-pale',
  'caelora-vanta',
  'erebus',
  'erebus-rime',
  'erebus-noctis',
  'nyx',
  'nyx-wisp',
  'nyx-shade',
] as const

export type ScienceBodyId = (typeof SCIENCE_BODY_IDS)[number]

export interface ScienceNarrative {
  readonly description: string
  readonly facts: readonly string[]
}

export type ScienceNarrativeMap = Readonly<
  Record<ScienceBodyId, ScienceNarrative>
>

const en = {
  asteria: {
    description: 'A synthetic G1 V analogue used as the deterministic system primary.',
    facts: [
      'Its radius, temperature and luminosity are mutually consistent to model precision.',
      'Asteria is fictional and must not be presented as an observed star.',
    ],
  },
  cinder: {
    description: 'A synthetic iron-rich lava planet crossed by incandescent volcanic basins.',
    facts: [
      'Its eccentric orbit drives a large seasonal change in received flux.',
      'The tenuous carbon atmosphere cannot efficiently redistribute dayside heat.',
      "A compact volcanic moon, Scoria, remains well inside Cinder's prograde stability limit.",
    ],
  },
  'cinder-scoria': {
    description: 'A synthetic scorched volcanic moon with dark silicate plains.',
    facts: [
      'Weak tidal flexing sustains isolated volcanic centers in the synthetic model.',
    ],
  },
  aurelia: {
    description: 'A synthetic warm terrestrial planet with salt deserts and dense amber skies.',
    facts: [
      'High surface pressure stabilizes transient polar brines.',
      'Its single moon is massive enough to moderate long-term obliquity changes.',
    ],
  },
  'aurelia-cyra': {
    description: 'A synthetic, synchronously rotating silicate moon.',
    facts: [
      'A broad far-side basin records the system’s early bombardment.',
    ],
  },
  pelagos: {
    description: 'A synthetic temperate ocean planet with volcanic archipelagos and active plates.',
    facts: [
      'The climate model places Pelagos inside Asteria’s conservative habitable zone.',
      'No biosignature is claimed; all environmental values are generated for simulation.',
    ],
  },
  'pelagos-tethra': {
    description: 'A compact synthetic inner moon shaped by weak tidal heating.',
    facts: [
      'Tethra clears a narrow lane through Pelagos’s faint dust torus.',
    ],
  },
  'pelagos-neris': {
    description: 'A synthetic ice-shelled moon with a modeled subsurface ocean.',
    facts: [
      'Weak tidal flexing can maintain liquid water beneath the ice shell.',
      'Subsurface water is a model inference, not an observation or life claim.',
    ],
  },
  viridia: {
    description: 'A synthetic cool super-Earth with shallow seas and basaltic green continents.',
    facts: [
      'Viridia sits in the outer half of the conservative habitable zone.',
      'Its higher gravity produces a compact but comparatively dense atmosphere.',
    ],
  },
  'viridia-luma': {
    description: 'A synthetic volatile-rich moon with bright young ray systems.',
    facts: ['Luma is synchronously locked to Viridia.'],
  },
  orison: {
    description: 'A synthetic banded gas giant encircled by a broad silicate-and-ice ring system.',
    facts: [
      'The quoted radius, pressure and temperature refer to the one-bar level, not a solid surface.',
      'Five major moons occupy a stable resonant architecture in this simplified model.',
    ],
  },
  'orison-ember': {
    description: 'A synthetic resonantly heated volcanic moon with sulfur-rich plains.',
    facts: [
      'Localized volcanic vents greatly exceed the listed global mean temperature.',
    ],
  },
  'orison-ione': {
    description: 'A synthetic bright ice moon cut by young tectonic scarps.',
    facts: [
      'A deep internal ocean is thermally plausible in the synthetic model.',
    ],
  },
  'orison-lyric': {
    description: 'A synthetic differentiated ice moon with modeled briny layers.',
    facts: ['Its induced-field signature is simulated, not measured.'],
  },
  'orison-kestrel': {
    description: 'A synthetic dark rocky moon with a heavily cratered surface.',
    facts: ['Kestrel shepherds the diffuse outer E ring.'],
  },
  'orison-morrow': {
    description: 'A synthetic outer moon marked by a giant ancient impact basin.',
    facts: ['Morrow is the outermost regular major moon in the model.'],
  },
  caelora: {
    description: 'A synthetic cyan Neptunian planet rotating nearly on its side beneath methane haze.',
    facts: [
      'Its extreme obliquity produces decades-long synthetic seasons.',
      'The quoted climate values refer to the one-bar atmospheric level.',
    ],
  },
  'caelora-mistral': {
    description: 'A synthetic icy shepherd moon at the edge of Caelora’s rings.',
    facts: ['Its resonances maintain the ring system’s sharp outer edge.'],
  },
  'caelora-serein': {
    description: 'A synthetic ice moon with smooth resurfaced plains.',
    facts: [
      'Sparse crater counts imply recent cryovolcanic resurfacing in the model.',
    ],
  },
  'caelora-pale': {
    description: 'A synthetic captured moon on an inclined, mildly eccentric orbit.',
    facts: ['Pale likely formed elsewhere in the generated system.'],
  },
  'caelora-vanta': {
    description: 'A synthetic dark outer irregular moon.',
    facts: [
      'Vanta’s orbit is the most inclined among Caelora’s modeled moons.',
    ],
  },
  erebus: {
    description: 'A synthetic compact ice giant with a deep indigo hydrogen-methane atmosphere.',
    facts: [
      'Erebus radiates modest residual formation heat.',
      'Its narrow charcoal rings are optically thin in the synthetic model.',
    ],
  },
  'erebus-rime': {
    description: 'A synthetic bright inner ice moon.',
    facts: ['Rime exchanges dust with Erebus’s narrow rings.'],
  },
  'erebus-noctis': {
    description: 'A synthetic, dark silicate-rich outer moon.',
    facts: [
      'Noctis may be a captured remnant of an early planetesimal disk.',
    ],
  },
  nyx: {
    description: 'A synthetic remote Neptunian planet with violet haze and a faint dusty ring.',
    facts: [
      'Nyx completes one orbit in roughly one and a half Earth centuries.',
      'The one-bar atmosphere is modeled as hydrogen, helium and methane.',
    ],
  },
  'nyx-wisp': {
    description: 'A synthetic small ice moon embedded near Nyx’s dust ring.',
    facts: [
      'Wisp supplies fine particles to the ring through micrometeoroid impacts.',
    ],
  },
  'nyx-shade': {
    description: 'A synthetic oversized outer companion synchronously locked to Nyx.',
    facts: ['Shade and Nyx orbit a barycenter that remains inside Nyx.'],
  },
} as const satisfies ScienceNarrativeMap

const es = {
  asteria: {
    description: 'Un análogo sintético de tipo G1 V utilizado como estrella primaria determinista del sistema.',
    facts: [
      'Su radio, temperatura y luminosidad son coherentes entre sí dentro de la precisión del modelo.',
      'Asteria es ficticia y no debe presentarse como una estrella observada.',
    ],
  },
  cinder: {
    description: 'Un planeta de lava sintético, rico en hierro y surcado por cuencas volcánicas incandescentes.',
    facts: [
      'Su órbita excéntrica provoca una gran variación estacional del flujo recibido.',
      'La tenue atmósfera de carbono no puede redistribuir eficazmente el calor del hemisferio diurno.',
      'Scoria, una luna volcánica compacta, permanece muy dentro del límite de estabilidad prógrada de Cinder.',
    ],
  },
  'cinder-scoria': {
    description: 'Una luna volcánica sintética y abrasada, con oscuras llanuras de silicatos.',
    facts: [
      'Una débil flexión mareal mantiene centros volcánicos aislados en el modelo sintético.',
    ],
  },
  aurelia: {
    description: 'Un planeta terrestre sintético y cálido, con desiertos salinos y densos cielos ámbar.',
    facts: [
      'La elevada presión superficial estabiliza salmueras polares transitorias.',
      'Su única luna tiene masa suficiente para moderar los cambios de oblicuidad a largo plazo.',
    ],
  },
  'aurelia-cyra': {
    description: 'Una luna sintética de silicatos con rotación síncrona.',
    facts: [
      'Una amplia cuenca en la cara oculta conserva el registro del bombardeo temprano del sistema.',
    ],
  },
  pelagos: {
    description: 'Un planeta oceánico sintético y templado, con archipiélagos volcánicos y placas activas.',
    facts: [
      'El modelo climático sitúa a Pelagos dentro de la zona habitable conservadora de Asteria.',
      'No se afirma la existencia de biofirmas; todos los valores ambientales se generan para la simulación.',
    ],
  },
  'pelagos-tethra': {
    description: 'Una luna interior sintética y compacta, modelada por un débil calentamiento mareal.',
    facts: [
      'Tethra abre una franja estrecha en el tenue toro de polvo de Pelagos.',
    ],
  },
  'pelagos-neris': {
    description: 'Una luna sintética cubierta de hielo, con un océano subsuperficial modelado.',
    facts: [
      'Una débil flexión mareal puede mantener agua líquida bajo la corteza de hielo.',
      'El agua subsuperficial es una inferencia del modelo, no una observación ni una afirmación de vida.',
    ],
  },
  viridia: {
    description: 'Una supertierra sintética y fría, con mares someros y continentes basálticos verdes.',
    facts: [
      'Viridia se encuentra en la mitad exterior de la zona habitable conservadora.',
      'Su mayor gravedad produce una atmósfera compacta pero comparativamente densa.',
    ],
  },
  'viridia-luma': {
    description: 'Una luna sintética rica en volátiles, con sistemas de rayos jóvenes y brillantes.',
    facts: ['Luma está anclada por marea a Viridia.'],
  },
  orison: {
    description: 'Un gigante gaseoso sintético de bandas, rodeado por un amplio sistema de anillos de silicatos y hielo.',
    facts: [
      'El radio, la presión y la temperatura indicados corresponden al nivel de un bar, no a una superficie sólida.',
      'Cinco lunas principales ocupan una arquitectura resonante estable en este modelo simplificado.',
    ],
  },
  'orison-ember': {
    description: 'Una luna volcánica sintética calentada por resonancia, con llanuras ricas en azufre.',
    facts: [
      'Los respiraderos volcánicos localizados superan ampliamente la temperatura media global indicada.',
    ],
  },
  'orison-ione': {
    description: 'Una luna de hielo sintética y brillante, surcada por escarpes tectónicos jóvenes.',
    facts: [
      'Un océano interno profundo es térmicamente plausible en el modelo sintético.',
    ],
  },
  'orison-lyric': {
    description: 'Una luna de hielo sintética y diferenciada, con capas de salmuera modeladas.',
    facts: ['Su señal de campo inducido es simulada, no medida.'],
  },
  'orison-kestrel': {
    description: 'Una luna rocosa sintética y oscura, con una superficie densamente craterizada.',
    facts: ['Kestrel pastorea el difuso anillo E exterior.'],
  },
  'orison-morrow': {
    description: 'Una luna exterior sintética marcada por una gigantesca y antigua cuenca de impacto.',
    facts: ['Morrow es la luna mayor regular más externa del modelo.'],
  },
  caelora: {
    description: 'Un planeta neptuniano sintético de color cian que gira casi de costado bajo una neblina de metano.',
    facts: [
      'Su oblicuidad extrema produce estaciones sintéticas que duran décadas.',
      'Los valores climáticos indicados corresponden al nivel atmosférico de un bar.',
    ],
  },
  'caelora-mistral': {
    description: 'Una luna pastora sintética y helada situada en el borde de los anillos de Caelora.',
    facts: ['Sus resonancias mantienen definido el abrupto borde exterior del sistema de anillos.'],
  },
  'caelora-serein': {
    description: 'Una luna de hielo sintética con llanuras lisas renovadas.',
    facts: [
      'La escasez de cráteres sugiere un rejuvenecimiento criovolcánico reciente en el modelo.',
    ],
  },
  'caelora-pale': {
    description: 'Una luna capturada sintética en una órbita inclinada y ligeramente excéntrica.',
    facts: ['Pale probablemente se formó en otra región del sistema generado.'],
  },
  'caelora-vanta': {
    description: 'Una luna irregular exterior, sintética y oscura.',
    facts: [
      'La órbita de Vanta es la más inclinada entre las lunas modeladas de Caelora.',
    ],
  },
  erebus: {
    description: 'Un gigante de hielo sintético y compacto, con una atmósfera de hidrógeno y metano de color índigo intenso.',
    facts: [
      'Erebus irradia una modesta cantidad de calor residual de formación.',
      'Sus estrechos anillos color carbón son ópticamente delgados en el modelo sintético.',
    ],
  },
  'erebus-rime': {
    description: 'Una luna de hielo interior, sintética y brillante.',
    facts: ['Rime intercambia polvo con los estrechos anillos de Erebus.'],
  },
  'erebus-noctis': {
    description: 'Una luna exterior sintética, oscura y rica en silicatos.',
    facts: [
      'Noctis podría ser un remanente capturado de un antiguo disco de planetesimales.',
    ],
  },
  nyx: {
    description: 'Un planeta neptuniano sintético y remoto, con neblina violeta y un tenue anillo de polvo.',
    facts: [
      'Nyx completa una órbita en aproximadamente un siglo y medio terrestre.',
      'La atmósfera al nivel de un bar se modela con hidrógeno, helio y metano.',
    ],
  },
  'nyx-wisp': {
    description: 'Una pequeña luna de hielo sintética situada cerca del anillo de polvo de Nyx.',
    facts: [
      'Wisp aporta partículas finas al anillo mediante impactos de micrometeoroides.',
    ],
  },
  'nyx-shade': {
    description: 'Una compañera exterior sintética y sobredimensionada, anclada por marea a Nyx.',
    facts: ['Shade y Nyx orbitan un baricentro que permanece dentro de Nyx.'],
  },
} as const satisfies ScienceNarrativeMap

const zhTW = {
  asteria: {
    description: '一顆作為確定性恆星系主星的合成 G1 V 型類比恆星。',
    facts: [
      '其半徑、溫度與光度在模型精度範圍內彼此一致。',
      'Asteria 是虛構天體，不得將其描述為已觀測恆星。',
    ],
  },
  cinder: {
    description: '一顆富含鐵的合成熔岩行星，表面遍布熾熱的火山盆地。',
    facts: [
      '其偏心軌道使接收的輻射通量產生顯著季節變化。',
      '稀薄的碳質大氣無法有效重新分配晝側熱量。',
      '小型火山衛星 Scoria 始終遠在 Cinder 的順行穩定極限之內。',
    ],
  },
  'cinder-scoria': {
    description: '一顆受高溫炙烤、帶有暗色矽酸鹽平原的合成火山衛星。',
    facts: ['在合成模型中，微弱的潮汐形變維持著孤立的火山中心。'],
  },
  aurelia: {
    description: '一顆溫暖的合成類地行星，擁有鹽漠與濃密的琥珀色天空。',
    facts: [
      '高表面壓力使短暫存在的極地鹵水得以穩定。',
      '其唯一衛星的質量足以緩和長期轉軸傾角變化。',
    ],
  },
  'aurelia-cyra': {
    description: '一顆同步自轉的合成矽酸鹽衛星。',
    facts: ['一座廣闊的背面盆地記錄了該恆星系早期的撞擊轟炸。'],
  },
  pelagos: {
    description: '一顆溫和的合成海洋行星，擁有火山群島與活躍板塊。',
    facts: [
      '氣候模型將 Pelagos 置於 Asteria 的保守宜居帶內。',
      '模型未宣稱存在任何生物特徵；所有環境數值皆為模擬而生成。',
    ],
  },
  'pelagos-tethra': {
    description: '一顆受微弱潮汐加熱塑造的小型合成內側衛星。',
    facts: ['Tethra 在 Pelagos 稀薄的塵埃環中清出一條狹窄空隙。'],
  },
  'pelagos-neris': {
    description: '一顆具有模型化地下海洋、外覆冰殼的合成衛星。',
    facts: [
      '微弱的潮汐形變可使冰殼下方維持液態水。',
      '冰殼下液態水是模型推論，並非觀測結果，也不代表存在生命。',
    ],
  },
  viridia: {
    description: '一顆涼爽的合成超級地球，擁有淺海與綠色玄武岩大陸。',
    facts: [
      'Viridia 位於保守宜居帶的外半部。',
      '較強的重力形成了尺度較緊湊、但相對稠密的大氣。',
    ],
  },
  'viridia-luma': {
    description: '一顆富含揮發物、具有明亮年輕放射紋系統的合成衛星。',
    facts: ['Luma 已與 Viridia 潮汐鎖定。'],
  },
  orison: {
    description: '一顆具有條帶的合成氣態巨行星，周圍環繞寬廣的矽酸鹽與冰質環系。',
    facts: [
      '所列半徑、壓力與溫度皆指一巴等壓面，而非固體表面。',
      '在此簡化模型中，五顆主要衛星構成穩定的共振架構。',
    ],
  },
  'orison-ember': {
    description: '一顆受共振加熱、具有富硫平原的合成火山衛星。',
    facts: ['局部火山噴口的溫度遠高於所列的全球平均溫度。'],
  },
  'orison-ione': {
    description: '一顆明亮的合成冰質衛星，表面由年輕的構造陡崖切割。',
    facts: ['在合成模型中，深層內部海洋在熱力學上是合理的。'],
  },
  'orison-lyric': {
    description: '一顆具有分異結構與模型化鹵水層的合成冰質衛星。',
    facts: ['其感應磁場特徵來自模擬，而非實際測量。'],
  },
  'orison-kestrel': {
    description: '一顆表面密布撞擊坑的暗色合成岩質衛星。',
    facts: ['Kestrel 對稀薄的外側 E 環發揮牧羊作用。'],
  },
  'orison-morrow': {
    description: '一顆帶有巨大古老撞擊盆地的合成外側衛星。',
    facts: ['Morrow 是模型中最外側的規則大型衛星。'],
  },
  caelora: {
    description: '一顆青色的合成海王星型行星，在甲烷霾下幾乎側躺自轉。',
    facts: [
      '極端的轉軸傾角造成長達數十年的合成季節。',
      '所列氣候數值皆指一巴等壓面。',
    ],
  },
  'caelora-mistral': {
    description: '一顆位於 Caelora 環系邊緣的合成冰質牧羊衛星。',
    facts: ['其軌道共振維持著環系陡峭清晰的外緣。'],
  },
  'caelora-serein': {
    description: '一顆具有平滑再造平原的合成冰質衛星。',
    facts: ['稀少的撞擊坑數量暗示模型中近期曾發生冰火山表面再造。'],
  },
  'caelora-pale': {
    description: '一顆被捕獲的合成衛星，運行於傾斜且略帶偏心的軌道。',
    facts: ['Pale 很可能形成於這個生成恆星系的其他區域。'],
  },
  'caelora-vanta': {
    description: '一顆暗色的合成外側不規則衛星。',
    facts: ['在 Caelora 的模型衛星中，Vanta 的軌道傾角最大。'],
  },
  erebus: {
    description: '一顆緊湊型合成冰巨行星，具有深靛色的氫—甲烷大氣。',
    facts: [
      'Erebus 輻射出少量形成時殘留的熱量。',
      '在合成模型中，其狹窄的炭黑色環在光學上相當稀薄。',
    ],
  },
  'erebus-rime': {
    description: '一顆明亮的合成內側冰質衛星。',
    facts: ['Rime 與 Erebus 的狹窄環系交換塵埃。'],
  },
  'erebus-noctis': {
    description: '一顆暗色、富含矽酸鹽的合成外側衛星。',
    facts: ['Noctis 可能是早期微行星盤中被捕獲的殘留天體。'],
  },
  nyx: {
    description: '一顆遙遠的合成海王星型行星，具有紫色霾與稀薄塵埃環。',
    facts: [
      'Nyx 繞行一周約需一個半地球世紀。',
      '一巴等壓面的大氣以氫、氦與甲烷建模。',
    ],
  },
  'nyx-wisp': {
    description: '一顆位於 Nyx 塵埃環附近的小型合成冰質衛星。',
    facts: ['Wisp 藉由微隕石撞擊為環系補充細微粒子。'],
  },
  'nyx-shade': {
    description: '一顆體型偏大的合成外側伴衛星，已與 Nyx 同步鎖定。',
    facts: ['Shade 與 Nyx 繞共同質心運行，而該質心仍位於 Nyx 內部。'],
  },
} as const satisfies ScienceNarrativeMap

const fr = {
  asteria: {
    description: 'Un analogue synthétique de type G1 V servant d’étoile primaire déterministe au système.',
    facts: [
      'Son rayon, sa température et sa luminosité sont mutuellement cohérents à la précision du modèle.',
      'Asteria est fictive et ne doit pas être présentée comme une étoile observée.',
    ],
  },
  cinder: {
    description: 'Une planète de lave synthétique riche en fer, sillonnée de bassins volcaniques incandescents.',
    facts: [
      'Son orbite excentrique entraîne une forte variation saisonnière du flux reçu.',
      'La ténue atmosphère carbonée ne peut pas redistribuer efficacement la chaleur de l’hémisphère diurne.',
      'Scoria, une petite lune volcanique, reste largement à l’intérieur de la limite de stabilité prograde de Cinder.',
    ],
  },
  'cinder-scoria': {
    description: 'Une lune volcanique synthétique brûlée, aux sombres plaines silicatées.',
    facts: [
      'Une faible flexion de marée entretient des centres volcaniques isolés dans le modèle synthétique.',
    ],
  },
  aurelia: {
    description: 'Une planète tellurique synthétique et chaude, aux déserts salins sous un ciel ambré dense.',
    facts: [
      'La forte pression de surface stabilise des saumures polaires transitoires.',
      'Son unique lune est assez massive pour modérer les variations d’obliquité à long terme.',
    ],
  },
  'aurelia-cyra': {
    description: 'Une lune silicatée synthétique en rotation synchrone.',
    facts: [
      'Un vaste bassin sur la face cachée témoigne du bombardement ancien du système.',
    ],
  },
  pelagos: {
    description: 'Une planète-océan synthétique et tempérée, aux archipels volcaniques et aux plaques actives.',
    facts: [
      'Le modèle climatique place Pelagos dans la zone habitable conservatrice d’Asteria.',
      'Aucune biosignature n’est revendiquée ; toutes les valeurs environnementales sont générées pour la simulation.',
    ],
  },
  'pelagos-tethra': {
    description: 'Une petite lune intérieure synthétique façonnée par un faible échauffement de marée.',
    facts: [
      'Tethra ouvre un étroit sillon dans le faible tore de poussière de Pelagos.',
    ],
  },
  'pelagos-neris': {
    description: 'Une lune synthétique gainée de glace, avec un océan souterrain modélisé.',
    facts: [
      'Une faible flexion de marée peut maintenir de l’eau liquide sous la croûte de glace.',
      'Cette eau souterraine est une inférence du modèle, et non une observation ni l’indice d’une vie.',
    ],
  },
  viridia: {
    description: 'Une super-Terre synthétique et fraîche, aux mers peu profondes et aux continents basaltiques verts.',
    facts: [
      'Viridia se situe dans la moitié externe de la zone habitable conservatrice.',
      'Sa gravité plus forte produit une atmosphère compacte mais relativement dense.',
    ],
  },
  'viridia-luma': {
    description: 'Une lune synthétique riche en volatils, aux réseaux de rayons jeunes et brillants.',
    facts: ['Luma est verrouillée par effet de marée à Viridia.'],
  },
  orison: {
    description: 'Une géante gazeuse synthétique à bandes, ceinte d’un vaste système d’anneaux de silicates et de glace.',
    facts: [
      'Le rayon, la pression et la température indiqués correspondent au niveau d’un bar, et non à une surface solide.',
      'Cinq lunes majeures occupent une architecture résonante stable dans ce modèle simplifié.',
    ],
  },
  'orison-ember': {
    description: 'Une lune volcanique synthétique chauffée par résonance, aux plaines riches en soufre.',
    facts: [
      'La température des évents volcaniques localisés dépasse largement la moyenne globale indiquée.',
    ],
  },
  'orison-ione': {
    description: 'Une lune de glace synthétique et brillante, entaillée de jeunes escarpements tectoniques.',
    facts: [
      'Un profond océan interne est thermiquement plausible dans le modèle synthétique.',
    ],
  },
  'orison-lyric': {
    description: 'Une lune de glace synthétique différenciée, dotée de couches de saumure modélisées.',
    facts: ['Sa signature de champ induit est simulée, et non mesurée.'],
  },
  'orison-kestrel': {
    description: 'Une lune rocheuse synthétique et sombre, à la surface fortement cratérisée.',
    facts: ['Kestrel confine le diffus anneau E externe.'],
  },
  'orison-morrow': {
    description: 'Une lune externe synthétique marquée par un immense bassin d’impact ancien.',
    facts: ['Morrow est la lune majeure régulière la plus externe du modèle.'],
  },
  caelora: {
    description: 'Une planète neptunienne synthétique cyan, tournant presque couchée sous une brume de méthane.',
    facts: [
      'Son obliquité extrême produit des saisons synthétiques longues de plusieurs décennies.',
      'Les valeurs climatiques indiquées correspondent au niveau atmosphérique d’un bar.',
    ],
  },
  'caelora-mistral': {
    description: 'Une lune bergère synthétique et glacée située au bord des anneaux de Caelora.',
    facts: ['Ses résonances maintiennent le bord externe abrupt du système d’anneaux.'],
  },
  'caelora-serein': {
    description: 'Une lune de glace synthétique aux plaines lisses renouvelées.',
    facts: [
      'La faible densité de cratères suggère un resurfaçage cryovolcanique récent dans le modèle.',
    ],
  },
  'caelora-pale': {
    description: 'Une lune capturée synthétique sur une orbite inclinée et faiblement excentrique.',
    facts: ['Pale s’est probablement formée ailleurs dans le système généré.'],
  },
  'caelora-vanta': {
    description: 'Une lune irrégulière externe, synthétique et sombre.',
    facts: [
      'L’orbite de Vanta est la plus inclinée parmi les lunes modélisées de Caelora.',
    ],
  },
  erebus: {
    description: 'Une géante de glace synthétique et compacte, avec une atmosphère d’hydrogène et de méthane d’un indigo profond.',
    facts: [
      'Erebus rayonne une modeste chaleur résiduelle de formation.',
      'Ses étroits anneaux couleur charbon sont optiquement minces dans le modèle synthétique.',
    ],
  },
  'erebus-rime': {
    description: 'Une lune de glace intérieure, synthétique et brillante.',
    facts: ['Rime échange de la poussière avec les étroits anneaux d’Erebus.'],
  },
  'erebus-noctis': {
    description: 'Une lune externe synthétique, sombre et riche en silicates.',
    facts: [
      'Noctis pourrait être un vestige capturé d’un ancien disque de planétésimaux.',
    ],
  },
  nyx: {
    description: 'Une lointaine planète neptunienne synthétique, à la brume violette et au faible anneau de poussière.',
    facts: [
      'Nyx accomplit une orbite en environ un siècle et demi terrestre.',
      'L’atmosphère au niveau d’un bar est modélisée avec de l’hydrogène, de l’hélium et du méthane.',
    ],
  },
  'nyx-wisp': {
    description: 'Une petite lune de glace synthétique située près de l’anneau de poussière de Nyx.',
    facts: [
      'Wisp alimente l’anneau en fines particules lors d’impacts de micrométéoroïdes.',
    ],
  },
  'nyx-shade': {
    description: 'Un compagnon externe synthétique surdimensionné, verrouillé en rotation synchrone avec Nyx.',
    facts: ['Shade et Nyx orbitent autour d’un barycentre qui reste à l’intérieur de Nyx.'],
  },
} as const satisfies ScienceNarrativeMap

export const scienceResources: Readonly<Record<AppLocale, ScienceNarrativeMap>> = {
  en,
  es,
  'zh-TW': zhTW,
  fr,
}
