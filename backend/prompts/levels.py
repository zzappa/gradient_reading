"""
Level-specific transformation prompt building.

This version:
- Enforces Level 7 = fully target language (except proper nouns).
- Fixes non-Latin examples (e.g., Japanese Level 7 no longer leaves "chair" in English).
- Adds high-level nativeness constraints not just for Japanese but also for:
  Spanish, Italian, German, Portuguese, Russian, Korean, Chinese, Arabic, French, Polish.

API compatibility:
- build_transform_prompt(...) signature unchanged.
- EXAMPLES dict remains.
"""

from languages import get_language, get_source_language_name
from services.vocabulary import VocabularyTracker


# ---------------------------------------------------------------------------
# Few-shot examples keyed by language code, then level.
# Latin-script targets:
#   - Annotate NEW content words only: {{display|base}}
#   - Do NOT annotate function words
# Non-Latin targets:
#   - Romanization in paragraph text
#   - Wrap EVERY target token (content + function): {{display|base}}
# ---------------------------------------------------------------------------
EXAMPLES = {
    "es": {
        1: [(
            "Good morning! The boy ran to the big house and sat down.",
            "{{Buenos días|buenos días}}! The boy ran to the big house and sat down.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "El boy y la girl went to un big park. Ella has un red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "El {{gato|gato}} se {{sentó|sentar}} en la {{alfombra|alfombra}}. It was una beautiful morning y los birds were singing en el old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "Ella {{come|comer}} el {{desayuno|desayuno}} cada {{mañana|mañana}}. Los {{niños|niño}} {{juegan|jugar}} en el {{parque|parque}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "Ayer ella {{compró|comprar}} un {{nuevo|nuevo}} {{libro|libro}} en la {{librería|librería}} porque {{quería|querer}} algo {{interesante|interesante}} para {{leer|leer}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "El {{viejo|viejo}} se {{sentó|sentar}} en su {{silla|silla}} {{favorita|favorito}}. {{Leía|leer}} el {{periódico|periódico}} en {{silencio|silencio}}. Su {{perro|perro}} {{dormía|dormir}} a sus {{pies|pie}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "El {{viejo|viejo}} se {{sentó|sentar}} en {{silencio|silencio}} en su {{silla|silla}} {{favorita|favorito}}, {{leyendo|leer}} el {{periódico|periódico}} mientras su {{perro|perro}} {{dormía|dormir}} a sus {{pies|pie}}.",
        )],
    },

    "ja": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Ohayou gozaimasu|ohayou gozaimasu}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy went to the store with his friend. She read a book in the park.",
            "The boy {{wa|wa}} his friend {{to|to}} the store {{ni|ni}} went. She read a {{hon|hon}} in the park.",
        )],
        3: [(
            "The boy went to the store with his friend. The cat ate the fish.",
            "The boy {{wa|wa}} friend {{to|to}} store {{ni|ni}} went. The cat {{wa|wa}} fish {{o|o}} ate.",
        )],
        4: [(
            "The cat eats fish. She is happy. I go to school every day.",
            "Cat {{wa|wa}} fish {{o|o}} {{tabemasu|taberu}}. She {{wa|wa}} {{ureshii|ureshii}} desu. {{Watashi|watashi}} {{wa|wa}} every day school {{ni|ni}} {{ikimasu|iku}}.",
        )],
        5: [(
            "Yesterday the cat ate the fish. The big dog is sleeping in the garden.",
            "{{Kinou|kinou}} cat {{wa|wa}} fish {{o|o}} {{tabemashita|taberu}}. {{Ookii|ookii}} dog {{wa|wa}} garden {{de|de}} {{neteimasu|neru}}.",
        )],
        # Level 6 graded: fully in target (romanized), shorter, shallow clause depth
        6: [(
            "The old man sat quietly reading the newspaper while his dog slept.",
            "{{Ojiisan|ojiisan}} {{wa|wa}} {{shizuka|shizuka}} {{ni|ni}} {{isu|isu}} {{ni|ni}} {{suwatta|suwaru}}. {{Shinbun|shinbun}} {{o|o}} {{yonda|yomu}}. {{Inu|inu}} {{wa|wa}} {{neteita|neru}}.",
        )],
        # Level 7 natural: fully in target (romanized), allow chaining / while-clauses
        7: [(
            "The old man sat quietly in his chair, reading the newspaper while his dog slept.",
            "{{Ojiisan|ojiisan}} {{wa|wa}} {{isu|isu}} {{ni|ni}} {{shizuka|shizuka}} {{ni|ni}} {{suwatte|suwaru}}, {{inu|inu}} {{ga|ga}} {{neteiru|neru}} {{aida|aida}} {{shinbun|shinbun}} {{o|o}} {{yonde imashita|yomu}}.",
        )],
    },

    "fr": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Bonjour|bonjour}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "Le boy et la girl went to un big park. Elle has une red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "Le {{chat|chat}} s'est {{assis|asseoir}} sur le {{tapis|tapis}}. It was un beautiful morning et les birds were singing dans le old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "Elle {{mange|manger}} le {{petit-déjeuner|petit-déjeuner}} chaque {{matin|matin}}. Les {{enfants|enfant}} {{jouent|jouer}} dans le {{parc|parc}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "Hier elle {{a acheté|acheter}} un {{nouveau|nouveau}} {{livre|livre}} à la {{librairie|librairie}} parce qu'elle {{voulait|vouloir}} quelque chose d'{{intéressant|intéressant}} à {{lire|lire}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "Le {{vieil homme|vieil homme}} s'est {{assis|asseoir}} en {{silence|silence}} sur sa {{chaise|chaise}} {{préférée|préféré}}. Il {{lisait|lire}} le {{journal|journal}}. Son {{chien|chien}} {{dormait|dormir}} à ses {{pieds|pied}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "Le {{vieil homme|vieil homme}} était {{assis|asseoir}} en {{silence|silence}} sur sa {{chaise|chaise}} {{préférée|préféré}}, {{lisant|lire}} le {{journal|journal}} pendant que son {{chien|chien}} {{dormait|dormir}} à ses {{pieds|pied}}.",
        )],
    },

    "it": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Buongiorno|buongiorno}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "Il boy e la girl went to un big park. Lei has una red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "Il {{gatto|gatto}} si è {{seduto|sedersi}} sul {{tappeto|tappeto}}. It was una beautiful morning e gli birds were singing nel old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "Lei {{mangia|mangiare}} la {{colazione|colazione}} ogni {{mattina|mattina}}. I {{bambini|bambino}} {{giocano|giocare}} nel {{parco|parco}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "Ieri lei {{ha comprato|comprare}} un {{nuovo|nuovo}} {{libro|libro}} in {{libreria|libreria}} perché {{voleva|volere}} qualcosa di {{interessante|interessante}} da {{leggere|leggere}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "Il {{vecchio|vecchio}} si {{sedette|sedersi}} in {{silenzio|silenzio}} sulla sua {{sedia|sedia}} {{preferita|preferito}}. {{Leggeva|leggere}} il {{giornale|giornale}}. Il suo {{cane|cane}} {{dormiva|dormire}} ai suoi {{piedi|piede}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "Il {{vecchio|vecchio}} era {{seduto|sedersi}} in {{silenzio|silenzio}} sulla sua {{sedia|sedia}} {{preferita|preferito}}, {{leggendo|leggere}} il {{giornale|giornale}} mentre il suo {{cane|cane}} {{dormiva|dormire}} ai suoi {{piedi|piede}}.",
        )],
    },

    "pt": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Bom dia|bom dia}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "O boy e a girl went to um big park. Ela has um red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "O {{gato|gato}} {{sentou|sentar}} no {{tapete|tapete}}. It was uma beautiful morning e os birds were singing na old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "Ela {{come|comer}} o {{café da manhã|café da manhã}} toda {{manhã|manhã}}. As {{crianças|criança}} {{brincam|brincar}} no {{parque|parque}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "Ontem ela {{comprou|comprar}} um {{livro|livro}} {{novo|novo}} na {{livraria|livraria}} porque {{queria|querer}} algo {{interessante|interessante}} para {{ler|ler}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "O {{velho|velho}} {{sentou|sentar}} em {{silêncio|silêncio}} na sua {{cadeira|cadeira}} {{favorita|favorito}}. {{Lia|ler}} o {{jornal|jornal}}. Seu {{cachorro|cachorro}} {{dormia|dormir}} aos seus {{pés|pé}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "O {{velho|velho}} estava {{sentado|sentar}} em {{silêncio|silêncio}} na sua {{cadeira|cadeira}} {{favorita|favorito}}, {{lendo|ler}} o {{jornal|jornal}} enquanto seu {{cachorro|cachorro}} {{dormia|dormir}} aos seus {{pés|pé}}.",
        )],
    },

    "de": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Guten Morgen|guten Morgen}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "Der boy und das girl went to ein big park. Sie has ein red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "Die {{Katze|Katze}} {{saß|sitzen}} auf der {{Matte|Matte}}. It was ein beautiful morning und die birds were singing im old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "Sie {{isst|essen}} jeden {{Morgen|Morgen}} {{Frühstück|Frühstück}}. Die {{Kinder|Kind}} {{spielen|spielen}} im {{Park|Park}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "Gestern {{kaufte|kaufen}} sie ein {{neues|neu}} {{Buch|Buch}} in der {{Buchhandlung|Buchhandlung}}, weil sie etwas {{Interessantes|interessant}} {{lesen|lesen}} wollte.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "Der {{alte Mann|alter Mann}} {{saß|sitzen}} still auf seinem {{Lieblingsstuhl|Lieblingsstuhl}}. Er {{las|lesen}} die {{Zeitung|Zeitung}}. Sein {{Hund|Hund}} {{schlief|schlafen}} zu seinen {{Füßen|Fuß}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "Der {{alte Mann|alter Mann}} {{saß|sitzen}} still auf seinem {{Lieblingsstuhl|Lieblingsstuhl}} und {{las|lesen}} die {{Zeitung|Zeitung}}, während sein {{Hund|Hund}} zu seinen {{Füßen|Fuß}} {{schlief|schlafen}}.",
        )],
    },

    "pl": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Dzień dobry|dzień dobry}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "The boy i the girl went do duży park. Ona has czerwony car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "Kot {{usiadł|usiąść}} na {{macie|mata}}. It was piękny morning i birds were singing na old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "Ona {{je|jeść}} {{śniadanie|śniadanie}} każdego {{ranka|ranek}}. {{Dzieci|dziecko}} {{bawią się|bawić się}} w {{parku|park}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "Wczoraj ona {{kupiła|kupić}} {{nową|nowy}} {{książkę|książka}} w {{księgarni|księgarnia}}, bo {{chciała|chcieć}} coś {{interesującego|interesujący}} do {{czytania|czytać}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Starszy mężczyzna|starszy mężczyzna}} {{siedział|siedzieć}} {{cicho|cicho}} na swoim {{ulubionym krześle|ulubione krzesło}}. {{Czytał|czytać}} {{gazetę|gazeta}}. Jego {{pies|pies}} {{spał|spać}} przy jego {{stopach|stopa}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Starszy mężczyzna|starszy mężczyzna}} {{siedział|siedzieć}} {{cicho|cicho}} na swoim {{ulubionym krześle|ulubione krzesło}}, {{czytając|czytać}} {{gazetę|gazeta}}, podczas gdy jego {{pies|pies}} {{spał|spać}} przy jego {{stopach|stopa}}.",
        )],
    },

    "ru": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Dobroe utro|dobroe utro}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "The boy {{i|i}} the girl went {{v|v}} big park. {{Ona|ona}} has red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "{{Kot|kot}} {{sel|sest'}} {{na|na}} {{kovrik|kovrik}}. It was beautiful morning {{i|i}} birds were singing {{na|na}} old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "{{Ona|ona}} {{est|est'}} {{zavtrak|zavtrak}} {{kazhdoe|kazhdyi}} {{utro|utro}}. {{Deti|rebenok}} {{igrayut|igrat'}} {{v|v}} {{parke|park}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "{{Vchera|vchera}} {{ona|ona}} {{kupila|kupit'}} {{novuyu|novyi}} {{knigu|kniga}} {{v|v}} {{knizhnom magazine|knizhnyi magazin}} {{potomu chto|potomu chto}} {{hotela|hotet'}} {{pochitat'|chitat'}} {{chto-to interesnoe|interesnyi}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Staryi|staryi}} {{muzhchina|muzhchina}} {{tiho|tiho}} {{sel|sest'}} {{na|na}} {{svoi lyubimyi stul|lyubimyi stul}}. {{On|on}} {{chital|chitat'}} {{gazetu|gazeta}}. {{Ego|ego}} {{sobaka|sobaka}} {{spala|spat'}} {{u|u}} {{ego nog|noga}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Staryi|staryi}} {{muzhchina|muzhchina}} {{tiho|tiho}} {{sidel|sidet'}} {{na|na}} {{svoem lyubimom stule|lyubimyi stul}}, {{chitaya|chitat'}} {{gazetu|gazeta}}, {{poka|poka}} {{ego|ego}} {{sobaka|sobaka}} {{spala|spat'}} {{u|u}} {{ego nog|noga}}.",
        )],
    },

    "zh": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Ni hao|ni hao}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "The boy {{he|he}} the girl went {{dao|dao}} big park. {{Ta|ta}} has red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "{{Mao|mao}} {{zuo|zuo}} {{zai|zai}} the mat. It was beautiful morning {{erqie|erqie}} birds were singing {{zai|zai}} old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "{{Ta|ta}} {{mei tian|mei tian}} {{chi|chi}} {{zaofan|zaofan}}. {{Haizi men|haizi}} {{zai|zai}} {{gongyuan|gongyuan}} {{wan|wan}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "{{Zuotian|zuotian}} {{ta|ta}} {{zai|zai}} {{shudian|shudian}} {{mai le|mai}} {{yi ben|yi}} {{xin|xin}} {{shu|shu}}, {{yinwei|yinwei}} {{ta|ta}} {{xiang|xiang}} {{du|du}} {{yixie|yixie}} {{youqu de|youqu}} {{dongxi|dongxi}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Laoren|laoren}} {{anjing de|anjing}} {{zuo zai|zuo}} {{ta zui xihuan de yizi shang|yizi}}. {{Ta|ta}} {{kanzhe|kan}} {{baozhi|baozhi}}. {{Ta de gou|gou}} {{shui zai|shui}} {{ta jiao bian|jiao bian}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Laoren|laoren}} {{anjing de|anjing}} {{zuo zai|zuo}} {{ta zui xihuan de yizi shang|yizi}}, {{kanzhe|kan}} {{baozhi|baozhi}}, {{er|er}} {{ta de gou|gou}} {{zheng zai|zheng zai}} {{ta jiao bian|jiao bian}} {{shuijiao|shuijiao}}.",
        )],
    },

    "ko": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Annyeonghaseyo|annyeonghaseyo}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "The boy {{wa|wa}} the girl {{wa|wa}} big park {{e|e}} went. {{Geunyeo|geunyeo}} has red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "{{Goyangi|goyangi}} {{neun|neun}} {{mat 위에|wi}} {{anjatda|anjda}}. It was beautiful morning {{geurigo|geurigo}} birds were singing {{old treeeseo|eseo}}.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "{{Geunyeo|geunyeo}} {{neun|neun}} {{maeil|maeil}} {{achim siksa|achim siksa}} {{reul|reul}} {{meogeoyo|meokda}}. {{Aideul|ai}} {{eun|eun}} {{parkeseo|parkeu}} {{noreoyo|nolda}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "{{Eoje|eoje}} {{geunyeo|geunyeo}} {{neun|neun}} {{seojeomeseo|seojeom}} {{saeroun|saeropda}} {{chaek|chaek}} {{han gwon|han gwon}} {{sasseoyo|sada}}, {{waenyahamyeon|waenyahamyeon}} {{geunyeo|geunyeo}} {{neun|neun}} {{jaemiinneun|jaemiitda}} {{geot|geot}} {{eul|eul}} {{ilkgo sip-eosseoyo|ilkda}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Noin|noin}} {{eun|eun}} {{joyonghi|joyonghi}} {{jagi ga joahaneun uijae|uija}} {{anjasseoyo|anjda}}. {{Geu|geu}} {{neun|neun}} {{sinmun|sinmun}} {{eul|eul}} {{ilkgo isseosseoyo|ilkda}}. {{Geu|geu}} {{ui|ui}} {{gae|gae}} {{neun|neun}} {{bal miteseo|bal mite}} {{jago isseosseoyo|jada}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Noin|noin}} {{eun|eun}} {{jagi ga joahaneun uijae|uija}} {{joyonghi|joyonghi}} {{anj-a|anjda}} {{sinmun|sinmun}} {{eul|eul}} {{ilkgo isseotgo|ilkda}}, {{dong-an|dong-an}} {{geu|geu}} {{ui|ui}} {{gae|gae}} {{neun|neun}} {{bal miteseo|bal mite}} {{jago isseosseumnida|jada}}.",
        )],
    },

    "he": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Shalom|shalom}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "Ha-boy {{ve|ve}} ha-girl went {{le|le}} big park. {{Hi|hi}} has red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "{{Ha-chatul|chatul}} {{yashav|lashavet}} {{al|al}} ha-mat. It was beautiful morning {{ve|ve}} birds were singing {{al|al}} old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "{{Hi|hi}} {{ochelet|leekhol}} {{aruchat boker|aruchat boker}} {{kol|kol}} {{boker|boker}}. {{Ha-yeladim|yeled}} {{mesachakim|lesachek}} {{ba-park|park}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "{{Etmol|etmol}} {{hi|hi}} {{kan'ta|liknot}} {{sefer|sefer}} {{chadash|chadash}} {{ba-chanut sefarim|chanut sefarim}} {{ki|ki}} {{hi|hi}} {{ratzta|lirtzot}} {{likro|likro}} {{mashehu me'anyen|me'anyen}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Ha-ish ha-zaken|ish zaken}} {{yashav|lashavet}} {{besheket|sheket}} {{al|al}} {{ha-kise ha-ahuv shelo|kise}}. {{Hu|hu}} {{kara|likro}} {{et ha-iton|iton}}. {{Ha-kelev shelo|kelev}} {{yashen|lishon}} {{leyad raglav|regel}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Ha-ish ha-zaken|ish zaken}} {{yashav|lashavet}} {{besheket|sheket}} {{al|al}} {{ha-kise ha-ahuv shelo|kise}}, {{kore|likro}} {{et ha-iton|iton}}, {{be-zman|be-zman}} {{she|she}} {{ha-kelev shelo|kelev}} {{yashen|lishon}} {{leyad raglav|regel}}.",
        )],
    },

    "ar": {
        1: [(
            "Good morning! The teacher walked to the school and greeted the students.",
            "{{Marhaban|marhaban}}! The teacher walked to the school and greeted the students.",
        )],
        2: [(
            "The boy and the girl went to a big park. She has a red car.",
            "Al-boy {{wa|wa}} al-girl went {{ila|ila}} big park. {{Hiya|hiya}} has red car.",
        )],
        3: [(
            "The cat sat on the mat. It was a beautiful morning and the birds were singing in the old tree.",
            "{{Al-qitt|qitt}} {{jalas|jalasa}} {{ala|ala}} al-mat. It was beautiful morning {{wa|wa}} birds were singing {{fi|fi}} old tree.",
        )],
        4: [(
            "She eats breakfast every morning. The children play in the park after school.",
            "{{Hiya|hiya}} {{ta'kul|akala}} {{al-futur|futur}} {{kulla|kull}} {{sabah|sabah}}. {{Al-atfal|tifl}} {{yalabun|laiba}} {{fi|fi}} {{al-hadiqa|hadiqa}} after school.",
        )],
        5: [(
            "Yesterday she bought a new book at the bookstore because she wanted something interesting to read.",
            "{{Bil-ams|ams}} {{ishtarat|ishtara}} {{kitaban|kitab}} {{jadidan|jadid}} {{min|min}} {{maktabat al-kutub|maktaba}} {{li-anna|li-anna}} {{ha|hiya}} {{aradat|arada}} {{an taqra|qaraa}} {{shay'an muthiiran|muthir}}.",
        )],
        6: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Al-rajul al-musinn|rajul musinn}} {{jalasa|jalasa}} {{bi-hudu'|hudu}} {{ala|ala}} {{kursiyyihi al-mufaddal|kursi}}. {{Kana|kana}} {{yaqra'u|qaraa}} {{al-jarida|jarida}}. {{Kalbuhu|kalb}} {{kana|kana}} {{na'iman|naim}} {{inda|inda}} {{qadamayhi|qadam}}.",
        )],
        7: [(
            "The old man sat quietly in his favorite chair, reading the newspaper while his dog slept at his feet.",
            "{{Al-rajul al-musinn|rajul musinn}} {{jalasa|jalasa}} {{bi-hudu'|hudu}} {{ala|ala}} {{kursiyyihi al-mufaddal|kursi}}, {{yaqra'u|qaraa}} {{al-jarida|jarida}}, {{baynama|baynama}} {{kalbuhu|kalb}} {{kana|kana}} {{na'iman|naim}} {{inda|inda}} {{qadamayhi|qadam}}.",
        )],
    },
}


