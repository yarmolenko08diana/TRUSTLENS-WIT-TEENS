/* TrustLens engine: splits an AI answer into claims, finds hallucination signals,
   checks claims against a local fact base and arithmetic, and explains the verdict. */
const TL = (() => {
  const SR = typeof SRC !== 'undefined' ? SRC : require('./sources.js');
  const NOW_YEAR = new Date().getFullYear();
  const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[  ]/g, ' ');

  /* ---------- 1. Splitting into claims ---------- */
  const ABBR = new Set(['г','гг','т','е','д','п','др','пр','см','им','ул','стр','н','э','в','вв','ок','рис','табл','млн','млрд','тыс','проф','акад','mr','dr','vs','e','g','i','etc','ст','чел','руб','долл','англ','лат','греч','напр']);
  function splitClaims(text) {
    const claims = [];
    let start = 0;
    const push = (s, e) => {
      let seg = text.slice(s, e);
      const lead = seg.match(/^\s*(?:(?:[-–—*•]|\d{1,2}[.)])\s+)?/)[0].length;
      s += lead; seg = seg.slice(lead);
      const trail = seg.length - seg.trimEnd().length;
      e -= trail; seg = seg.trimEnd();
      if (seg.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').length >= 3) {
        claims.push({ id: claims.length + 1, text: seg, start: s, end: e, n: norm(seg) });
      }
    };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') { push(start, i); start = i + 1; continue; }
      if ('.!?…'.includes(ch)) {
        let j = i;
        while (j + 1 < text.length && '.!?…"»)”'.includes(text[j + 1])) j++;
        const next = text[j + 1];
        if (next !== undefined && !/\s/.test(next)) continue;
        if (ch === '.') {
          const before = text.slice(start, i).match(/([A-Za-zА-Яа-яЁё]+)$/);
          if (before && (ABBR.has(before[1].toLowerCase()) || /^[A-ZА-ЯЁ]$/.test(before[1]))) continue;
        }
        const rest = text.slice(j + 1).match(/^[ \t]*(\S)/);
        if (rest && /[a-zа-яё]/.test(rest[1])) continue;
        push(start, j + 1); start = j + 1; i = j;
      }
    }
    push(start, text.length);
    return claims;
  }

  /* ---------- 2. Numbers ---------- */
  const WORDNUM = { 'один':1,'одна':1,'два':2,'две':2,'три':3,'четыре':4,'пять':5,'шесть':6,'семь':7,'восемь':8,'девять':9,'десять':10,'одиннадцать':11,'двенадцать':12,'двух':2,'трех':3,'четырех':4,'пяти':5,'шести':6,'семи':7,'восьми':8,'девяти':9,'десяти':10,'одного':1,'одной':1 };
  const MULT = { 'тыс':1e3,'тысяч':1e3,'тысячи':1e3,'млн':1e6,'миллион':1e6,'миллиона':1e6,'миллионов':1e6,'млрд':1e9,'миллиард':1e9,'миллиарда':1e9,'миллиардов':1e9 };
  function numbers(n) {
    const out = [];
    const re = /(\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,](\d+))?(?:\s*(тыс[а-яa-z]*|млн|миллион[а-яa-z]*|млрд|миллиард[а-яa-z]*))?/g;
    let m;
    while ((m = re.exec(n))) {
      let v = parseFloat(m[1].replace(/ /g, '') + (m[2] ? '.' + m[2] : ''));
      let mult = 1;
      if (m[3]) { const k = Object.keys(MULT).find(k => m[3].startsWith(k)); if (k) mult = MULT[k]; }
      out.push({ v: v * mult, raw: m[0].trim(), decimals: !!m[2], isYear: !m[2] && !m[3] && /^(1[0-9]{3}|20[0-9]{2})$/.test(m[1]) });
    }
    for (const w of n.split(/[^а-я]+/)) if (WORDNUM[w]) out.push({ v: WORDNUM[w], raw: w, decimals: false, isYear: false });
    return out;
  }
  const years = n => numbers(n).filter(x => x.isYear).map(x => x.v);

  /* ---------- 3. Local fact base ---------- */
  const W = t => 'https://ru.wikipedia.org/wiki/' + encodeURIComponent(t);
  const FACTS = [
    { when: [/гагарин/, /(полет|космос|восток)/], unless: /(открыт[а-яa-z]* космос|витк|минут)/, year: [1961], fact: 'Юрий Гагарин полетел в космос 12 апреля 1961 года.', src: W('Восток-1') },
    { when: [/гагарин/, /витк/], num: { vals: [1], tol: 0, min: 1, max: 30 }, fact: 'Гагарин совершил один виток вокруг Земли.', src: W('Восток-1') },
    { when: [/(восток-1|гагарин)/, /минут/], num: { vals: [108], tol: 2, min: 20, max: 500 }, fact: 'Полёт «Восток-1» длился 108 минут.', src: W('Восток-1') },
    { when: [/(открыт[а-яa-z]* космос|выход[а-яa-z]* в космос|выш[а-яa-z]* в космос)/, /перв/], word: /леонов/, wrong: /(гагарин|армстронг|терешков|титов)/, year: [1965], fact: 'Первым в открытый космос вышел Алексей Леонов 18 марта 1965 года.', src: W('Леонов, Алексей Архипович') },
    { when: [/перв[а-яa-z]* женщин/, /космос/], word: /терешков/, wrong: /(савицк|ride|райд)/, year: [1963], fact: 'Первая женщина в космосе — Валентина Терешкова, 1963 год.', src: W('Терешкова, Валентина Владимировна') },
    { when: [/(армстронг|высадк[а-яa-z]* на луну|ступил[а-яa-z]* на луну|аполлон.?11|apollo.?11)/], year: [1969], fact: 'Высадка «Аполлона-11» на Луну и первый шаг Нила Армстронга — июль 1969 года.', src: W('Аполлон-11') },
    { when: [/(диан|diana)/, /(погиб|умер|смерт|скончал|катастроф|авари|died|death|crash|killed)/], unless: /(расследован|дознан|inquest|investigat|годовщин|anniversar|спустя|later)/, year: [1997], fact: 'Принцесса Диана погибла 31 августа 1997 года в автокатастрофе в туннеле под мостом Альма в Париже.', src: 'https://www.britannica.com/biography/Diana-princess-of-Wales' },
    { when: [/(диан|diana)/, /(погиб|умер|смерт|скончал|катастроф|авари|died|death|crash|killed)/], word: /(париж|paris)/, strict: false, fact: 'Авария, в которой погибла Диана, произошла в Париже.', src: 'https://www.britannica.com/biography/Diana-princess-of-Wales' },
    { when: [/(диан|diana)/, /(лет|years old|возраст|aged)/, /(погиб|умер|смерт|скончал|было|died|was)/], unless: /(замуж|свадьб|married|родил|born)/, num: { vals: [36], tol: 0, min: 15, max: 99 }, fact: 'На момент гибели Диане было 36 лет.', src: 'https://www.britannica.com/biography/Diana-princess-of-Wales' },
    { when: [/(похорон|funeral)/, /(диан|diana|вестминстер|westminster)/], year: [1997], fact: 'Похороны Дианы прошли 6 сентября 1997 года в Вестминстерском аббатстве.', src: 'https://www.bbc.co.uk/news/uk-40820488' },
    { when: [/(диан|diana)/, /(родил|born)/], unless: /(сын|son|уильям|гарри|william|harry)/, year: [1961, 1997], fact: 'Диана Спенсер родилась 1 июля 1961 года.', src: 'https://www.britannica.com/biography/Diana-princess-of-Wales' },
    { when: [/колумб/, /америк/], year: [1492], fact: 'Колумб достиг Америки в 1492 году.', src: W('Открытие Америки') },
    { when: [/втор[а-яa-z]* миров[а-яa-z]* войн/], year: [1939, 1945], fact: 'Вторая мировая война шла с 1939 по 1945 год.', src: W('Вторая мировая война') },
    { when: [/перв[а-яa-z]* миров[а-яa-z]* войн/], year: [1914, 1918], fact: 'Первая мировая война шла с 1914 по 1918 год.', src: W('Первая мировая война') },
    { when: [/(ссср|советск[а-яa-z]* союз)/, /(распа|прекратил)/], year: [1991], fact: 'СССР распался в 1991 году.', src: W('Распад СССР') },
    { when: [/казахстан/, /независимост/], year: [1991], fact: 'Казахстан провозгласил независимость 16 декабря 1991 года.', src: W('Казахстан') },
    { when: [/чернобыл/, /(авари|катастроф)/], year: [1986], fact: 'Авария на Чернобыльской АЭС произошла 26 апреля 1986 года.', src: W('Авария на Чернобыльской АЭС') },
    { when: [/пушкин/, /родил/], year: [1799], fact: 'А. С. Пушкин родился в 1799 году.', src: W('Пушкин, Александр Сергеевич') },
    { when: [/абай/, /родил/], year: [1845], fact: 'Абай Кунанбаев родился в 1845 году.', src: W('Абай Кунанбаев') },
    { when: [/войн[а-яa-z]* и мир/, /(написал|автор|создал|роман)/], word: /толст/, fact: 'Роман «Война и мир» написал Лев Толстой.', src: W('Война и мир') },
    { when: [/маленьк[а-яa-z]* принц/, /(написал|автор|создал)/], word: /(сент|экзюпер)/, fact: '«Маленького принца» написал Антуан де Сент-Экзюпери (1943).', src: W('Маленький принц') },
    { when: [/гарри поттер/, /(написал|автор|создал)/], word: /роулинг/, fact: 'Книги о Гарри Поттере написала Джоан Роулинг.', src: W('Гарри Поттер') },
    { when: [/гарри поттер/, /(вышл|вышел|опубликов|перв[а-яa-z]* (книг|част))/], unless: /фильм/, year: [1997], fact: 'Первая книга о Гарри Поттере вышла в 1997 году.', src: W('Гарри Поттер и философский камень') },
    { when: [/гамлет/, /(написал|автор|создал)/], word: /шекспир/, fact: '«Гамлета» написал Уильям Шекспир.', src: W('Гамлет') },
    { when: [/(мон[а-яa-z]* лиз|джоконд)/, /(написал|автор|создал|кист)/], word: /(леонардо|да винчи)/, fact: '«Мону Лизу» написал Леонардо да Винчи.', src: W('Мона Лиза') },
    { when: [/(периодическ[а-яa-z]* (систем|таблиц|закон))/, /(открыл|создал|автор|придумал|разработал)/], word: /менделеев/, fact: 'Периодический закон открыл Дмитрий Менделеев (1869).', src: W('Периодическая система химических элементов') },
    { when: [/(всемирн[а-яa-z]* тяготени|закон[а-яa-z]* гравитаци)/, /(открыл|сформулировал|автор)/], word: /ньютон/, fact: 'Закон всемирного тяготения сформулировал Исаак Ньютон.', src: W('Закон всемирного тяготения') },
    { when: [/теори[а-яa-z]* относительност/, /(создал|автор|разработал|открыл|придумал)/], word: /эйнштейн/, fact: 'Теорию относительности создал Альберт Эйнштейн.', src: W('Теория относительности') },
    { when: [/интернет/, /(изобр|создал|придумал)/], wrong: /(гейтс|джобс|цукерберг|маск)/, fact: 'Интернет вырос из сети ARPANET (1969); его протоколы TCP/IP разработали Винтон Серф и Роберт Кан, а веб придумал Тим Бернерс-Ли. Билл Гейтс к этому отношения не имеет.', src: W('Интернет') },
    { when: [/(всемирн[а-яa-z]* паутин|world wide web|\bwww\b)/, /(изобр|создал|придумал)/], word: /бернерс/, fact: 'Всемирную паутину придумал Тим Бернерс-Ли в 1989–1991 годах.', src: W('Всемирная паутина') },
    { when: [/(iphone|айфон)/, /перв/], year: [2007], fact: 'Первый iPhone представили в январе 2007 года.', src: W('IPhone (первое поколение)') },
    { when: [/(chatgpt|чатгпт|чат gpt)/, /(представ|запущ|выпущ|появил|вышел)/], year: [2022], fact: 'ChatGPT открыли для всех 30 ноября 2022 года.', src: W('ChatGPT') },
    { when: [/(google|гугл)/, /основ/], year: [1998], fact: 'Google основан в 1998 году.', src: W('Google') },
    { when: [/(двойн[а-яa-z]* спирал|структур[а-яa-z]* днк)/, /(открыл|описал|установил|открыт)/], year: [1953], fact: 'Двойную спираль ДНК описали Уотсон и Крик в 1953 году.', src: W('Дезоксирибонуклеиновая кислота') },
    { when: [/столиц/, /австрали/], word: /канберр/, fact: 'Столица Австралии — Канберра, а не Сидней.', src: W('Канберра') },
    { when: [/столиц/, /казахстан/], word: /астан/, fact: 'Столица Казахстана — Астана (с 1997 года).', src: W('Астана') },
    { when: [/столиц/, /канад/], word: /оттав/, fact: 'Столица Канады — Оттава.', src: W('Оттава') },
    { when: [/столиц/, /турци/], word: /анкар/, fact: 'Столица Турции — Анкара, а не Стамбул.', src: W('Анкара') },
    { when: [/столиц/, /бразили/], word: /бразилиа/, fact: 'Столица Бразилии — город Бразилиа.', src: W('Бразилиа') },
    { when: [/столиц/, /(сша|соединенн[а-яa-z]* штат)/], word: /вашингтон/, fact: 'Столица США — Вашингтон.', src: W('Вашингтон') },
    { when: [/(эверест|джомолунгм)/, /(высот|метр|\d)/], num: { vals: [8849, 8848], tol: 3, min: 5000, max: 12000 }, fact: 'Высота Эвереста — 8849 м над уровнем моря.', src: W('Джомолунгма') },
    { when: [/байкал/, /глуб/, /\d/], num: { vals: [1642], tol: 5, min: 300, max: 5000 }, fact: 'Максимальная глубина Байкала — 1642 м.', src: W('Байкал') },
    { when: [/планет/, /солнечн[а-яa-z]* систем/], unless: /(карликов|спутник|луны|лун )/, num: { vals: [8], tol: 0, min: 5, max: 15 }, fact: 'В Солнечной системе 8 планет. Плутон с 2006 года считается карликовой планетой.', src: W('Солнечная система') },
    { when: [/(ближайш[а-яa-z]* к солнцу|к солнцу ближ)/, /планет/], word: /меркури/, fact: 'Ближайшая к Солнцу планета — Меркурий.', src: W('Меркурий') },
    { when: [/(самая больш|крупнейш)[а-яa-z]* планет/], word: /юпитер/, fact: 'Самая большая планета Солнечной системы — Юпитер.', src: W('Юпитер') },
    { when: [/лун/, /(расстояни|удален|находится|км)/, /земл/], unless: /(диаметр|радиус|масс)/, num: { vals: [384400], tol: 25000, min: 10000, max: 1e8 }, fact: 'Среднее расстояние от Земли до Луны — около 384 400 км.', src: W('Луна') },
    { when: [/солнц/, /(расстояни|удален)/, /земл/], num: { vals: [149.6e6], tol: 3e6, min: 1e5, max: 1e10 }, fact: 'Среднее расстояние от Земли до Солнца — около 149,6 млн км.', src: W('Астрономическая единица') },
    { when: [/скорост[а-яa-z]* свет/], num: { vals: [299792, 300000, 299792458, 300000000], tol: 1500, min: 1000, max: 1e10 }, fact: 'Скорость света в вакууме — 299 792 км/с (около 300 000 км/с).', src: W('Скорость света') },
    { when: [/ускорени[а-яa-z]* свободн[а-яa-z]* падени/], num: { vals: [9.8, 9.81], tol: 0.06, min: 1, max: 100 }, fact: 'Ускорение свободного падения у поверхности Земли — около 9,8 м/с².', src: W('Ускорение свободного падения') },
    { when: [/вод/, /кип/, /(°|градус)/], unless: /(гор|эверест|высот|пониж|ниже|соле|давлени[а-яa-z]* (ниже|выше|повыш))/, num: { vals: [100], tol: 0.5, min: 20, max: 400 }, fact: 'При нормальном атмосферном давлении вода кипит при 100 °C.', src: W('Кипение') },
    { when: [/вод/, /(замерза|лед|леде)/, /(°|градус)/], unless: /(соле|морск)/, num: { vals: [0], tol: 0.5, min: -100, max: 100 }, fact: 'Чистая вода замерзает при 0 °C.', src: W('Лёд') },
    { when: [/кост/, /(взросл|скелет|человек)/], unless: /(ребен|младен|новорожд)/, num: { vals: [206], tol: 0, min: 100, max: 400 }, fact: 'У взрослого человека 206 костей.', src: W('Скелет человека') },
    { when: [/хромосом/, /человек/], num: { vals: [46, 23], tol: 0, min: 10, max: 100 }, fact: 'У человека 46 хромосом (23 пары).', src: W('Кариотип человека') },
    { when: [/сердц/, /камер/], unless: /(рыб|лягуш|земноводн)/, num: { vals: [4], tol: 0, min: 1, max: 10 }, fact: 'Сердце человека четырёхкамерное.', src: W('Сердце') },
    { when: [/зуб/, /взросл/], num: { vals: [32, 28], tol: 0, min: 10, max: 60 }, fact: 'У взрослого человека 28–32 постоянных зуба.', src: W('Зубы человека') },
    { when: [/(оборот|облет|вращ)/, /вокруг солнц/, /(дн|сут)/], num: { vals: [365, 365.25, 366], tol: 0.3, min: 100, max: 1000 }, fact: 'Земля делает оборот вокруг Солнца примерно за 365,25 суток.', src: W('Год') },
    { when: [/площад/, /казахстан/], num: { vals: [2724900], tol: 30000, min: 1e5, max: 1e8 }, fact: 'Площадь Казахстана — 2 724 900 км², 9-е место в мире.', src: W('Казахстан') },
    { when: [/евгени[а-я]* онегин/, /(написал|автор|создал|роман)/], word: /пушкин/, fact: 'Роман «Евгений Онегин» написал Александр Пушкин.', src: W('Евгений Онегин') },
    { when: [/антибиотик/, /(грипп|простуд|орви|вирус)/], unless: /(не помога|не действ|бесполез|не лечат|не нужн)/, myth: true, fact: 'Антибиотики не действуют на вирусы, а грипп и простуду вызывают вирусы. Лечение назначает врач.', src: 'https://www.who.int/ru/news-room/fact-sheets/detail/antibiotic-resistance' },
    { when: [/сахар/, /гиперактивн/], unless: /(миф|не делает|не вызывает)/, myth: true, fact: 'Это миф. Исследования не нашли связи между сахаром и гиперактивностью у детей.', src: W('Сахароза') },
    { when: [/страус/, /(голов|прячут)/, /песок/], myth: true, fact: 'Это миф. Страусы опускают голову к земле, чтобы переворачивать яйца, а не от страха.', src: W('Африканский страус') },
    { when: [/паук/, /ног/], num: { vals: [8], tol: 0, min: 2, max: 20 }, fact: 'У паука восемь ног.', src: W('Пауки') },
    { when: [/(самый легкий|самым легким)/, /элемент/], word: /водород/, strict: true, fact: 'Самый лёгкий химический элемент — водород.', src: W('Водород') },
    { when: [/наполеон/, /(низк|маленьк|коротыш|рост)/], unless: /(миф|16[5-9]|17\d|средн)/, myth: true, fact: 'Это миф. Рост Наполеона был около 168–170 см, средний для его времени.', src: W('Наполеон I') },
    { when: [/пирамид/, /раб/], unless: /(миф|не раб)/, myth: true, fact: 'Археологи нашли поселения строителей пирамид: это были оплачиваемые рабочие, и их было десятки тысяч, а не миллион.', src: W('Египетские пирамиды') },
    { when: [/(^|[^а-я])пи([^а-я]|$)/, /(ровно|точно)/, /3[,.]14([^\d]|$)/], myth: true, fact: 'Число пи — бесконечная дробь 3,14159…, а 3,14 лишь округление.', src: W('Пи (число)') },
    { when: [/мозг/, /(10\s?%|десят[а-яa-z]* процент)/], myth: true, fact: 'Это миф. Томография показывает, что за сутки работают практически все отделы мозга.', src: W('Миф о десяти процентах мозга') },
    { when: [/китайск[а-яa-z]* стен/, /(видн|увидеть|разглядеть)/, /(космос|луны|орбит)/], myth: true, fact: 'Это миф. Без оптики Великую Китайскую стену из космоса не видно: она слишком узкая.', src: W('Великая Китайская стена') },
    { when: [/(золот[а-яa-z]* рыб|рыбк)/, /памят/, /секунд/], myth: true, fact: 'Это миф. Опыты показывают, что золотые рыбки помнят события месяцами.', src: W('Золотая рыбка') },
    { when: [/молни/, /(дважды|два раза|в одно место)/, /(не бь|никогда)/], myth: true, fact: 'Это миф. Молния регулярно бьёт в одно и то же место, например в высокие здания.', src: W('Молния') },
    { when: [/эйнштейн/, /математик/, /(двоечник|провалил|плохо|не давал)/], myth: true, fact: 'Это миф. Эйнштейн отлично знал математику ещё в школе.', src: W('Эйнштейн, Альберт') },
    { when: [/эйнштейн/, /безуми/], myth: true, quote: true, fact: 'Нет документов, где Эйнштейн это говорил. Фразу приписывают ему с 1980-х годов.', src: 'https://quoteinvestigator.com/2017/03/23/same/' },
  ];

  function checkFacts(c) {
    const out = [];
    const ctx = c.ctx ? c.n + ' ' + c.ctx : c.n;
    for (const f of FACTS) {
      if (!f.when.every(r => r.test(ctx))) continue;
      if (f.unless && f.unless.test(c.n)) continue;
      let res = null, note = '';
      if (f.myth) { res = 'contradict'; note = f.quote ? 'Ложная цитата' : 'Известный миф'; }
      if (!res && f.wrong && f.wrong.test(c.n) && !(f.word && f.word.test(c.n))) { res = 'contradict'; note = 'Названо не то имя'; }
      if (!res && f.word) {
        if (f.word.test(c.n)) res = 'support';
        else if (f.strict || /(столиц|написал|автор|открыл|создал|перв)/.test(c.n)) { res = 'contradict'; note = 'Ответ отличается от факта'; }
      }
      if (f.year && res !== 'contradict') {
        const ys = years(c.n);
        if (ys.length) {
          if (ys.some(y => f.year.includes(y))) res = res || 'support';
          else { res = 'contradict'; note = `В ответе: ${ys.join(', ')}`; }
        }
      }
      if (f.num && res !== 'contradict') {
        const inRange = numbers(c.n).filter(x => x.v >= f.num.min && x.v <= f.num.max);
        const cands = inRange.some(x => !x.isYear) ? inRange.filter(x => !x.isYear) : inRange;
        if (cands.length) {
          if (cands.some(x => f.num.vals.some(v => Math.abs(x.v - v) <= f.num.tol))) res = res || 'support';
          else { res = 'contradict'; note = `В ответе: ${cands.map(x => x.raw).join(', ')}`; }
        }
      }
      if (res) out.push({ src: 'База фактов', result: res, fact: f.fact, note, link: f.src });
    }
    return out;
  }

  /* ---------- 4. Arithmetic ---------- */
  const num = s => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
  const close = (a, b) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.005);
  const fmt = v => (Math.round(v * 1000) / 1000).toString().replace('.', ',');
  function checkMath(c) {
    const out = [];
    const t = c.n.replace(/−/g, '-');
    const ar = /(-?\d+(?:[.,]\d+)?)\s*([+\-×*·\/÷]|\s[x:]\s)\s*(-?\d+(?:[.,]\d+)?)\s*(?:=|равно|равняется|будет)\s*(-?\d+(?:[.,]\d+)?)/g;
    let m;
    while ((m = ar.exec(t))) {
      const a = num(m[1]), b = num(m[3]), got = num(m[4]), op = m[2].trim();
      const want = op === '+' ? a + b : op === '-' ? a - b : '×*·x'.includes(op) ? a * b : a / b;
      out.push(close(got, want)
        ? { src: 'Математика', result: 'support', fact: `${m[1]} ${op} ${m[3]} = ${fmt(want)}. Вычисление верное.` }
        : { src: 'Математика', result: 'contradict', fact: `${m[1]} ${op} ${m[3]} = ${fmt(want)}, а не ${m[4]}.`, note: 'Ошибка в вычислении' });
    }
    const pc = /(\d+(?:[.,]\d+)?)\s*%\s*от\s*(\d[\d ]*(?:[.,]\d+)?)\s*(?:—|–|-|=|:)?\s*(?:это|равно|составляет|будет)?\s*(?:—|–|-)?\s*(\d[\d ]*(?:[.,]\d+)?)/g;
    while ((m = pc.exec(t))) {
      const p = num(m[1]), base = num(m[2]), got = num(m[3]);
      const want = base * p / 100;
      out.push(close(got, want)
        ? { src: 'Математика', result: 'support', fact: `${m[1]}% от ${m[2].trim()} = ${fmt(want)}. Вычисление верное.` }
        : { src: 'Математика', result: 'contradict', fact: `${m[1]}% от ${m[2].trim()} = ${fmt(want)}, а не ${m[3].trim()}.`, note: 'Ошибка в процентах' });
    }
    const sq = /корень из\s*(\d+(?:[.,]\d+)?)\s*(?:—|–|-|=|:)?\s*(?:равен|равно|это|будет|составляет)?\s*(?:—|–|-)?\s*(\d+(?:[.,]\d+)?)/g;
    while ((m = sq.exec(t))) {
      const x = num(m[1]), got = num(m[2]), want = Math.sqrt(x);
      out.push(close(got, want)
        ? { src: 'Математика', result: 'support', fact: `√${m[1]} = ${fmt(want)}. Вычисление верное.` }
        : { src: 'Математика', result: 'contradict', fact: `√${m[1]} = ${fmt(want)}, а не ${m[2]}.`, note: 'Ошибка в вычислении' });
    }
    return out;
  }

  /* ---------- 5. Hallucination signals ---------- */
  const RX = {
    source: /(исследовани|ученые|ученых|эксперт|по данным|согласно|опубликова|журнал|университет|институт|study|research|according to|scientists|report)/,
    url: /(https?:\/\/\S+|www\.\S+)/,
    doi: /10\.\d{4,9}\/[^\s,;)]+/,
    absolute: /(^|[^а-я])(всегда|никогда|все без исключения|стопроцентно|100\s?%|доказано|доказали|безусловно|абсолютно|гарантирован[а-яa-z]*|точно известно|без сомнени[а-яa-z]*)([^а-я]|$)/,
    hedge: /(возможно|вероятно|по некоторым данным|считается|предположительно|может быть|не исключено|по оценкам|точных данных нет|не уверен)/,
    quote: /[«"„][^»"“]{12,}[»"“]/,
    quoteVerb: /(сказал|говорил|писал|заявил|цитат|произнес|по словам|его слова|ее слова|said|wrote)/,
    fresh: /(сейчас|на данный момент|в этом году|в настоящее время|последн[а-яa-z]* (верси|данн|новост)|текущ[а-яa-z]*|недавно|на сегодня|свежи)/,
    stakes: /(лекарств|вылеч|лечит|простуд|грипп|витамин|дозиров|доз[аеуы]\b|мг\b|таблет|диагноз|лечени|симптом|болезн|антибиотик|(?:^|[^а-я])закон(?!ч)[а-яa-z]*|стать[а-яa-z]* \d+|штраф|налог|инвест|кредит|вклад)/,
    opinion: /(^|[^а-я])(я думаю|по-моему|мне кажется|на мой взгляд|лучше всего|рекомендую|советую|стоит|следует|нужно|важно|интересн[а-я]*|прекрасн[а-я]*|удивительн[а-я]*|лучш[а-я]*|худш[а-я]*|замечательн[а-я]*|рад помочь|надеюсь|вдохновля[а-я]*)([^а-я]|$)/,
    factVerb: /(\s—\s|самы[йея]|сама[яе]|сам[оу]е|являет|был[аои]?\b|находит|состоит|открыл|изобрел|написал|родил|основан|построен|составляет|насчитыва|произошл|начал|закончил|вышл|вышел|расположен|равн|весит|длит)/,
    future: /(прогноз|план|ожида|будет|планиру|к \d{4}|до \d{4}|станет|собираются)/,
  };
  const properNouns = (t, all) => {
    const out = [];
    const re = /(^|[^A-Za-zА-Яа-яЁё])([A-ZА-ЯЁ][a-zа-яё]{2,}(?:-[A-ZА-ЯЁ]?[a-zа-яё]+)?)/g;
    let m, first = true;
    while ((m = re.exec(t))) { if (all || !(first && m.index === 0)) out.push(m[2]); first = false; }
    return out;
  };

  function signals(c) {
    const s = [], n = c.n, nums = numbers(n);
    const hasLink = RX.url.test(c.text), doi = c.text.match(RX.doi);
    const approx = /(около|примерно|почти|более|больше|свыше|менее|меньше|порядка|приблизительно|about|around|over|nearly|approximately|more than|estimated)\s*$/;
    const precise = nums.filter(x => !x.isYear && !/(тыс|млн|миллион|млрд|миллиард)/.test(x.raw) && !approx.test(n.slice(0, n.indexOf(x.raw))) && (x.decimals || (/%/.test(n) && x.v % 5 !== 0) || (x.v > 1000 && x.v % 100 !== 0)));
    const pct = /\d\s*%/.test(n);
    if (RX.source.test(n) && !hasLink && !doi) {
      if (pct || precise.length) s.push({ k: 'fake-stat', level: 'bad', title: 'Статистика со ссылкой «в никуда»', why: 'Упомянуто исследование или организация, но нет ссылки, авторов и названия работы. Так чаще всего выглядит выдуманная статистика.' });
      else s.push({ k: 'vague-source', level: 'warn', title: 'Источник нельзя открыть', why: 'Ссылка на «исследования» или «экспертов» без названия и ссылки. Проверить такое утверждение по ответу невозможно.' });
    }
    if (doi) s.push({ k: 'doi', level: 'warn', title: 'DOI нужно открыть', why: 'ИИ часто придумывает правдоподобные DOI. Открой ссылку: если статьи нет или она о другом, утверждение выдумано.', link: 'https://doi.org/' + doi[0] });
    for (const u of (c.text.match(/(https?:\/\/[^\s)»"]+|www\.[^\s)»"]+)/g) || [])) {
      const r = SR.rateUrl(u.replace(/[.,;]+$/, ''));
      if (r) s.push({ k: 'link-' + r.level, level: r.level === 'trusted' || r.level === 'media' ? 'info' : 'warn', title: 'Ссылка: ' + r.label.toLowerCase(), why: r.why, link: /^https?:/.test(u) ? u : 'https://' + u });
    }
    if (precise.length && !s.some(x => x.k === 'fake-stat')) s.push({ k: 'precise', level: 'warn', title: 'Очень точная цифра', why: `Цифра ${precise[0].raw} выглядит точно, но источник не указан. Модели часто генерируют правдоподобные числа.` });
    if ((n.match(/\d+(?:[.,]\d+)?\s*%/g) || []).some(p => parseFloat(p) > 100)) s.push({ k: 'big-pct', level: 'warn', title: 'Процент больше 100', why: 'Рост «на 340%» и похожие цифры эффектно звучат, и потому их любят выдумывать. Нужен первоисточник.' });
    if (RX.absolute.test(n)) s.push({ k: 'absolute', level: 'warn', title: 'Категоричность', why: 'Слова вроде «всегда», «доказано», «единственный» редко бывают точными. Настоящие источники обычно формулируют осторожнее.' });
    if (RX.hedge.test(n)) s.push({ k: 'hedge', level: 'info', title: 'ИИ сам сомневается', why: 'Модель обозначила неуверенность. Это честно, но значит, что утверждение точно нужно проверить.' });
    if (RX.quote.test(c.text) && (c.text.match(RX.quote)[0].trim().split(/\s+/).length >= 4) && (RX.quoteVerb.test(n) || /:\s*[«"„]/.test(c.text))) s.push({ k: 'quote', level: 'warn', title: 'Цитата известного человека', why: 'ИИ часто приписывает цитаты не тем людям или сочиняет их. Ищи цитату с указанием книги, речи или письма.' });
    const fut = years(n).filter(y => y > NOW_YEAR);
    if (fut.length && !RX.future.test(n)) s.push({ k: 'future', level: 'bad', title: 'Дата из будущего', why: `Событие в ${fut[0]} году описано как уже произошедшее.` });
    if (RX.fresh.test(n) && nums.length) s.push({ k: 'fresh', level: 'bad', title: 'Устаревшие данные', why: 'Ответ называет «текущее» значение. У модели есть дата среза знаний, и то, что для неё «сейчас», могло давно измениться.' });
    else if (RX.fresh.test(n)) s.push({ k: 'fresh', level: 'warn', title: 'Свежие данные', why: 'У модели есть дата, после которой она ничего не знает. «Сейчас» для неё может быть год-два назад.' });
    if (RX.stakes.test(n)) s.push({ k: 'stakes', level: 'warn', title: 'Высокая цена ошибки', why: 'Здоровье, деньги или закон. Сверь с официальным источником или специалистом, даже если ответ звучит уверенно.' });
    return s;
  }

  function classify(c, sig) {
    const n = c.n;
    const hasNum = numbers(n).length > 0;
    const names = properNouns(c.text).length;
    const factual = hasNum || names > 0 || RX.factVerb.test(n) || sig.some(x => ['fake-stat','vague-source','doi','quote'].includes(x.k));
    if (RX.opinion.test(n) && !hasNum && !sig.some(x => x.k === 'fake-stat')) return 'opinion';
    if (!factual) return c.n.length < 60 || /\?$/.test(c.text) ? 'neutral' : 'factual-soft';
    return 'factual';
  }

  /* ---------- 6. Internal contradictions ---------- */
  const EVENTS = ['родил', 'умер', 'основ', 'открыл', 'изобрел', 'построен', 'полет', 'начал', 'закончил', 'вышл', 'вышел', 'опубликов', 'созда', 'открыт'];
  function contradictions(claims) {
    const info = claims.map(c => ({ ents: new Set(properNouns(c.text).map(w => norm(w).slice(0, 5))), ys: years(c.n), ev: EVENTS.filter(e => c.n.includes(e)) }));
    for (let i = 0; i < claims.length; i++) for (let j = i + 1; j < claims.length; j++) {
      const a = info[i], b = info[j];
      if (a.ys.length !== 1 || b.ys.length !== 1) continue;
      if (![...a.ents].some(e => b.ents.has(e))) continue;
      if (!a.ev.some(e => b.ev.includes(e))) continue;
      if (a.ys.some(y => b.ys.includes(y))) continue;
      const why = n => `В утверждении ${n} для того же события указан другой год. Ответ противоречит сам себе, значит минимум одна дата неверна.`;
      claims[i].sig.push({ k: 'self', level: 'bad', title: 'Противоречит сам себе', why: why(j + 1) });
      claims[j].sig.push({ k: 'self', level: 'bad', title: 'Противоречит сам себе', why: why(i + 1) });
    }
  }

  /* ---------- 7. Verdict and explanation ---------- */
  const VERDICTS = {
    ok: { label: 'Подтверждено', short: 'Верно', w: 1 },
    bad: { label: 'Ошибка', short: 'Ошибка', w: 0 },
    risk: { label: 'Похоже на выдумку', short: 'Выдумка?', w: 0.25 },
    likely: { label: 'Совпадает с Википедией', short: 'Похоже на правду', w: 0.85 },
    check: { label: 'Проверь сам', short: 'Проверить', w: 0.7 },
    opinion: { label: 'Мнение или совет', short: 'Мнение', w: null },
    neutral: { label: 'Не требует проверки', short: 'Нейтрально', w: null },
  };

  function searchLinks(c) {
    const ru = /[а-яё]/i.test(c.text);
    const q = c.text.replace(/\s+/g, ' ').slice(0, 140);
    const names = properNouns(c.text);
    const links = [{ label: 'Найти в Google', url: 'https://www.google.com/search?q=' + encodeURIComponent(q) }];
    links.push({ label: 'Поиск в Википедии', url: `https://${ru ? 'ru' : 'en'}.wikipedia.org/w/index.php?search=` + encodeURIComponent((names.join(' ') || q).slice(0, 100)) });
    if (c.sig.some(s => ['fake-stat', 'vague-source', 'doi', 'precise', 'big-pct'].includes(s.k))) links.push({ label: 'Google Scholar', url: 'https://scholar.google.com/scholar?q=' + encodeURIComponent(q) });
    if (c.sig.some(s => s.k === 'quote')) links.push({ label: 'Проверить цитату', url: 'https://www.google.com/search?q=' + encodeURIComponent('"' + (c.text.match(/[«"„]([^»"“]+)/) || [,''])[1].slice(0, 80) + '" источник цитаты') });
    const doi = c.sig.find(s => s.k === 'doi'); if (doi) links.push({ label: 'Открыть DOI', url: doi.link });
    return links;
  }

  function decide(c) {
    const con = c.checks.filter(x => x.result === 'contradict');
    const sup = c.checks.filter(x => x.result === 'support');
    const bad = c.sig.filter(s => s.level === 'bad');
    const warn = c.sig.filter(s => s.level === 'warn');
    let v;
    if (con.length) v = c.checks.some(x => x.result === 'contradict' && x.partly) && !c.checks.some(x => x.result === 'contradict' && !x.partly) ? 'risk' : 'bad';
    else if (sup.length && !bad.length) v = sup.every(x => x.soft) ? 'likely' : 'ok';
    else if (c.type === 'opinion') v = 'opinion';
    else if (c.type === 'neutral') v = 'neutral';
    else if (bad.length || warn.length >= 2) v = 'risk';
    else v = 'check';

    const why = [];
    if (v === 'bad') con.forEach(x => why.push((x.note ? x.note + '. ' : '') + x.fact));
    if (v === 'ok') sup.filter(x => !x.soft).forEach(x => why.push('Совпадает с проверенным источником: ' + x.fact));
    if (v === 'likely') sup.forEach(x => why.push(x.fact + ' Это хороший знак, но Википедию может править любой, поэтому это подсказка, а не доказательство.'));
    if (v === 'risk' && con.length) con.forEach(x => why.push(x.fact));
    c.sig.filter(s => s.level !== 'info' || v !== 'ok' || s.k.startsWith('link')).forEach(s => why.push(s.title + '. ' + s.why));
    if (v === 'check' && !why.length) why.push(c.type === 'factual-soft'
      ? 'Это общее утверждение. Звучит правдоподобно, но ответ ИИ сам по себе не источник.'
      : 'Это проверяемый факт. Мы не нашли ни подтверждения, ни признаков ошибки, поэтому он требует ручной проверки.');
    if (v === 'opinion') why.unshift('Это оценка или совет, а не факт. Её нельзя подтвердить или опровергнуть, можно только сравнить с мнением специалистов.');
    if (v === 'neutral') why.unshift('В этой фразе нет фактов, которые нужно проверять.');

    const how = [];
    if (v === 'ok') how.push('Факт подтверждён. Для важной работы всё равно укажи первоисточник, а не ИИ.');
    if (v === 'bad') how.push('Не используй это утверждение. Исправь по источнику ниже.');
    if (v === 'likely') how.push('Открой статью и найди сноску к этой фразе: ссылайся на первоисточник из сноски или на источник из списка ниже, а не на Википедию.');
    if (v === 'risk' || v === 'check' || v === 'likely') {
      if (c.sig.some(s => ['fake-stat', 'vague-source', 'doi'].includes(s.k))) how.push('Найди само исследование: автор, год, название журнала. Если его нет в Google Scholar, считай цифру выдуманной.');
      if (c.sig.some(s => s.k === 'quote')) how.push('Ищи цитату с указанием первоисточника: книги, речи, письма. Сайты с подборками цитат не считаются.');
      if (c.sig.some(s => s.k === 'stakes')) how.push('Сверь с официальным сайтом (Минздрав, закон, банк) или спроси специалиста.');
      if (c.sig.some(s => s.k === 'fresh')) how.push('Проверь дату: найди новость или официальный источник за последние месяцы.');
      how.push('Найди минимум два независимых источника, которые говорят то же самое.');
    }
    c.verdict = v; c.why = why; c.how = how; c.links = (v === 'neutral' || v === 'opinion') ? [] : searchLinks(c);
    c.sources = v === 'neutral' || (v === 'opinion' && !SR.topics(c.text).some(t => ['health', 'money', 'law'].includes(t.id))) ? null : SR.forClaim(c.text, 4, c.ctx || '');
  }

  function score(claims) {
    const fact = claims.filter(c => VERDICTS[c.verdict].w !== null);
    const counts = Object.fromEntries(Object.keys(VERDICTS).map(k => [k, claims.filter(c => c.verdict === k).length]));
    if (!fact.length) return { value: null, counts, level: 'none' };
    let v = 100 * fact.reduce((a, c) => a + VERDICTS[c.verdict].w, 0) / fact.length;
    const abs = claims.filter(c => c.sig.some(s => s.k === 'absolute')).length;
    v -= Math.min(10, abs * 4);
    if (counts.bad) v = Math.min(v, 60 - Math.min(25, (counts.bad - 1) * 10));
    v = Math.max(0, Math.min(100, Math.round(v)));
    const level = !counts.bad && !counts.risk && v < 80 ? 'clean' : v >= 80 ? 'high' : v >= 55 ? 'mid' : 'low';
    return { value: v, counts, level };
  }

  function analyze(text) {
    const claims = splitClaims(text);
    claims.forEach((c, i) => {
      if (i && /(^|[^а-я])(он|она|оно|они|его|ее|их|ей|ему|им|ней|нем|страна|страны|стране|страну|город|здесь|там|этот|эта|этого|этой)([^а-я]|$)/.test(c.n))
        c.ctx = norm(properNouns(claims[i - 1].text, true).join(' ') + ' ' + (claims[i - 1].ctx || ''));
    });
    claims.forEach(c => { c.sig = signals(c); c.checks = [...checkFacts(c), ...checkMath(c)]; });
    contradictions(claims);
    claims.forEach(c => { c.type = classify(c, c.sig); decide(c); });
    return { claims, score: score(claims) };
  }

  /* re-run verdicts after external checks (Wikipedia, AI) were added */
  function refresh(result) {
    result.claims.forEach(decide);
    result.score = score(result.claims);
    return result;
  }

  return { analyze, refresh, numbers, years, properNouns, norm, VERDICTS, FACTS, NOW_YEAR };
})();
if (typeof module !== 'undefined') module.exports = TL;
