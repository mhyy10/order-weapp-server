const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.get('/list', (req, res) => {
  try {
    const { categoryId } = req.query
    if (!categoryId) return error(req, res, '缺少 categoryId')
    const dishes = db.filter('dishes', d => d.categoryId == categoryId && d.isAvailable)
    success(res, dishes)
  } catch (err) {
    console.error('[dish/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/detail', (req, res) => {
  try {
    const { id } = req.query
    if (!id) return error(req, res, '缺少 id')
    const dish = db.find('dishes', d => d.id == id)
    if (!dish) return error(req, res, '菜品不存在', 404)
    success(res, dish)
  } catch (err) {
    console.error('[dish/detail]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/search', (req, res) => {
  try {
    const { keyword } = req.query
    if (!keyword) return success(res, [])
    const kw = keyword.toLowerCase()
    const results = db.filter('dishes', d =>
      d.isAvailable && (d.name.toLowerCase().includes(kw) || (d.description && d.description.toLowerCase().includes(kw)))
    )
    success(res, results)
  } catch (err) {
    console.error('[dish/search]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/recommended', (req, res) => {
  try {
    const dishes = db.filter('dishes', d => d.isRecommended && d.isAvailable)
    success(res, dishes)
  } catch (err) {
    console.error('[dish/recommended]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