# --------------------------- context parsing helpers ---------------------------

def _extract_tagged_block(text: str, tag: str) -> str:
    marker = f"[[{tag}]]"
    if marker not in text:
        return ""
    after = text.split(marker, 1)[1]
    return after.split("[[", 1)[0].strip()


def _split_context(context: str) -> tuple[str, str, str]:
    """
    Returns:
      prev_level_output, continuity_context, raw_context_fallback

    Supported tags in `context`:
      [[PREV_LEVEL_OUTPUT]]  Level N-1 output for the SAME passage
      [[CONTINUITY_CONTEXT]] Previous chunk context; do not transform
    """
    if not context:
        return "", "", ""
    prev_level = _extract_tagged_block(context, "PREV_LEVEL_OUTPUT")
    continuity = _extract_tagged_block(context, "CONTINUITY_CONTEXT")
    if prev_level or continuity:
        return prev_level, continuity, ""
    return "", "", context.strip()


# --------------------------- example formatting ---------------------------

def _get_examples(lang_code: str, level: int) -> str:
    lang_examples = EXAMPLES.get(lang_code, {})
    level_examples = lang_examples.get(level, [])

    if not level_examples:
        return ""

    parts = ["\nEXAMPLES (style reference; do not copy content):"]
    for source, transformed in level_examples:
        parts.append(f"  Source:        {source}")
        parts.append(f"  Level {level}:   {transformed}")
        parts.append("")
    return "\n".join(parts)


