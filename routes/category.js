const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.get('/list', (req, res) => {
  const categories = (db.get('categories') || []).filter(c => c.isActive).sort((a, b) => a.sort - b.sort)
  success(res, categories)
})

module.exports = router
