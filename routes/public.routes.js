'use strict';

const path = require('node:path');
const express = require('express');

const router = express.Router();
const publicDir = path.join(__dirname, '..', 'public');

router.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

router.get('/catalog', (req, res) => {
  res.sendFile(path.join(publicDir, 'catalog.html'));
});

router.get('/product', (req, res) => {
  res.sendFile(path.join(publicDir, 'product.html'));
});

router.get('/cart', (req, res) => {
  res.sendFile(path.join(publicDir, 'cart.html'));
});

router.get('/contacts', (req, res) => {
  res.sendFile(path.join(publicDir, 'contacts.html'));
});

module.exports = router;