# --------------------------- level rubric ---------------------------

def _level_rubric(level: int) -> str:
    rubrics = {
        0: "Coverage target: 0%. Output should be pure source language.",
        1: (
            "Coverage target: ~3–7% target-language tokens.\n"
            "Goal: minimal change; introduce easy, high-salience items.\n"
            "New-term budget: ~3–8 new content terms per ~300 source words.\n"
            "Do NOT restructure sentences."
        ),
        2: (
            "Coverage target: ~10–18% target-language tokens.\n"
            "Goal: light code-switching; preserve readability.\n"
            "New-term budget: ~8–16 new content terms per ~300 words."
        ),
        3: (
            "Coverage target: ~25–40% target-language tokens.\n"
            "Goal: gentle syntax drift + basic morphology.\n"
            "New-term budget: ~16–28 new content terms per ~300 words."
        ),
        4: (
            "Coverage target: ~50–65% target-language tokens.\n"
            "Goal: target language becomes dominant; source is scaffolding.\n"
            "New-term budget: ~25–40 new content terms per ~300 words."
        ),
        5: (
            "Coverage target: ~70–82% target-language tokens.\n"
            "Goal: avoid cliff: keep small source supports only for rare/complex parts.\n"
            "New-term budget: ~35–55 new content terms per ~300 words."
        ),
        6: (
            "Coverage target: ~90–97% target-language tokens.\n"
            "Goal: graded-reader target language.\n"
            "Simplify syntax; shorten sentences; reduce clause depth; avoid idioms."
        ),
        7: (
            "Coverage target: ~99–100% target-language tokens.\n"
            "Goal: natural target language.\n"
            "Remove graded-reader constraints; allow native-like flow and clause chaining."
        ),
    }
    return rubrics.get(level, "")


