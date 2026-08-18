'use strict';

function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Маршрут не найден' });
  }

  return res.status(404).type('text/plain').send('Страница не найдена');
}

function errorHandler(error, req, res, next) {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }

  return res.status(500).type('text/plain').send('Внутренняя ошибка сервера');
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
