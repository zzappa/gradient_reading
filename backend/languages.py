"""Supported target languages and their configuration.

Each language has:
- name, flag, script: display and rendering info
- family: structural distance from English ("close", "medium", "sov", "isolating")
- level_guidance: per-level description of what the output should look like
  (percentage-based, not grammatical-category-based)
"""

LANGUAGES = {
    "en": {
        "name": "English",
        "flag": "\U0001f1ec\U0001f1e7",
        "script": "latin",
        "family": "source",
        "level_guidance": {},
    },
    "es": {
        "name": "Spanish",
        "flag": "\U0001f1ea\U0001f1f8",
        "script": "latin",
        "family": "close",
        "level_guidance": {
            1: (
                "~5% Spanish. Sprinkle in greetings (hola, buenos dias, adios), "
                "culturally specific terms, and easy cognates (familia, animal, restaurante, chocolate). "
                "Keep ALL English grammar and word order completely intact. "
                "The reader should barely notice anything changed."
            ),
            2: (
                "~15% Spanish. Switch common function words: articles (the->el/la/los/las, a->un/una), "
                "conjunctions (and->y, but->pero, or->o, because->porque, that->que), "
                "basic prepositions (in->en, with->con, for->para/por, of->de, to->a). "
                "Keep all nouns, verbs, adjectives, and adverbs in English. "
                "Adjectives shift to after-noun position where natural."
            ),
            3: (
                "~30% Spanish. Translate complete short/simple sentences fully into Spanish. "
                "Longer or complex sentences stay mostly English but use Spanish function words "
                "from Level 2 plus some common verbs and nouns. "
                "Use Spanish punctuation where appropriate."
            ),
            4: (
                "~50% Spanish. Translate most sentences. Verbs conjugated in Spanish "
                "(-ar/-er/-ir present tense, ser/estar distinction). Common nouns in Spanish "
                "(casa, hombre, mujer, nino, tiempo, dia, agua, comida). "
                "English only for less common or harder vocabulary."
            ),
            5: (
                "~70% Spanish. Most text in Spanish including past tenses "
                "(preterito/imperfecto). Object pronouns (lo, la, le, me, te) and reflexive "
                "verbs (se) in Spanish. English only for complex, specialized, or rare vocabulary."
            ),
            6: (
                "~90% Spanish. Nearly all text in natural Spanish. "
                "English only for very rare or specialized terms that a beginner wouldn't know. "
                "Sentences should flow naturally in Spanish, not feel like word-for-word translation."
            ),
            7: (
                "100% simplified Spanish. Everything in natural, flowing Spanish. "
                "Use common vocabulary — prefer simple synonyms over obscure words. "
                "Dialogue should sound natural. Idioms use Spanish equivalents, not literal translations. "
                "A Spanish speaker should be able to read this comfortably."
            ),
        },
    },
    "fr": {
        "name": "French",
        "flag": "\U0001f1eb\U0001f1f7",
        "script": "latin",
        "family": "close",
        "level_guidance": {
            1: (
                "~5% French. Sprinkle in greetings (bonjour, salut, merci, au revoir), "
                "culturally specific terms, and easy cognates (restaurant, hotel, cafe). "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% French. Switch function words: articles (the->le/la/les, a->un/une/des), "
                "conjunctions (and->et, but->mais, or->ou, because->parce que), "
                "prepositions (in->dans/en, with->avec, for->pour, of->de, to->a). "
                "Use contractions (du, au, des). Keep content words in English. "
                "Adjectives shift to after-noun position (except petit, grand, bon, beau)."
            ),
            3: (
                "~30% French. Simple/short sentences fully in French. "
                "Complex sentences stay mostly English with French function words "
                "and some common verbs/nouns."
            ),
            4: (
                "~50% French. Most sentences translated. French verb conjugations "
                "(-e, -es, -e, -ons, -ez, -ent), etre/avoir. Common nouns in French "
                "(maison, homme, femme, jour, temps). English for harder vocabulary."
            ),
            5: (
                "~70% French. Most text in French. Passe compose with avoir/etre. "
                "Object pronouns (le, la, les, lui, me, te). "
                "English only for complex or rare vocabulary."
            ),
            6: (
                "~90% French. Nearly all text in natural French. "
                "English only for very specialized terms."
            ),
            7: (
                "100% simplified French. Everything in natural, flowing French. "
                "Common vocabulary, natural dialogue, French idioms."
            ),
        },
    },
    "it": {
        "name": "Italian",
        "flag": "\U0001f1ee\U0001f1f9",
        "script": "latin",
        "family": "close",
        "level_guidance": {
            1: (
                "~5% Italian. Sprinkle in greetings (ciao, buongiorno, grazie, arrivederci), "
                "culturally specific terms, and easy cognates. "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Italian. Switch function words: articles (the->il/lo/la/i/gli/le, a->un/uno/una), "
                "conjunctions (and->e, but->ma, or->o, because->perche), "
                "prepositions (in->in, with->con, for->per, of->di, to->a). "
                "Keep content words in English. Adjectives shift to after-noun position."
            ),
            3: (
                "~30% Italian. Simple sentences fully in Italian. "
                "Complex sentences mostly English with Italian function words and common verbs."
            ),
            4: (
                "~50% Italian. Most sentences translated. Italian verb conjugations "
                "(-o, -i, -a, -iamo, -ano), essere/avere. Common nouns (casa, uomo, donna, giorno). "
                "English for harder vocabulary."
            ),
            5: (
                "~70% Italian. Most text in Italian. Passato prossimo. "
                "Object pronouns (lo, la, li, le, mi, ti). English only for rare vocabulary."
            ),
            6: (
                "~90% Italian. Nearly all natural Italian. English only for specialized terms."
            ),
            7: (
                "100% simplified Italian. Natural flowing Italian with common vocabulary."
            ),
        },
    },
    "pt": {
        "name": "Portuguese",
        "flag": "\U0001f1e7\U0001f1f7",
        "script": "latin",
        "family": "close",
        "level_guidance": {
            1: (
                "~5% Portuguese. Sprinkle in greetings (ola, bom dia, obrigado/a, tchau), "
                "culturally specific terms, and easy cognates. "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Portuguese. Switch function words: articles (the->o/a/os/as, a->um/uma), "
                "conjunctions (and->e, but->mas, or->ou, because->porque), "
                "prepositions (in->em, with->com, for->para/por, of->de, to->a). "
                "Use contractions (do/da, no/na, ao). Keep content words in English."
            ),
            3: (
                "~30% Portuguese. Simple sentences fully in Portuguese. "
                "Complex sentences mostly English with Portuguese function words."
            ),
            4: (
                "~50% Portuguese. Most sentences translated. Portuguese verb conjugations, "
                "ser/estar distinction. Common nouns (casa, homem, mulher, dia, tempo). "
                "English for harder vocabulary."
            ),
            5: (
                "~70% Portuguese. Most text in Portuguese. Past tenses (preterito perfeito). "
                "Object pronouns. English only for rare vocabulary."
            ),
            6: (
                "~90% Portuguese. Nearly all natural Portuguese. English only for specialized terms."
            ),
            7: (
                "100% simplified Portuguese. Natural flowing Portuguese with common vocabulary."
            ),
        },
    },
    "de": {
        "name": "German",
        "flag": "\U0001f1e9\U0001f1ea",
        "script": "latin",
        "family": "close",
        "level_guidance": {
            1: (
                "~5% German. Sprinkle in greetings (hallo, guten Tag, danke, tschuss), "
                "culturally specific terms (Kindergarten, Wanderlust), and easy cognates. "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% German. Switch function words: articles (the->der/die/das, a->ein/eine), "
                "conjunctions (and->und, but->aber, or->oder, because->weil), "
                "prepositions (in->in, with->mit, for->fur, of->von, to->zu). "
                "Keep content words in English."
            ),
            3: (
                "~30% German. Simple sentences fully in German with verb-second word order. "
                "Complex sentences mostly English with German function words. "
                "Subordinate clauses start showing verb-final order."
            ),
            4: (
                "~50% German. Most sentences translated. German verb conjugations "
                "(-e, -st, -t, -en), sein/haben, modal verbs. Common nouns "
                "(Haus, Mann, Frau, Tag, Zeit). English for harder vocabulary."
            ),
            5: (
                "~70% German. Most text in German. Perfekt tense with haben/sein. "
                "Separable verbs. English only for rare vocabulary."
            ),
            6: (
                "~90% German. Nearly all natural German. English only for specialized terms."
            ),
            7: (
                "100% simplified German. Natural flowing German with common vocabulary. "
                "Proper case endings, word order, and compound words."
            ),
        },
    },
    "pl": {
        "name": "Polish",
        "flag": "\U0001f1f5\U0001f1f1",
        "script": "latin",
        "family": "medium",
        "level_guidance": {
            1: (
                "~5% Polish. Sprinkle in greetings (czesc, dzien dobry, dziekuje, do widzenia), "
                "culturally specific terms. Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Polish. Drop English articles (Polish has none). "
                "Switch conjunctions (and->i, but->ale, or->lub, because->bo/poniewaz), "
                "prepositions (in->w, with->z, for->dla, from->z/od, to->do). "
                "Keep content words in English."
            ),
            3: (
                "~30% Polish. Simple sentences fully in Polish. "
                "Complex sentences mostly English with Polish function words and common verbs."
            ),
            4: (
                "~50% Polish. Most sentences translated. Polish verb conjugations "
                "(-e, -esz, -e, -emy, -ecie, -a). Common nouns (dom, czlowiek, kobieta, dzien, czas). "
                "English for harder vocabulary."
            ),
            5: (
                "~70% Polish. Most text in Polish. Past tense (-lem, -les, -l/-la). "
                "Pronoun forms. English only for rare vocabulary."
            ),
            6: (
                "~90% Polish. Nearly all natural Polish. Case endings applied naturally. "
                "English only for specialized terms."
            ),
            7: (
                "100% simplified Polish. Natural flowing Polish with common vocabulary "
                "and proper case/gender agreement."
            ),
        },
    },
    "ru": {
        "name": "Russian",
        "flag": "\U0001f1f7\U0001f1fa",
        "script": "cyrillic",
        "family": "medium",
        "level_guidance": {
            1: (
                "~5% Russian. Sprinkle in greetings (privet, zdravstvuyte, spasibo, do svidaniya) "
                "in TRANSLITERATED form (Latin script). Culturally specific terms. "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Russian. Drop English articles (Russian has none). "
                "Switch conjunctions (and->i, but->no, or->ili, because->potomu chto) "
                "and prepositions (in->v, with->s, for->dlya, from->iz, to->k/v) in transliteration. "
                "Keep content words in English."
            ),
            3: (
                "~30% Russian. Simple sentences fully in Russian (transliterated). "
                "Complex sentences mostly English with Russian function words."
            ),
            4: (
                "~50% Russian. Most sentences translated in transliteration. "
                "Russian verb conjugations. Common nouns (dom, chelovek, zhenshchina, den, vremya). "
                "English for harder vocabulary."
            ),
            5: (
                "~70% Russian. Most text in Russian (transliterated). "
                "Past tense (-l/-la/-lo/-li). "
                "English only for rare vocabulary."
            ),
            6: (
                "~90% Russian. Nearly all text in Russian (transliterated). "
                "English only for specialized terms."
            ),
            7: (
                "100% simplified Russian (transliterated). Natural flowing Russian. "
                "Common vocabulary with proper case/gender agreement."
            ),
        },
    },
    "ja": {
        "name": "Japanese",
        "flag": "\U0001f1ef\U0001f1f5",
        "script": "cjk",
        "family": "sov",
        "level_guidance": {
            1: (
                "~5% Japanese. Add cultural words and greetings in romaji: "
                "honorifics (-san, -sama, sensei), greetings (ohayou gozaimasu, konnichiwa, "
                "arigatou, sumimasen), and simple cultural terms (hai, iie). "
                "Keep ALL English grammar and word order (SVO) completely intact. "
                "The Japanese words should feel like natural borrowings."
            ),
            2: (
                "~15% Japanese. Drop English articles (the, a, an — Japanese has none). "
                "Introduce Japanese particles ALONGSIDE English prepositions as guides: "
                "'in (de) the park', 'to (ni) the store', 'of (no) the king'. "
                "Keep English word order (SVO). All content words stay English. "
                "Use romaji for all Japanese."
            ),
            3: (
                "~30% Japanese. Remove English prepositions — only particles remain: "
                "'park de', 'store ni', 'king no'. "
                "Begin shifting to SOV word order: 'The cat fish wo ate.' "
                "Topic marker wa appears: 'The cat wa fish wo ate.' "
                "All content words still English. Romaji throughout."
            ),
            4: (
                "~50% Japanese. Full SOV word order. Japanese verb forms (polite -masu): "
                "'Cat wa fish wo tabemasu.' Desu copula: 'It happy desu.' "
                "Common adjectives in Japanese (ookii, chiisai, ii). "
                "Pronouns start switching (watashi, kare, kanojo). "
                "Nouns mostly still English. Romaji throughout."
            ),
            5: (
                "~70% Japanese. Common nouns in Japanese (ie, hito, neko, mizu, hi, tokoro). "
                "Past tense (-mashita): 'Neko wa sakana wo tabemashita.' "
                "Te-form for connecting actions. Most grammar fully Japanese. "
                "English only for less common nouns, adjectives, and abstract concepts. Romaji."
            ),
            6: (
                "~90% Japanese. Nearly all in Japanese using romaji. "
                "English only for very rare, specialized, or abstract terms. "
                "Natural Japanese sentence flow. Particles, verbs, nouns, adjectives all Japanese."
            ),
            7: (
                "100% simplified Japanese. Everything in natural Japanese. "
                "Use romaji throughout. "
                "Simple vocabulary, polite (-masu/-desu) form throughout. "
                "A Japanese learner should be able to read this as beginner-level Japanese."
            ),
        },
    },
    "zh": {
        "name": "Chinese",
        "flag": "\U0001f1e8\U0001f1f3",
        "script": "cjk",
        "family": "isolating",
        "level_guidance": {
            1: (
                "~5% Chinese. Sprinkle in greetings in pinyin: ni hao, xie xie, zai jian. "
                "Cultural terms. Keep all English grammar and word order (SVO) intact."
            ),
            2: (
                "~15% Chinese. Drop English articles (Chinese has none). "
                "Introduce measure words/classifiers in pinyin: 'yi ge boy', 'yi zhi cat'. "
                "Switch conjunctions (and->he, but->danshi, because->yinwei). "
                "Keep English word order (SVO). Content words in English."
            ),
            3: (
                "~30% Chinese. Simple sentences in Chinese (pinyin). "
                "Coverbs replace prepositions: zai (at/in), cong (from), gen (with). "
                "Time-before-verb order: 'She yesterday store zai went.' "
                "Complex sentences mostly English."
            ),
            4: (
                "~50% Chinese. Most sentences translated in pinyin. "
                "Aspect markers: le (completed), zai (ongoing). No verb conjugation. "
                "Common nouns (ren, jia, shui, tian). English for harder vocabulary."
            ),
            5: (
                "~70% Chinese. Most text in pinyin. Pronouns (wo, ni, ta), "
                "possessive de. Question particles (ma). English for rare words."
            ),
            6: (
                "~90% Chinese. Nearly all in pinyin. "
                "English only for specialized terms."
            ),
            7: (
                "100% simplified Chinese in pinyin. "
                "Simple vocabulary, natural sentence flow."
            ),
        },
    },
    "ko": {
        "name": "Korean",
        "flag": "\U0001f1f0\U0001f1f7",
        "script": "hangul",
        "family": "sov",
        "level_guidance": {
            1: (
                "~5% Korean. Add greetings in romanization: annyeonghaseyo, gamsahamnida, "
                "annyeonghi gaseyo. Honorifics (-nim, -ssi). "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Korean. Drop English articles (Korean has none). "
                "Introduce particles alongside prepositions: 'to (e) the store', "
                "'in (eseo) the park', 'of (ui) the king'. "
                "Keep English word order (SVO). Romanization."
            ),
            3: (
                "~30% Korean. Remove English prepositions — only particles remain. "
                "Begin SOV word order: 'The cat fish reul ate.' "
                "Topic marker eun/neun appears. Content words still English. Romanization."
            ),
            4: (
                "~50% Korean. Full SOV word order. Korean verb forms (polite -ayo/-eoyo): "
                "'Cat eun fish reul meogeoyo.' Common adjectives (keun, jageun). "
                "Pronouns start switching. Nouns mostly English. Romanization."
            ),
            5: (
                "~70% Korean. Common nouns in Korean. Past tense (-asseo/-eosseo). "
                "Most grammar fully Korean. English only for less common words. Romanization."
            ),
            6: (
                "~90% Korean. Nearly all Korean in romanization. "
                "English only for rare terms."
            ),
            7: (
                "100% simplified Korean in romanization. "
                "Simple vocabulary, natural sentence flow."
            ),
        },
    },
    "he": {
        "name": "Hebrew",
        "flag": "\U0001f1ee\U0001f1f1",
        "script": "hebrew",
        "family": "medium",
        "level_guidance": {
            1: (
                "~5% Hebrew. Add greetings in transliteration: shalom, toda, bevakasha, lehitraot. "
                "Cultural terms. Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Hebrew. Switch the definite article: 'the' -> 'ha-' prefix in transliteration. "
                "Drop indefinite articles. Switch conjunctions (and->ve-, but->aval, because->ki). "
                "Prepositions (in->be-, to->le-, from->mi-). "
                "Adjectives shift to after-noun position. Content words in English."
            ),
            3: (
                "~30% Hebrew. Simple sentences fully in Hebrew (transliterated). "
                "Complex sentences mostly English with Hebrew function words."
            ),
            4: (
                "~50% Hebrew. Most sentences translated in transliteration. "
                "Hebrew verb patterns (binyanim). Common nouns (bayit, ish, isha, yom, zman). "
                "English for harder vocabulary."
            ),
            5: (
                "~70% Hebrew. Most text in transliterated Hebrew. "
                "Past tense conjugations. Pronouns (ani, ata/at, hu/hi). "
                "English only for rare vocabulary."
            ),
            6: (
                "~90% Hebrew. Nearly all text in transliterated Hebrew. "
                "English only for specialized terms."
            ),
            7: (
                "100% simplified Hebrew (transliterated). "
                "Simple vocabulary, natural sentence flow."
            ),
        },
    },
    "ar": {
        "name": "Arabic",
        "flag": "\U0001f1f8\U0001f1e6",
        "script": "arabic",
        "family": "medium",
        "level_guidance": {
            1: (
                "~5% Arabic. Add greetings in transliteration: marhaba, shukran, ma'a salama. "
                "Cultural terms (inshallah, habibi). "
                "Keep all English grammar and word order intact."
            ),
            2: (
                "~15% Arabic. Switch the definite article: 'the' -> 'al-' in transliteration. "
                "Drop indefinite articles. Switch conjunctions (and->wa, but->lakin, because->li-anna). "
                "Prepositions (in->fi, from->min, to->ila, on->ala, with->ma'a). "
                "Content words in English."
            ),
            3: (
                "~30% Arabic. Simple sentences in Arabic (transliterated). "
                "Complex sentences mostly English with Arabic function words."
            ),
            4: (
                "~50% Arabic. Most sentences translated in transliteration. "
                "Arabic verb conjugation (prefix system). Common nouns (bayt, rajul, yawm, waqt). "
                "English for harder vocabulary."
            ),
            5: (
                "~70% Arabic. Most text in transliterated Arabic. "
                "Past tense (perfect form). Attached pronoun suffixes. "
                "English only for rare vocabulary."
            ),
            6: (
                "~90% Arabic. Nearly all text in transliterated Arabic. "
                "English only for specialized terms."
            ),
            7: (
                "100% simplified Arabic (transliterated). "
                "Simple vocabulary, natural MSA."
            ),
        },
    },
}

SOURCE_LANGUAGES = {code: {"name": lang["name"], "flag": lang["flag"]} for code, lang in LANGUAGES.items()}

LANGUAGE_CODES = list(LANGUAGES.keys())

FLAGS = {code: lang["flag"] for code, lang in LANGUAGES.items()}


def get_source_language_name(code: str) -> str:
    """Get source language name by code. Falls back to the code itself."""
    if code in SOURCE_LANGUAGES:
        return SOURCE_LANGUAGES[code]["name"]
    if code in LANGUAGES:
        return LANGUAGES[code]["name"]
    return code


def get_language(code: str) -> dict:
    """Get language config by code. Raises ValueError if not found."""
    if code not in LANGUAGES:
        raise ValueError(f"Unsupported language: {code}. Supported: {LANGUAGE_CODES}")
    return LANGUAGES[code]
