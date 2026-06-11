const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

router.get('/list', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少 userId')
    const carts = db.get('carts') || {}
    success(res, carts[userId] || [])
  } catch (err) {
    console.error('[cart/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/add', (req, res) => {
  try {
    const { userId, dishId, name, image, spec, addons, note, price, quantity } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!dishId) return error(req, res, '缺少必填参数: dishId')
    const qty = parseInt(quantity) || 1
    if (qty < 1 || !Number.isInteger(qty)) return error(req, res, '缺少必填参数: quantity(正整数)')
    const carts = db.get('carts') || {}
    if (!carts[userId]) carts[userId] = []
    const cart = carts[userId]
    const addonKey = (addons || []).sort().join(',')
    const existing = cart.find(c => c.dishId == dishId && (c.spec||'') == (spec||'') && (c.addons||[]).sort().join(',') == addonKey)
    if (existing) {
      existing.quantity += qty
    } else {
      cart.push({ dishId, name, image: image||'', spec: spec||'', addons: addons||[], note: note||'', price, quantity: qty, cartKey: `${dishId}_${spec||''}_${addonKey}` })
    }
    db.set('carts', carts)
    success(res, cart)
  } catch (err) {
    console.error('[cart/add]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/update', (req, res) => {
  try {
    const { userId, cartKey, quantity } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!cartKey) return error(req, res, '缺少必填参数: cartItemId')
    if (quantity === undefined || quantity === null) return error(req, res, '缺少必填参数: quantity')
    const carts = db.get('carts') || {}
    const cart = carts[userId] || []
    const idx = cart.findIndex(c => c.cartKey == cartKey)
    if (idx > -1) {
      if (quantity <= 0) cart.splice(idx, 1)
      else cart[idx].quantity = quantity
    }
    db.set('carts', carts)
    success(res, cart)
  } catch (err) {
    console.error('[cart/update]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/clear', (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) return error(req, res, '缺少 userId')
    const carts = db.get('carts') || {}
    carts[userId] = []
    db.set('carts', carts)
    success(res, [])
  } catch (err) {
    console.error('[cart/clear]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
