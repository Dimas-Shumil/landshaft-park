'use strict';

function normalizeSiteUrl(value) {
  const fallback = 'https://landshaftpark.ru';
  const candidate = String(value || fallback).trim().replace(/\/+$/, '');

  try {
    const url = new URL(candidate);

    if (url.hostname === 'landshaftpark.ru' || url.hostname === 'www.landshaftpark.ru') {
      url.protocol = 'https:';
      url.hostname = 'landshaftpark.ru';
      url.port = '';
    }

    return url.origin;
  } catch {
    return fallback;
  }
}

const siteUrl = normalizeSiteUrl(process.env.SITE_URL);

const organization = Object.freeze({
  name: 'Ландшафт Парк',
  legalName: 'Ландшафт Парк',
  alternateName: 'Ландшафтпарк',
  description:
    'Локальный производитель тротуарной плитки и элементов благоустройства в Черногорске с доставкой по Республике Хакасия.',
  email: 'udakow@mail.ru',
  phones: ['+79610938663', '+79059743670'],
  address: Object.freeze({
    country: 'RU',
    region: 'Республика Хакасия',
    locality: 'Черногорск',
    street: 'ул. Бограда, 01Д',
    postalCode: '655153',
  }),
  areaServed: Object.freeze([
    Object.freeze({ type: 'City', name: 'Черногорск' }),
    Object.freeze({ type: 'AdministrativeArea', name: 'Республика Хакасия' }),
  ]),
  sameAs: Object.freeze([
    'https://2gis.ru/chernogorsk/firm/9711415978103698',
  ]),
});

module.exports = {
  siteUrl,
  organization,
};
