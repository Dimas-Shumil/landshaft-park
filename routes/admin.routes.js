'use strict';

const path = require('node:path');
const express = require('express');
const { loadAdminSession } = require('../middleware/auth');

const router = express.Router();
const adminPagesDir = path.join(__dirname, '..', 'admin-pages');

function sendAdminPage(res, fileName) {
  res.set('Cache-Control', 'no-store');
  return res.sendFile(path.join(adminPagesDir, fileName));
}

function requireAdminPage(req, res, next) {
  if (!req.adminAuth) {
    return res.redirect('/admin/login');
  }

  return next();
}

router.use(loadAdminSession);

router.get('/login', (req, res) => {
  if (req.adminAuth) {
    return res.redirect('/admin');
  }

  return sendAdminPage(res, 'login.html');
});

router.get('/login.html', (req, res) => {
  return res.redirect(308, '/admin/login');
});

router.get('/', requireAdminPage, (req, res) => {
  return sendAdminPage(res, 'dashboard.html');
});

router.get('/dashboard', (req, res) => {
  return res.redirect(308, '/admin');
});

router.get('/dashboard.html', (req, res) => {
  return res.redirect(308, '/admin');
});

router.get('/requests', requireAdminPage, (req, res) => {
  return sendAdminPage(res, 'requests.html');
});

router.get('/requests.html', (req, res) => {
  return res.redirect(308, '/admin/requests');
});

module.exports = router;
