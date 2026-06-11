const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 获取或初始化用户积分账户
function getOrCreatePoints(userId) {
  let points = db.find('points', p => p.userId == userId)
  if (!points) {
    points = {
      id: 'pt_' + Date.now(),
      userId: parseInt(userId),
      balance: 0,
      totalEarned: 0,
      totalSpent: 0,
      updatedAt: new Date().toISOString()
    }
    db.push('points', points)
  }
  return points
}

// 查询积分余额
router.get('/balance', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少必填参数: userId')
    const points = getOrCreatePoints(userId)
    success(res, points)
  } catch (err) {
    console.error('[points/balance]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 积分明细列表
router.get('/records', (req, res) => {
  try {
    const { userId, page = 1, pageSize = 20 } = req.query
    if (!userId) return error(req, res, '缺少必填参数: userId')
    const p = Math.max(1, parseInt(page))
    const ps = Math.min(50, Math.max(1, parseInt(pageSize)))
    const all = db.filter('pointRecords', r => r.userId == userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const total = all.length
    const records = all.slice((p - 1) * ps, p * ps)
    success(res, { records, total, page: p, pageSize: ps })
  } catch (err) {
    console.error('[points/records]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 积分获取
router.post('/earn', (req, res) => {
  try {
    const { userId, amount, source, refId, desc } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!amount || amount <= 0) return error(req, res, '缺少必填参数: amount(正数)')
    if (!source) return error(req, res, '缺少必填参数: source')

    const validSources = ['order', 'sign', 'admin']
    if (!validSources.includes(source)) return error(req, res, 'source 不合法，可选: order, sign, admin')

    const points = getOrCreatePoints(userId)
    const earnAmount = Math.floor(amount)

    // 更新积分余额
    points.balance += earnAmount
    points.totalEarned += earnAmount
    points.updatedAt = new Date().toISOString()
    db._scheduleSave()

    // 记录明细
    const record = {
      id: 'pr_' + Date.now(),
      userId: parseInt(userId),
      type: 'earn',
      amount: earnAmount,
      source,
      refId: refId || '',
      desc: desc || '',
      createdAt: new Date().toISOString()
    }
    db.push('pointRecords', record)

    success(res, { points, record })
  } catch (err) {
    console.error('[points/earn]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 积分消费
router.post('/spend', (req, res) => {
  try {
    const { userId, amount, refId, desc } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!amount || amount <= 0) return error(req, res, '缺少必填参数: amount(正数)')

    const spendAmount = Math.floor(amount)
    const points = getOrCreatePoints(userId)

    if (points.balance < spendAmount) return error(req, res, '积分余额不足')

    // 更新积分余额
    points.balance -= spendAmount
    points.totalSpent += spendAmount
    points.updatedAt = new Date().toISOString()
    db._scheduleSave()

    // 记录明细
    const record = {
      id: 'pr_' + Date.now(),
      userId: parseInt(userId),
      type: 'spend',
      amount: spendAmount,
      source: 'order',
      refId: refId || '',
      desc: desc || '',
      createdAt: new Date().toISOString()
    }
    db.push('pointRecords', record)

    success(res, { points, record })
  } catch (err) {
    console.error('[points/spend]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 导出 earnPoints 和 spendPoints 供 order.js 内部调用
function earnPoints(userId, amount, source, refId, desc) {
  const points = getOrCreatePoints(userId)
  const earnAmount = Math.floor(amount)
  points.balance += earnAmount
  points.totalEarned += earnAmount
  points.updatedAt = new Date().toISOString()
  db._scheduleSave()

  const record = {
    id: 'pr_' + Date.now(),
    userId: parseInt(userId),
    type: 'earn',
    amount: earnAmount,
    source,
    refId: refId || '',
    desc: desc || '',
    createdAt: new Date().toISOString()
  }
  db.push('pointRecords', record)
  return { points, record }
}

function spendPoints(userId, amount, refId, desc) {
  const spendAmount = Math.floor(amount)
  const points = getOrCreatePoints(userId)
  if (points.balance < spendAmount) return null // 余额不足

  points.balance -= spendAmount
  points.totalSpent += spendAmount
  points.updatedAt = new Date().toISOString()
  db._scheduleSave()

  const record = {
    id: 'pr_' + Date.now(),
    userId: parseInt(userId),
    type: 'spend',
    amount: spendAmount,
    source: 'order',
    refId: refId || '',
    desc: desc || '',
    createdAt: new Date().toISOString()
  }
  db.push('pointRecords', record)
  return { points, record }
}

module.exports = router
module.exports.earnPoints = earnPoints
module.exports.spendPoints = spendPoints