def _level_6_rules() -> str:
    return (
        "LEVEL 6 GRADED-READER RULES:\n"
        "- Prefer short sentences; split long sentences.\n"
        "- Keep clause depth shallow; avoid heavy nesting.\n"
        "- Avoid idioms, slang, and literary flourishes.\n"
        "- Prefer high-frequency vocabulary and straightforward verb forms.\n"
    )


def _level_7_rules() -> str:
    return (
        "LEVEL 7 NATURAL-TEXT RULES:\n"
        "- Remove graded-reader constraints.\n"
        "- You MAY merge previously split sentences into natural longer sentences.\n"
        "- You MAY use subordinate clauses and sentence chaining where it improves flow.\n"
        "- You MAY use participial/gerund constructions (or equivalents) if natural.\n"
    )


def _level_7_full_target_rule(source_name: str) -> str:
    return (
        "LEVEL 7 FULL-TARGET ENFORCEMENT (critical):\n"
        f"- Aside from proper nouns (which must remain in {source_name}), there must be NO source-language words.\n"
        "- Translate leftover common nouns/adjectives/verbs (e.g., do not leave 'chair' in English).\n"
    )


# --------------------------- high-level quality constraints ---------------------------

def _nativeness_override_block(level: int) -> str:
    if level < 6:
        return ""
    return (
        "NATIVENESS OVERRIDE (levels 6–7):\n"
        "- If any phrase is ungrammatical, unnatural, or 'translationese', rewrite it even if edits are larger.\n"
        "- Keep meaning stable; prioritize natural phrasing over literal structure.\n"
        "- Do not preserve awkward wording just for consistency.\n"
    )


