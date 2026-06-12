const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 配送费规则常量
const DELIVERY_CONFIG = {
  BASE_FEE: 5,           // 基础配送费 5 元
  FREE_THRESHOLD: 30,    // 满 30 元免配送费
  BASE_DISTANCE: 3,      // 基础距离 3km
  EXTRA_FEE_PER_KM: 1,   // 超出部分每公里 1 元
  ESTIMATED_TIME_BASE: 25, // 基础预计送达时间（分钟）
  ESTIMATED_TIME_PER_KM: 5 // 每公里增加时间
}

// 模拟骑手数据
const MOCK_RIDERS = [
  { name: '王师傅', phone: '13812345678' },
  { name: '李师傅', phone: '13987654321' },
  { name: '张师傅', phone: '13611223344' },
  { name: '赵师傅', phone: '13755667788' },
  { name: '陈师傅', phone: '13599887766' }
]

/**
 * 计算配送费
 * POST /delivery/fee
 * body: { addressId, subtotal }
 */
router.post('/fee', (req, res) => {
  try {
    const { addressId, subtotal } = req.body
    if (!addressId) return error(req, res, '缺少必填参数: addressId')

    const subtotalNum = parseFloat(subtotal) || 0

    // 满 30 元免配送费
    if (subtotalNum >= DELIVERY_CONFIG.FREE_THRESHOLD) {
      return success(res, {
        deliveryFee: 0,
        distance: 0,
        freeReason: `满${DELIVERY_CONFIG.FREE_THRESHOLD}元免配送费`,
        estimatedTime: DELIVERY_CONFIG.ESTIMATED_TIME_BASE
      })
    }

    // 模拟距离计算（1~8km 随机，基于地址 ID 哈希伪随机）
    const addr = db.find('addresses', a => a.id == addressId)
    let distance = 2.5 // 默认距离
    if (addr) {
      // 用地址 ID 生成伪随机距离
      const hash = String(addr.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0)
      distance = 1 + (hash % 70) / 10 // 1.0 ~ 8.0 km
    }

    // 计算配送费
    let deliveryFee = DELIVERY_CONFIG.BASE_FEE
    if (distance > DELIVERY_CONFIG.BASE_DISTANCE) {
      const extraKm = Math.ceil(distance - DELIVERY_CONFIG.BASE_DISTANCE)
      deliveryFee += extraKm * DELIVERY_CONFIG.EXTRA_FEE_PER_KM
    }

    // 预计送达时间
    const estimatedTime = DELIVERY_CONFIG.ESTIMATED_TIME_BASE +
      Math.ceil(distance) * DELIVERY_CONFIG.ESTIMATED_TIME_PER_KM

    success(res, {
      deliveryFee,
      distance: Math.round(distance * 10) / 10,
      freeThreshold: DELIVERY_CONFIG.FREE_THRESHOLD,
      baseFee: DELIVERY_CONFIG.BASE_FEE,
      estimatedTime
    })
  } catch (err) {
    console.error('[delivery/fee]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

/**
 * 查询配送追踪信息
 * GET /delivery/track?orderId=xxx
 */
router.get('/track', (req, res) => {
  try {
    const { orderId } = req.query
    if (!orderId) return error(req, res, '缺少必填参数: orderId')

    const order = db.find('orders', o => o.id == orderId)
    if (!order) return error(req, res, '订单不存在', 404)
    if (order.dineType !== 'delivery') return error(req, res, '非配送订单')

    // 如果订单还没有配送信息，生成模拟骑手
    let rider = order.delivery && order.delivery.riderName
      ? { name: order.delivery.riderName, phone: order.delivery.riderPhone }
      : MOCK_RIDERS[Math.floor(Math.random() * MOCK_RIDERS.length)]

    // 构建时间轴
    const timeline = []
    const statuses = [
      { key: 'pending', desc: '订单已提交', icon: '📋' },
      { key: 'confirmed', desc: '商家已接单', icon: '✅' },
      { key: 'ready', desc: '制作完成，等待骑手', icon: '🍳' },
      { key: 'delivering', desc: '骑手已取餐，配送中', icon: '🛵' },
      { key: 'completed', desc: '已送达', icon: '📦' }
    ]

    // 状态排序权重
    const statusOrder = { pending: 0, confirmed: 1, ready: 2, delivering: 3, completed: 4, cancelled: -1 }
    const currentWeight = statusOrder[order.status] || 0

    let lastTime = new Date(order.createdAt)
    for (const s of statuses) {
      const sWeight = statusOrder[s.key]
      if (sWeight <= currentWeight) {
        // 已经过的状态，使用递增时间
        const timeOffset = sWeight * 8 * 60 * 1000 // 每步约8分钟
        const time = new Date(lastTime.getTime() + (sWeight > 0 ? timeOffset : 0))
        timeline.push({
          status: s.key,
          desc: s.desc,
          icon: s.icon,
          time: time.toISOString(),
          completed: true
        })
        lastTime = time
      } else {
        // 未来状态
        timeline.push({
          status: s.key,
          desc: s.desc,
          icon: s.icon,
          time: null,
          completed: false
        })
      }
    }

    // 配送信息
    const deliveryInfo = {
      orderId: order.id,
      status: order.status,
      rider,
      address: order.address || null,
      deliveryFee: order.deliveryFee || 0,
      estimatedTime: order.estimatedTime || 30,
      timeline
    }

    success(res, deliveryInfo)
  } catch (err) {
    console.error('[delivery/track]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
