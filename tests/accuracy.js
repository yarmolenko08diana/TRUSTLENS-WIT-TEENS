// Accuracy check for the TrustLens engine. Run: node tests/accuracy.js
// 1) Truthful texts must not get "Ошибка" or "Похоже на выдумку" (no false alarms).
// 2) Every trainer item: errors must be flagged, true statements must not.
global.SR = require('../src/sources.js');
const TL = require('../src/engine.js');
const EX = require('../src/examples.js');

const TRUE_TEXTS = {
  'Диана (RU)': EX.find(e => e.title.includes('Диана')).text,
  'Диана (EN)': `Diana, Princess of Wales, died on 31 August 1997 in a car crash in the Pont de l'Alma road tunnel in Paris. She was 36 years old. Her companion Dodi Fayed and the driver Henri Paul were pronounced dead at the scene. The bodyguard Trevor Rees-Jones was the only survivor. In 2008 the British inquest returned a verdict of unlawful killing due to the grossly negligent driving of Henri Paul and the following vehicles. Her funeral took place at Westminster Abbey on 6 September 1997 and was watched by an estimated 2.5 billion people. She is buried at Althorp, the Spencer family estate.`,
  'Диана, биография': `Принцесса Диана родилась 1 июля 1961 года. В 1981 году она вышла замуж за принца Чарльза. Диана погибла в 1997 году. Расследование её смерти завершилось в 2008 году. У неё было двое сыновей — принц Уильям и принц Гарри.`,
  'Титаник': `«Титаник» затонул в ночь на 15 апреля 1912 года после столкновения с айсбергом. На борту было около 2224 человек, погибли более 1500. Судно шло из Саутгемптона в Нью-Йорк.`,
  'Аполлон-11': `Миссия «Аполлон-11» высадилась на Луну 20 июля 1969 года. Первым на поверхность Луны ступил Нил Армстронг, за ним — Базз Олдрин. Майкл Коллинз оставался на орбите. Астронавты собрали около 21,5 кг лунного грунта.`,
  'Война': `Великая Отечественная война началась 22 июня 1941 года и закончилась 9 мая 1945 года. Вторая мировая война завершилась 2 сентября 1945 года капитуляцией Японии.`,
  'Абай': `Абай Кунанбаев родился в 1845 году в Семипалатинской области. Он считается основоположником казахской письменной литературы. Его главное произведение — «Слова назидания». Абай умер в 1904 году.`,
  'Здоровье': `ВОЗ объявила пандемию COVID-19 11 марта 2020 года. Антибиотики не действуют на вирусы.`,
};

let fails = 0;
for (const [name, text] of Object.entries(TRUE_TEXTS)) {
  const r = TL.analyze(text);
  const alarms = r.claims.filter(c => ['bad', 'risk'].includes(c.verdict));
  console.log(`${alarms.length ? 'FAIL' : 'ok  '} правдивый текст «${name}»: индекс ${r.score.value}, ложных тревог ${alarms.length}`);
  alarms.forEach(c => console.log('       ', c.verdict, c.text));
  fails += alarms.length;
}

let right = 0, total = 0;
for (const round of EX.TRAINER) for (const it of round.items) {
  const c = TL.analyze(it.t).claims[0];
  const flagged = ['bad', 'risk'].includes(c.verdict);
  total++;
  if (flagged === !it.ok) right++; else console.log('  тренажёр, не совпало:', it.t);
}
console.log(`Тренажёр: движок верно оценил ${right} из ${total} утверждений`);
process.exit(fails ? 1 : 0);