def _terminology_validation_block(level: int) -> str:
    emphasis = " (critical at levels 5–7)" if level >= 5 else ""
    return (
        f"TERMINOLOGY VALIDATION (required){emphasis}:\n"
        "- For each newly introduced target-language term, confirm it matches the intended meaning in context.\n"
        "- If a dictionary-literal choice is wrong, replace it with the standard term/collocation.\n"
    )


def _locks_policy_block(level: int) -> str:
    if level >= 6:
        return (
            "LOCKS AT HIGH LEVELS:\n"
            "- Locks are default.\n"
            "- If a lock yields incorrect meaning or unnatural phrasing, override it with the correct term.\n"
            "- After overriding, keep the new choice consistent going forward.\n"
        )
    return (
        "LOCKS AT LEVELS 1–5:\n"
        "- Follow locks exactly; do not swap synonyms once introduced.\n"
    )


def _repetition_policy_block() -> str:
    return (
        "REPETITION POLICY:\n"
        "- Keep key technical terms and recurring named items consistent.\n"
        "- You MAY vary light connectors/scaffolding phrases to avoid robotic repetition.\n"
    )


def _lexical_safety_block(target_name: str) -> str:
    return (
        f"LEXICAL SAFETY (for {target_name}, required):\n"
        "- NEVER invent, coin, or fabricate words.\n"
        "- Never use non-existent derivatives or nonce forms.\n"
        "- Use only real, attested dictionary words and natural collocations.\n"
        "- If unsure, choose a simpler high-frequency word that is definitely valid.\n"
        "- Do not create ad-hoc derivations to force literal one-to-one translation.\n"
    )


