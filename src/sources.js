/* Trusted sources: a catalogue by topic, topic detection for a claim, and a reliability rating for links */
const SRC = (() => {
  const g = (site, q) => 'https://www.google.com/search?q=' + encodeURIComponent('site:' + site + ' ' + q);
  const S = {
    wiki: { name: 'Википедия', domain: 'ru.wikipedia.org', home: 'https://ru.wikipedia.org', kind: 'Энциклопедия', why: 'Статьи со ссылками на источники. Хороша для старта, но проверяй сноски.', url: q => 'https://ru.wikipedia.org/w/index.php?search=' + encodeURIComponent(q) },
    britannica: { name: 'Britannica', domain: 'britannica.com', home: 'https://www.britannica.com', kind: 'Энциклопедия', why: 'Статьи пишут и проверяют учёные и редакторы с 1768 года.', url: q => 'https://www.britannica.com/search?query=' + encodeURIComponent(q) },
    bre: { name: 'Большая российская энциклопедия', domain: 'bigenc.ru', home: 'https://bigenc.ru', kind: 'Энциклопедия', why: 'Научная энциклопедия, статьи подписаны авторами.', url: q => g('bigenc.ru', q) },
    scholar: { name: 'Google Scholar', domain: 'scholar.google.com', home: 'https://scholar.google.com', kind: 'Научные статьи', why: 'Поиск по научным публикациям. Если исследования здесь нет, скорее всего его не существует.', url: q => 'https://scholar.google.com/scholar?q=' + encodeURIComponent(q) },
    cyber: { name: 'КиберЛенинка', domain: 'cyberleninka.ru', home: 'https://cyberleninka.ru', kind: 'Научные статьи', why: 'Открытая библиотека научных статей на русском языке.', url: q => 'https://cyberleninka.ru/search?q=' + encodeURIComponent(q) },
    factcheck: { name: 'Google Fact Check Explorer', domain: 'toolbox.google.com', home: 'https://toolbox.google.com/factcheck/explorer', kind: 'Фактчекинг', why: 'Собирает проверки фактов от независимых редакций со всего мира.', url: q => 'https://toolbox.google.com/factcheck/explorer/search/' + encodeURIComponent(q) + ';hl=ru' },
    nasa: { name: 'NASA', domain: 'nasa.gov', home: 'https://www.nasa.gov', kind: 'Космос', why: 'Официальные данные космического агентства США.', url: q => g('nasa.gov', q) },
    esa: { name: 'ESA', domain: 'esa.int', home: 'https://www.esa.int', kind: 'Космос', why: 'Европейское космическое агентство.', url: q => g('esa.int', q) },
    elementy: { name: 'Элементы', domain: 'elementy.ru', home: 'https://elementy.ru', kind: 'Научпоп', why: 'Научно-популярный сайт, статьи пишут учёные.', url: q => g('elementy.ru', q) },
    who: { name: 'ВОЗ', domain: 'who.int', home: 'https://www.who.int/ru', kind: 'Здоровье', why: 'Всемирная организация здравоохранения, официальные рекомендации.', url: q => g('who.int', q) },
    pubmed: { name: 'PubMed', domain: 'pubmed.ncbi.nlm.nih.gov', home: 'https://pubmed.ncbi.nlm.nih.gov', kind: 'Медицина', why: 'База медицинских исследований Национальной библиотеки медицины США.', url: q => 'https://pubmed.ncbi.nlm.nih.gov/?term=' + encodeURIComponent(q) },
    cochrane: { name: 'Cochrane', domain: 'cochranelibrary.com', home: 'https://www.cochranelibrary.com', kind: 'Медицина', why: 'Обзоры, которые сводят вместе все исследования по вопросу.', url: q => g('cochranelibrary.com', q) },
    factbook: { name: 'CIA World Factbook', domain: 'cia.gov', home: 'https://www.cia.gov/the-world-factbook/', kind: 'Страны', why: 'Справочник по всем странам: население, площадь, столицы.', url: q => g('cia.gov/the-world-factbook', q) },
    owid: { name: 'Our World in Data', domain: 'ourworldindata.org', home: 'https://ourworldindata.org', kind: 'Статистика', why: 'Графики и данные с указанием первоисточника для каждой цифры.', url: q => 'https://ourworldindata.org/search?q=' + encodeURIComponent(q) },
    worldbank: { name: 'Всемирный банк: данные', domain: 'data.worldbank.org', home: 'https://data.worldbank.org', kind: 'Статистика', why: 'Официальная статистика по экономике и населению стран.', url: q => g('data.worldbank.org', q) },
    statkz: { name: 'Бюро национальной статистики РК', domain: 'stat.gov.kz', home: 'https://stat.gov.kz', kind: 'Казахстан', why: 'Официальная статистика Казахстана.', url: q => g('stat.gov.kz', q) },
    govkz: { name: 'Портал gov.kz', domain: 'gov.kz', home: 'https://www.gov.kz', kind: 'Казахстан', why: 'Официальные сайты госорганов Казахстана.', url: q => g('gov.kz', q) },
    adilet: { name: 'Әділет', domain: 'adilet.zan.kz', home: 'https://adilet.zan.kz', kind: 'Законы', why: 'Официальная база законов Республики Казахстан.', url: q => g('adilet.zan.kz', q) },
    pravo: { name: 'Официальный интернет-портал правовой информации', domain: 'pravo.gov.ru', home: 'http://pravo.gov.ru', kind: 'Законы', why: 'Официальные тексты законов России.', url: q => g('pravo.gov.ru', q) },
    nbk: { name: 'Национальный банк РК', domain: 'nationalbank.kz', home: 'https://nationalbank.kz', kind: 'Финансы', why: 'Официальные курсы, ставки и финансовая статистика.', url: q => g('nationalbank.kz', q) },
    imf: { name: 'МВФ', domain: 'imf.org', home: 'https://www.imf.org', kind: 'Финансы', why: 'Данные и прогнозы Международного валютного фонда.', url: q => g('imf.org', q) },
    wikiquote: { name: 'Викицитатник', domain: 'ru.wikiquote.org', home: 'https://ru.wikiquote.org', kind: 'Цитаты', why: 'Цитаты с указанием, где они сказаны, и раздел «Приписываемые».', url: q => 'https://ru.wikiquote.org/w/index.php?search=' + encodeURIComponent(q) },
    qi: { name: 'Quote Investigator', domain: 'quoteinvestigator.com', home: 'https://quoteinvestigator.com', kind: 'Цитаты', why: 'Расследует, кто на самом деле сказал известную фразу.', url: q => 'https://quoteinvestigator.com/?s=' + encodeURIComponent(q) },
    feb: { name: 'ФЭБ: русская литература', domain: 'feb-web.ru', home: 'http://feb-web.ru', kind: 'Литература', why: 'Академические издания классиков и словари.', url: q => g('feb-web.ru', q) },
    arzamas: { name: 'Arzamas', domain: 'arzamas.academy', home: 'https://arzamas.academy', kind: 'Гуманитарные науки', why: 'Курсы и статьи историков и филологов.', url: q => g('arzamas.academy', q) },
    unesco: { name: 'ЮНЕСКО', domain: 'unesco.org', home: 'https://www.unesco.org/ru', kind: 'Культура', why: 'Официальные данные о наследии и образовании.', url: q => g('unesco.org', q) },
  };

  const TOPICS = [
    { id: 'kz', name: 'Казахстан', re: /(казахстан|астан|алмат|шымкент|тенге|абай|казах)/, src: ['statkz', 'govkz', 'adilet', 'britannica'] },
    { id: 'health', name: 'Здоровье', re: /(здоров|болезн|лекарств|таблет|витамин|врач|вирус|бактери|кост|мозг|сердц|кров|иммун|питани|диет|сон |сна |симптом|лечени|прививк|вакцин)/, src: ['who', 'pubmed', 'cochrane'] },
    { id: 'law', name: 'Право', re: /(закон|кодекс|штраф|суд|конституц|стать[яи] \d|наказани|прав[ао] (на|граждан))/, src: ['adilet', 'pravo'] },
    { id: 'money', name: 'Экономика', re: /(налог|кредит|инвест|банк|инфляц|курс (доллар|валют|тенге)|ввп|экономик|валют|бюджет|зарплат)/, src: ['nbk', 'worldbank', 'imf', 'owid'] },
    { id: 'space', name: 'Космос', re: /(полет|витк|гагарин|космос|космонавт|астронавт|планет|звезд|галактик|луна|луны|луну|солнц|орбит|nasa|наса|ракет|спутник|марс|юпитер)/, src: ['nasa', 'esa', 'britannica', 'elementy'] },
    { id: 'science', name: 'Наука', re: /(физик|хими|скорост|атом|молекул|элемент|энерги|температур|кипит|давлени|гравитац|свет|эволюц|клетк|днк|ген[аоы ]|вид[аы] |исследовани|ученые|ученых|журнал|nature|doi|учат|школьник)/, src: ['elementy', 'scholar', 'cyber', 'britannica'] },
    { id: 'geo', name: 'География', re: /(стран|столиц|гора|горы|рек[аиу]|озер|океан|мор[ея]|материк|населени|площад|климат|город|эверест|пустын)/, src: ['factbook', 'britannica', 'owid', 'worldbank'] },
    { id: 'history', name: 'История', re: /((^|[^а-я])(век|века|веке|веку|хан|хана|ханы|царь|царя|царю)([^а-я]|$)|войн|импери|король|революци|родил|умер|основан|истори|ссср|древн|династи|битв)/, src: ['bre', 'britannica', 'arzamas'] },
    { id: 'quote', name: 'Цитаты', re: /(цитат|сказал|говорил|произнес|«[^»]{12,}»)/, src: ['wikiquote', 'qi'] },
    { id: 'lit', name: 'Литература', re: /(роман|книг|поэт|писател|стих|поэм|повест|рассказ|автор|написал)/, src: ['feb', 'bre', 'britannica'] },
    { id: 'culture', name: 'Культура', re: /(картин|художник|музе|архитектур|памятник|театр|композитор|музык)/, src: ['britannica', 'unesco', 'arzamas'] },
    { id: 'tech', name: 'Технологии', re: /(интернет|компьютер|iphone|айфон|chatgpt|openai|google|гугл|apple|microsoft|нейросет|искусственн|программ|смартфон|ios|android)/, src: ['britannica', 'wiki', 'scholar'] },
  ];

  const norm = s => s.toLowerCase().replace(/ё/g, 'е');
  function topics(text) {
    const n = norm(text);
    return TOPICS.filter(t => t.re.test(n));
  }
  /* compact search query: names and meaningful words, no filler */
  const STOP = new Set('и в во на по с со к от до из за о об что это как для при был была было были который которая которые также кстати около всего очень его ее их он она они я мы вы ты бы же ли не ни а но или то так уже еще году года год лет время'.split(' '));
  function query(text) {
    const words = text.replace(/[«»"“”„()\[\],.;:!?—–-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(norm(w)));
    const names = words.filter((w, i) => /^[A-ZА-ЯЁ]/.test(w) && i > 0);
    const rest = words.filter(w => !names.includes(w));
    return names.concat(rest).slice(0, 7).join(' ');
  }
  function forClaim(text, max = 4, ctx = '') {
    const ts = topics(text + ' ' + ctx);
    let q = query(text);
    if (ctx && !/[A-ZА-ЯЁ]/.test(text.slice(1))) q = ctx.split(' ').filter(Boolean).slice(0, 2).join(' ') + ' ' + q;
    const ids = [];
    ts.forEach(t => t.src.forEach(id => { if (!ids.includes(id)) ids.push(id); }));
    if (!ids.includes('wiki')) ids.push('wiki');
    const list = ids.slice(0, max).map(id => ({ id, ...S[id], link: S[id].url(q) }));
    list.push({ id: 'factcheck', ...S.factcheck, link: S.factcheck.url(q) });
    return { topics: ts.map(t => t.name), items: list, q };
  }

  /* link reliability */
  const TRUSTED = [/\.gov(\.[a-z]{2})?$/, /\.gov\.kz$/, /\.edu(\.[a-z]{2})?$/, /\.edu\.kz$/, /\.ac\.[a-z]{2}$/, /(^|\.)wikipedia\.org$/, /(^|\.)britannica\.com$/, /(^|\.)bigenc\.ru$/, /(^|\.)who\.int$/, /(^|\.)nasa\.gov$/, /(^|\.)esa\.int$/, /(^|\.)un\.org$/, /(^|\.)unesco\.org$/, /(^|\.)nature\.com$/, /(^|\.)science\.org$/, /(^|\.)ncbi\.nlm\.nih\.gov$/, /(^|\.)cochranelibrary\.com$/, /(^|\.)cyberleninka\.ru$/, /(^|\.)doi\.org$/, /(^|\.)worldbank\.org$/, /(^|\.)imf\.org$/, /(^|\.)ourworldindata\.org$/, /(^|\.)adilet\.zan\.kz$/, /(^|\.)stat\.gov\.kz$/, /(^|\.)nationalbank\.kz$/, /(^|\.)arxiv\.org$/];
  const MEDIA = [/(^|\.)bbc\.(com|co\.uk)$/, /(^|\.)reuters\.com$/, /(^|\.)apnews\.com$/, /(^|\.)nytimes\.com$/, /(^|\.)theguardian\.com$/, /(^|\.)tass\.ru$/, /(^|\.)ria\.ru$/, /(^|\.)kazinform\.kz$/, /(^|\.)tengrinews\.kz$/, /(^|\.)kursiv\.media$/, /(^|\.)forbes\.(com|kz|ru)$/, /(^|\.)rbc\.ru$/];
  const WEAK = [/(^|\.)(pinterest|facebook|instagram|tiktok|vk|t\.me|telegram|twitter|x|youtube|reddit|quora|otvet\.mail|livejournal|dzen|zen\.yandex|medium|blogspot|wordpress)\./, /^t\.me$/, /^x\.com$/];
  function rateUrl(u) {
    let host;
    try { host = new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return null; }
    if (TRUSTED.some(r => r.test(host))) return { host, level: 'trusted', label: 'Надёжный тип сайта', why: `${host}: официальный, научный или энциклопедический сайт. Открой ссылку и убедись, что страница существует и говорит то же самое.` };
    if (MEDIA.some(r => r.test(host))) return { host, level: 'media', label: 'СМИ', why: `${host}: известное СМИ. Хорошо для новостей, но для фактов лучше найти первоисточник, на который ссылается статья.` };
    if (WEAK.some(r => r.test(host))) return { host, level: 'weak', label: 'Соцсеть или блог', why: `${host}: соцсеть, блог или форум. Здесь любой может написать что угодно, это не источник факта.` };
    return { host, level: 'unknown', label: 'Неизвестный сайт', why: `${host}: мы не знаем этот сайт. ИИ иногда выдумывает адреса. Открой ссылку и проверь автора, дату и ссылки на первоисточники.` };
  }

  return { S, TOPICS, topics, forClaim, rateUrl, query };
})();
if (typeof module !== 'undefined') module.exports = SRC;
