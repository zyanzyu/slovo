import type { Deck, StoreData, Word } from '../lib/types';

const now = Date.now();

const decks: Deck[] = [
  {
    id: 'daily',
    name: '日常寒暄',
    subtitle: '从第一句开始，把俄语说出口',
    color: 'clay',
    createdAt: now - 3_000,
  },
  {
    id: 'travel',
    name: '旅行必备',
    subtitle: '机场、车站与街头的实用词',
    color: 'sage',
    createdAt: now - 2_000,
  },
  {
    id: 'food',
    name: '餐桌与食物',
    subtitle: '点一杯咖啡，读懂一份菜单',
    color: 'ochre',
    createdAt: now - 1_000,
  },
];

function word(
  id: string,
  deckId: string,
  ru: string,
  zh: string,
  transcription: string,
  exampleRu: string,
  exampleZh: string,
): Word {
  return {
    id,
    deckId,
    ru,
    zh,
    transcription,
    exampleRu,
    exampleZh,
    createdAt: now,
    srs: {
      due: now,
      interval: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
      mastery: 0,
    },
  };
}

const words: Word[] = [
  word('w-pri', 'daily', 'привет', '你好；嗨', 'приве́т', 'Привет, как дела?', '嗨，你好吗？'),
  word('w-spa', 'daily', 'спасибо', '谢谢', 'спаси́бо', 'Спасибо за помощь!', '谢谢你的帮助！'),
  word('w-pozh', 'daily', 'пожалуйста', '请；不客气', 'пожа́луйста', 'Пожалуйста, садитесь.', '请坐。'),
  word('w-izv', 'daily', 'извините', '对不起；请问', 'извини́те', 'Извините, где метро?', '请问，地铁在哪里？'),
  word('w-utro', 'daily', 'доброе утро', '早上好', 'до́брое у́тро', 'Доброе утро! Как спали?', '早上好！睡得怎么样？'),
  word('w-poka', 'daily', 'до свидания', '再见', 'до свида́ния', 'До свидания, до завтра!', '再见，明天见！'),
  word('w-dela', 'daily', 'как дела', '最近怎么样', 'как дела́', 'Привет! Как дела?', '嗨！最近怎么样？'),
  word('w-khor', 'daily', 'хорошо', '好；很好', 'хорошо́', 'Всё хорошо, спасибо.', '一切都好，谢谢。'),
  word('w-zovut', 'daily', 'меня зовут', '我叫……', 'меня́ зову́т', 'Меня зовут Ли.', '我叫李。'),
  word('w-priyatno', 'daily', 'очень приятно', '很高兴认识你', 'о́чень прия́тно', 'Очень приятно познакомиться!', '很高兴认识你！'),
  word('w-da', 'daily', 'да', '是；对', 'да', 'Да, это правда.', '是的，这是真的。'),
  word('w-net', 'daily', 'нет', '不；没有', 'нет', 'Нет, спасибо.', '不用了，谢谢。'),

  word('w-airport', 'travel', 'аэропорт', '机场', 'аэропо́рт', 'Аэропорт далеко от центра.', '机场离市中心很远。'),
  word('w-vokzal', 'travel', 'вокзал', '火车站', 'вокза́л', 'Где находится вокзал?', '火车站在哪里？'),
  word('w-bilet', 'travel', 'билет', '票', 'биле́т', 'Мне нужен билет в Москву.', '我需要一张去莫斯科的票。'),
  word('w-hotel', 'travel', 'гостиница', '旅馆；酒店', 'гости́ница', 'Наша гостиница рядом.', '我们的酒店就在附近。'),
  word('w-passport', 'travel', 'паспорт', '护照', 'па́спорт', 'Покажите ваш паспорт.', '请出示您的护照。'),
  word('w-metro', 'travel', 'метро', '地铁', 'метро́', 'Поедем на метро.', '我们坐地铁去吧。'),
  word('w-taxi', 'travel', 'такси', '出租车', 'такси́', 'Вызовите такси, пожалуйста.', '请叫一辆出租车。'),
  word('w-map', 'travel', 'карта', '地图；卡', 'ка́рта', 'У вас есть карта города?', '你有城市地图吗？'),
  word('w-water', 'travel', 'вода', '水', 'вода́', 'Можно стакан воды?', '可以给我一杯水吗？'),
  word('w-bread', 'travel', 'хлеб', '面包', 'хлеб', 'Свежий хлеб, пожалуйста.', '请给我新鲜面包。'),
  word('w-price', 'travel', 'сколько стоит', '多少钱', 'ско́лько сто́ит', 'Сколько стоит билет?', '票多少钱？'),
  word('w-help', 'travel', 'помощь', '帮助', 'по́мощь', 'Мне нужна помощь.', '我需要帮助。'),

  word('w-apple', 'food', 'яблоко', '苹果', 'я́блоко', 'Я люблю зелёные яблоки.', '我喜欢青苹果。'),
  word('w-milk', 'food', 'молоко', '牛奶', 'молоко́', 'Кофе с молоком, пожалуйста.', '请给我加牛奶的咖啡。'),
  word('w-coffee', 'food', 'кофе', '咖啡', 'ко́фе', 'Этот кофе очень вкусный.', '这杯咖啡很好喝。'),
  word('w-tea', 'food', 'чай', '茶', 'чай', 'Хотите чаю?', '你想喝茶吗？'),
  word('w-cheese', 'food', 'сыр', '奶酪', 'сыр', 'Хлеб с сыром.', '面包配奶酪。'),
  word('w-soup', 'food', 'суп', '汤', 'суп', 'Суп ещё горячий.', '汤还很烫。'),
  word('w-meat', 'food', 'мясо', '肉', 'мя́со', 'Я не ем мясо.', '我不吃肉。'),
  word('w-fish', 'food', 'рыба', '鱼', 'ры́ба', 'Рыба очень свежая.', '鱼很新鲜。'),
  word('w-sugar', 'food', 'сахар', '糖', 'са́хар', 'Без сахара, пожалуйста.', '请不要加糖。'),
  word('w-salt', 'food', 'соль', '盐', 'соль', 'Передайте соль, пожалуйста.', '请把盐递给我。'),
];

export function createSeedData(): StoreData {
  return {
    version: 1,
    decks,
    words,
    settings: {
      dailyGoal: 15,
      newPerDay: 8,
      defaultMode: 'mixed',
      onlineHandwriting: true,
      offlineHandwriting: true,
      autoPlay: true,
      showTranscription: true,
      fontScale: 1.08,
    },
    stats: {
      streak: 0,
      daily: {},
      totalReviews: 0,
      totalCorrect: 0,
    },
  };
}
