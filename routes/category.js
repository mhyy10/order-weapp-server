const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.get('/list', (req, res) => {
  try {
    const categories = (db.get('categories') || []).filter(c => c.isActive).sort((a, b) => a.sort - b.sort)
    success(res, categories)
  } catch (err) {
    console.error('[category/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