def _romanization_policy_block(lang_code: str, target_name: str) -> str:
    specific: dict[str, str] = {
        "ja": (
            "ROMANIZATION STANDARD (Japanese):\n"
            "- Use Hepburn-style romanization consistently.\n"
            "- Use ASCII only (no macrons): represent long vowels consistently (e.g., ou/uu/oo style, but do not mix randomly).\n"
            "- Keep particles/forms consistent across the chapter (wa, ga, o, ni, de, to, e, no).\n"
        ),
        "zh": (
            "ROMANIZATION STANDARD (Chinese):\n"
            "- Use Hanyu Pinyin consistently.\n"
            "- Omit tone marks/tone numbers in paragraph text; do not mix with Wade-Giles-like forms.\n"
            "- Keep spacing and hyphenation conventions consistent throughout the output.\n"
        ),
        "ko": (
            "ROMANIZATION STANDARD (Korean):\n"
            "- Use Revised Romanization consistently.\n"
            "- Keep vowel spellings stable (eo, eu, ae, oe, ui); do not alternate with ad-hoc spellings.\n"
            "- Keep particle and ending segmentation consistent across sentences.\n"
        ),
        "ru": (
            "ROMANIZATION STANDARD (Russian):\n"
            "- Use one consistent transliteration convention across the whole output.\n"
            "- Keep core mappings stable (zh, kh, ts, ch, sh, shch, yu, ya; use yo for ё).\n"
            "- Do not switch between multiple transliteration systems in one chapter.\n"
        ),
        "he": (
            "ROMANIZATION STANDARD (Hebrew):\n"
            "- Use one learner-friendly transliteration convention consistently.\n"
            "- Keep key mappings stable (e.g., sh for ש, tz for צ, ch/kh choice consistent for ח/כ).\n"
            "- Keep hyphen/prefix handling (ha-, ve-, be-, le-, mi-) consistent.\n"
        ),
        "ar": (
            "ROMANIZATION STANDARD (Arabic):\n"
            "- Use one consistent transliteration convention across the output.\n"
            "- Keep core mappings stable (sh, kh, gh, th, dh; use q for ق consistently).\n"
            "- Keep article/prefix handling (al-, wa-, bi-, li-) and apostrophe usage consistent.\n"
        ),
    }

    block = specific.get(lang_code)
    if block:
        return block

    return (
        f"ROMANIZATION CONSISTENCY (for romanized {target_name}):\n"
        "- Use one romanization standard consistently; do not mix conventions.\n"
        "- Keep long vowels, spacing, and hyphenation conventions consistent.\n"
    )


# --------------------------- language-specific high-level nativeness constraints ---------------------------

