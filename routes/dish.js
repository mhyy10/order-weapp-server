const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.get('/list', (req, res) => {
  const { categoryId } = req.query
  if (!categoryId) return error(req, res, '缺少 categoryId')
  const dishes = db.filter('dishes', d => d.categoryId == categoryId && d.isAvailable)
  success(res, dishes)
})

router.get('/detail', (req, res) => {
  const { id } = req.query
  if (!id) return error(req, res, '缺少 id')
  const dish = db.find('dishes', d => d.id == id)
  if (!dish) return error(req, res, '菜品不存在', 404)
  success(res, dish)
})

router.get('/search', (req, res) => {
  const { keyword } = req.query
  if (!keyword) return success(res, [])
  const kw = keyword.toLowerCase()
  const results = db.filter('dishes', d =>
    d.isAvailable && (d.name.toLowerCase().includes(kw) || (d.description && d.description.toLowerCase().includes(kw)))
  )
  success(res, results)
})

router.get('/recommended', (req, res) => {
  const dishes = db.filter('dishes', d => d.isRecommended && d.isAvailable)
  success(res, dishes)
})

module.exports = router
