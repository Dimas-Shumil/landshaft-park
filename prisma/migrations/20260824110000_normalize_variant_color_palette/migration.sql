-- Normalize existing colors to the fixed administrator palette.
UPDATE "ProductVariant" SET "color" = 'Белый', "colorHex" = '#f3f2ed' WHERE "color" IN ('Белый', 'белый');
UPDATE "ProductVariant" SET "color" = 'Светло-серый', "colorHex" = '#c9c9c5' WHERE "color" IN ('Светло-серый', 'светло-серый');
UPDATE "ProductVariant" SET "color" = 'Серый', "colorHex" = '#8f8b82' WHERE "color" IN ('Серый', 'серый');
UPDATE "ProductVariant" SET "color" = 'Тёмно-серый', "colorHex" = '#5f605e' WHERE "color" IN ('Тёмно-серый', 'тёмно-серый', 'Темно-серый', 'темно-серый');
UPDATE "ProductVariant" SET "color" = 'Графит', "colorHex" = '#414344' WHERE "color" IN ('Графит', 'графит');
UPDATE "ProductVariant" SET "color" = 'Чёрный', "colorHex" = '#202120' WHERE "color" IN ('Чёрный', 'чёрный', 'Черный', 'черный');
UPDATE "ProductVariant" SET "color" = 'Кремовый', "colorHex" = '#e8d8b9' WHERE "color" IN ('Кремовый', 'кремовый');
UPDATE "ProductVariant" SET "color" = 'Бежевый', "colorHex" = '#c9b28a' WHERE "color" IN ('Бежевый', 'бежевый');
UPDATE "ProductVariant" SET "color" = 'Песочный', "colorHex" = '#d4b483' WHERE "color" IN ('Песочный', 'песочный');
UPDATE "ProductVariant" SET "color" = 'Жёлтый', "colorHex" = '#d4b85a' WHERE "color" IN ('Жёлтый', 'жёлтый', 'Желтый', 'желтый');
UPDATE "ProductVariant" SET "color" = 'Оранжевый', "colorHex" = '#d9772b' WHERE "color" IN ('Оранжевый', 'оранжевый');
UPDATE "ProductVariant" SET "color" = 'Красный', "colorHex" = '#c93632' WHERE "color" IN ('Красный', 'красный');
UPDATE "ProductVariant" SET "color" = 'Бордовый', "colorHex" = '#7a2630' WHERE "color" IN ('Бордовый', 'бордовый');
UPDATE "ProductVariant" SET "color" = 'Коричневый', "colorHex" = '#735444' WHERE "color" IN ('Коричневый', 'коричневый');
UPDATE "ProductVariant" SET "color" = 'Тёмно-коричневый', "colorHex" = '#4b352b' WHERE "color" IN ('Тёмно-коричневый', 'тёмно-коричневый', 'Темно-коричневый', 'темно-коричневый');
UPDATE "ProductVariant" SET "color" = 'Зелёный', "colorHex" = '#5f7655' WHERE "color" IN ('Зелёный', 'зелёный', 'Зеленый', 'зеленый');
UPDATE "ProductVariant" SET "color" = 'Оливковый', "colorHex" = '#7d8050' WHERE "color" IN ('Оливковый', 'оливковый');
UPDATE "ProductVariant" SET "color" = 'Голубой', "colorHex" = '#72a6bd' WHERE "color" IN ('Голубой', 'голубой');
UPDATE "ProductVariant" SET "color" = 'Синий', "colorHex" = '#35658f' WHERE "color" IN ('Синий', 'синий');
UPDATE "ProductVariant" SET "color" = 'Фиолетовый', "colorHex" = '#70527c' WHERE "color" IN ('Фиолетовый', 'фиолетовый');

-- Values outside the controlled palette are treated as “color not selected”.
UPDATE "ProductVariant"
SET "color" = '', "colorHex" = NULL
WHERE "color" NOT IN (
  '', 'Белый', 'Светло-серый', 'Серый', 'Тёмно-серый', 'Графит', 'Чёрный',
  'Кремовый', 'Бежевый', 'Песочный', 'Жёлтый', 'Оранжевый', 'Красный',
  'Бордовый', 'Коричневый', 'Тёмно-коричневый', 'Зелёный', 'Оливковый',
  'Голубой', 'Синий', 'Фиолетовый'
);