def _language_nativeness_constraints_block(lang_code: str, level: int) -> str:
    if level < 6:
        return ""

    blocks: dict[str, str] = {
        "ja": (
            "LANGUAGE NATIVENESS (Japanese, levels 6–7):\n"
            "- Prefer zero-pronoun; avoid explicit subjects/pronouns unless contrast/clarity requires.\n"
            "- Do not mirror English clause structure; reorder freely to sound like Japanese prose.\n"
            "- Avoid repetitive templates; vary causation/topic framing naturally.\n"
            "- Maintain one register (plain OR desu/masu) consistently unless character voice demands a shift.\n"
            "- Avoid unnatural hybrids like '[plain negative past] + desu'; use correct forms consistently.\n"
        ),
        "es": (
            "LANGUAGE NATIVENESS (Spanish, levels 6–7):\n"
            "- Drop subject pronouns unless needed for emphasis/contrast.\n"
            "- Prefer natural connectors and avoid repetitive calques (e.g., mechanical 'porque...' patterns).\n"
            "- Keep tense/aspect idiomatic (pret./imp. where natural), avoid English-like over-explicitness.\n"
        ),
        "it": (
            "LANGUAGE NATIVENESS (Italian, levels 6–7):\n"
            "- Pro-drop: omit subject pronouns unless emphasis is intended.\n"
            "- Prefer idiomatic verb choices and avoid literal English structures.\n"
            "- Use natural clitic placement and avoid over-explicit subjects.\n"
        ),
        "pt": (
            "LANGUAGE NATIVENESS (Portuguese, levels 6–7):\n"
            "- Pro-drop: avoid unnecessary subject pronouns.\n"
            "- Prefer idiomatic connectors and avoid literal English phrasing.\n"
            "- Keep tense/aspect idiomatic; avoid repetitive template sentences.\n"
        ),
        "fr": (
            "LANGUAGE NATIVENESS (French, levels 6–7):\n"
            "- Avoid English calques; use French idiomatic phrasing.\n"
            "- Keep register consistent (formal/informal) and pronoun choice consistent.\n"
            "- Use natural linking structures (relative clauses, participles) where appropriate.\n"
        ),
        "de": (
            "LANGUAGE NATIVENESS (German, levels 6–7):\n"
            "- Enforce German word order: V2 in main clauses; verb-final in subordinate clauses.\n"
            "- Use articles/case agreement correctly; capitalize nouns.\n"
            "- Avoid English-like clause chaining; use German connectors naturally.\n"
        ),
        "ru": (
            "LANGUAGE NATIVENESS (Russian, levels 6–7):\n"
            "- Avoid unnecessary pronouns; Russian often omits subjects once established.\n"
            "- Use correct aspect (perfective/imperfective) for narrative sequence.\n"
            "- Prefer idiomatic collocations; avoid literal English phrasing.\n"
        ),
        "pl": (
            "LANGUAGE NATIVENESS (Polish, levels 6–7):\n"
            "- Avoid unnecessary pronouns; prefer natural Polish word order.\n"
            "- Use correct case government and aspect where relevant.\n"
            "- Prefer idiomatic collocations; avoid literal English calques.\n"
        ),
        "ko": (
            "LANGUAGE NATIVENESS (Korean, levels 6–7):\n"
            "- Avoid 'dangsin' for 'you' in normal narration; prefer zero-pronoun.\n"
            "- Use particles/connective endings naturally; avoid English-like explicit subjects.\n"
            "- Keep one speech level/register consistently unless character voice requires change.\n"
        ),
        "zh": (
            "LANGUAGE NATIVENESS (Chinese, levels 6–7):\n"
            "- Prefer topic-comment flow; avoid overusing explicit pronouns.\n"
            "- Avoid repetitive 'yinwei... suoyi...' template causation; vary naturally.\n"
            "- Use measure words and aspect markers naturally; avoid English-like clause structure.\n"
        ),
        "ar": (
            "LANGUAGE NATIVENESS (Arabic, levels 6–7):\n"
            "- Keep one variety/register consistent (default to MSA unless your system specifies otherwise).\n"
            "- Ensure gender/number agreement and definite/indefinite usage is natural.\n"
            "- Avoid literal English calques; prefer standard Arabic collocations.\n"
        ),
    }

    return blocks.get(lang_code, "")


# --------------------------- vocabulary locks formatting ---------------------------

def _format_vocab_locks(vocab_tracker: VocabularyTracker) -> str:
    known = ""
    try:
        known = vocab_tracker.format_known_terms()
    except Exception:
        known = ""
    known = (known or "").strip()
    if known == "(none yet)":
        known = ""

    extra = ""
    for attr in ("format_translation_locks", "format_locks", "format_known_pairs"):
        fn = getattr(vocab_tracker, attr, None)
        if callable(fn):
            try:
                extra = fn()
            except Exception:
                extra = ""
            if extra:
                break

    parts = []
    if extra:
        parts.append("LOCKED TRANSLATIONS / PREFERRED RENDERINGS:")
        parts.append(extra.strip())
        parts.append("")
    if known:
        parts.append("ALREADY INTRODUCED TERMS (do NOT add to footnote_refs or new_terms again):")
        parts.append(known)

    return "\n".join(parts).strip()


# --------------------------- main prompt builder ---------------------------

