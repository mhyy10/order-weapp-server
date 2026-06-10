const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.get('/list', (req, res) => {
  const { userId } = req.query
  if (!userId) return error(req, res, '缺少 userId')
  const carts = db.get('carts') || {}
  success(res, carts[userId] || [])
})

router.post('/add', (req, res) => {
  const { userId, dishId, name, image, spec, addons, note, price, quantity } = req.body
  if (!userId || !dishId) return error(req, res, '缺少必要参数')
  const carts = db.get('carts') || {}
  if (!carts[userId]) carts[userId] = []
  const cart = carts[userId]
  const addonKey = (addons || []).sort().join(',')
  const existing = cart.find(c => c.dishId == dishId && (c.spec||'') == (spec||'') && (c.addons||[]).sort().join(',') == addonKey)
  if (existing) {
    existing.quantity += (quantity || 1)
  } else {
    cart.push({ dishId, name, image: image||'', spec: spec||'', addons: addons||[], note: note||'', price, quantity: quantity||1, cartKey: `${dishId}_${spec||''}_${addonKey}` })
  }
  db.set('carts', carts)
  success(res, cart)
})

router.post('/update', (req, res) => {
  const { userId, cartKey, quantity } = req.body
  if (!userId || !cartKey) return error(req, res, '缺少必要参数')
  const carts = db.get('carts') || {}
  const cart = carts[userId] || []
  const idx = cart.findIndex(c => c.cartKey == cartKey)
  if (idx > -1) {
    if (quantity <= 0) cart.splice(idx, 1)
    else cart[idx].quantity = quantity
  }
  db.set('carts', carts)
  success(res, cart)
})

router.post('/clear', (req, res) => {
  const { userId } = req.body
  if (!userId) return error(req, res, '缺少 userId')
  const carts = db.get('carts') || {}
  carts[userId] = []
  db.set('carts', carts)
  success(res, [])
})

module.exports = router