def build_transform_prompt(
    level: int,
    vocab_tracker: VocabularyTracker,
    lang_code: str = "es",
    source_lang_code: str = "en",
    context: str = "",
    quality_hint: str = "",
) -> str:
    if level < 0 or level > 7:
        raise ValueError("level must be between 0 and 7")

    lang = get_language(lang_code)
    target_name = lang["name"]
    is_non_latin = lang["script"] != "latin"
    source_name = get_source_language_name(source_lang_code)

    guidance = lang["level_guidance"].get(level, "")
    rubric = _level_rubric(level)
    examples = _get_examples(lang_code, level) if level else ""

    prev_level_output, continuity_context, raw_context = _split_context(context)
    vocab_locks = _format_vocab_locks(vocab_tracker)

    if level and prev_level_output and level > 0:
        laddering_block = f"""
LADDERING MODE (critical):
- You are given the previous level output (Level {level-1}) for the SAME passage.
- Start from that text and edit it to reach Level {level}.
- Levels 1–5: minimal edits; avoid paraphrase.
- Levels 6–7: nativeness override applies; rewrite translationese/grammar errors even if edits are larger.
"""
    else:
        laddering_block = """
CONSISTENCY MODE (critical):
- Translate from the source text, but keep wording stable:
  - Reuse established translations for repeated phrases.
  - Prefer consistent renderings rather than swapping synonyms.
"""

    level_rules = ""
    if level == 6:
        level_rules = _level_6_rules()
    elif level == 7:
        level_rules = _level_7_rules() + _level_7_full_target_rule(source_name)

    nativeness_override = _nativeness_override_block(level)
    terminology_validation = _terminology_validation_block(level)
    locks_policy = _locks_policy_block(level)
    repetition_policy = _repetition_policy_block()
    lexical_safety = _lexical_safety_block(target_name)
    language_nativeness = _language_nativeness_constraints_block(lang_code, level)
    romanization_policy = _romanization_policy_block(lang_code, target_name) if is_non_latin and level >= 1 else ""
    quality_hint_block = f"QUALITY CORRECTION (must follow):\n{quality_hint.strip()}\n" if quality_hint.strip() else ""

    prompt = f"""You are a gradient immersion language transformer.

Transform {source_name} narrative text into a Level {level}/7 {source_name}-{target_name} hybrid that stays readable and plot-faithful.

SOURCE LANGUAGE: {source_name}
TARGET LANGUAGE: {target_name}

LEVEL DEFINITION (language-specific guidance):
{guidance}

LEVEL CONTROL RUBRIC:
{rubric}

{laddering_block}

{level_rules}

{nativeness_override}
{terminology_validation}
{locks_policy}
{repetition_policy}
{lexical_safety}
{language_nativeness}
{romanization_policy}
{quality_hint_block}

ABSOLUTE RULES:
1. Preserve paragraph structure exactly — same number of paragraphs in, same number out.
2. Preserve meaning and story beats. Do not add, remove, or reorder events.
3. Proper nouns (character names, place names) must be consistent across levels.
4. Maintain reader comprehension at this level; no sudden jumps.
5. Keep key term translations stable; do not swap established translations without reason.
6. Dialogue transforms at the same level as narration.
7. Return your result using the submit_transformation tool only (paragraphs + footnote_refs + new_terms). No prose outside the tool payload.

Ultrathink!
"""

    if is_non_latin:
        prompt += f"""

SCRIPT — CRITICAL:
- ALWAYS use transliteration (Latin/romanized script) for ALL {target_name} words at EVERY level.
- NEVER output native {target_name} script ({_script_examples(lang["script"])}) in the paragraph text.
- The native script will be shown to readers on hover — you provide it in the native_script field of new_terms.

INLINE ANNOTATIONS (non-Latin targets):
- Wrap EVERY {target_name} token (content words AND function words) with {{{{display_text|base_form|native_display}}}}.
- display_text = transliteration as it appears in the sentence (possibly inflected)
- base_form = transliterated dictionary/base form
- native_display = the word in {_script_name(lang["script"])} as it appears in the sentence (inflected form matching display_text)
- Do NOT wrap {source_name} words or proper nouns.
- Example (Russian): {{{{yego|on|его}}}} — "yego" is the transliteration in context, "on" is the base form, "его" is the native script of the contextual form.

NEW TERMS (non-Latin targets):
- Every term in footnote_refs MUST have a matching entry in new_terms.
- native_script is REQUIRED (provide the BASE/DICTIONARY form in {_script_name(lang["script"])}).
"""
        if lang_code == "ja":
            prompt += """

JAPANESE-SPECIFIC SCRIPT RULES:
- Use only hiragana and katakana for native_script of new_terms; do not use kanji there.
"""
    else:
        prompt += f"""

INLINE ANNOTATIONS (Latin targets):
- Wrap NEW {target_name} content words (nouns, verbs, adjectives, adverbs) as {{{{display_text|base_form}}}}.
- display_text = the word as it appears in the sentence (possibly inflected)
- base_form = dictionary/base form
- Do NOT annotate function words (articles, prepositions, conjunctions, particles, pronouns).
- Do NOT annotate {source_name} words or proper nouns.
- Only annotate a term on its FIRST occurrence in this chunk.

NEW TERMS (Latin targets):
- native_script should be empty string for {target_name}.
"""

    if examples:
        prompt += examples + "\n"

    if vocab_locks:
        prompt += f"""
{vocab_locks}
"""

    if prev_level_output:
        prompt += f"""
PREVIOUS LEVEL OUTPUT (Level {max(level-1, 0)}) — use as the base text for laddering:
\"\"\"{prev_level_output}\"\"\"
"""

    if continuity_context:
        prompt += f"""
CONTINUITY CONTEXT (previous chunk; do not transform; use only for consistent voice/details):
\"\"\"{continuity_context}\"\"\"
"""

    if raw_context:
        prompt += f"""
CONTEXT (untyped; use only for continuity; do not transform):
\"\"\"{raw_context}\"\"\"
"""

    return prompt


def _script_examples(script: str) -> str:
    return {
        "cyrillic": "Cyrillic like А, Б, В, Г",
        "cjk": "CJK characters like 漢字, ひらがな, カタカナ, 汉字",
        "hangul": "Hangul like 한, 글",
        "hebrew": "Hebrew like א, ב, ג, ד",
        "arabic": "Arabic like ا, ب, ت, ث",
    }.get(script, "non-Latin characters")


def _script_name(script: str) -> str:
    return {
        "cyrillic": "Cyrillic",
        "cjk": "native (kanji/kana for Japanese, hanzi for Chinese)",
        "hangul": "Hangul",
        "hebrew": "Hebrew",
        "arabic": "Arabic",
    }.get(script, "native")
