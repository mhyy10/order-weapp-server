const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')
const { useCoupon } = require('./coupon')
const { spendPoints, earnPoints } = require('./points')

// 统一推送：同时走 Socket.IO（管理后台）和原生 WebSocket（小程序）
function notify(req, userId, event, data) {
  // Socket.IO 推送（管理后台用）
  if (req.io) {
    if (userId) {
      req.io.to(`user_${userId}`).emit(event, data)
    } else {
      req.io.emit(event, data)
    }
  }
  // 原生 WebSocket 推送（小程序用）
  if (req.wsBroadcast && userId) {
    req.wsBroadcast(userId, event, data)
  }
}

// 后端价格计算：根据菜品 ID 从数据库获取真实价格
function calculateOrderTotal(items) {
  const dishes = db.get('dishes') || []
  let subtotal = 0
  for (const item of items) {
    const dish = dishes.find(d => d.id == item.dishId)
    if (!dish) continue
    let price = dish.price
    // 规格加价
    if (item.spec && dish.specs) {
      for (const s of dish.specs) {
        const opt = s.options.find(o => o.name === item.spec)
        if (opt) { price = opt.price; break }
      }
    }
    // 加料加价
    if (item.addons && item.addons.length > 0 && dish.addons) {
      for (const a of item.addons) {
        const addon = dish.addons.find(ad => ad.name === a)
        if (addon) price += addon.price
      }
    }
    subtotal += price * (item.quantity || 1)
  }
  return subtotal
}

router.post('/create', (req, res) => {
  try {
    const { userId, tableNo, dineType, peopleCount, items, note, userCouponId, usePoints, addressId, deliveryFee, estimatedTime } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!items || !Array.isArray(items) || items.length === 0) return error(req, res, '缺少必填参数: items(数组且非空)')

    // 用餐方式校验
    const validDineTypes = ['dine_in', 'takeaway', 'delivery']
    const type = validDineTypes.includes(dineType) ? dineType : 'dine_in'
    if (type === 'dine_in' && !tableNo) return error(req, res, '堂食需填写桌号')
    if (type === 'delivery' && !addressId) return error(req, res, '配送需选择收货地址')

    // 数值校验
    const qty = parseInt(peopleCount) || 1
    if (qty < 1 || qty > 50) return error(req, res, '人数不合法')

    // 后端重新计算价格，防止前端篡改
    const subtotal = calculateOrderTotal(items)
    let couponDiscount = 0
    let couponId = null

    // 优惠券计算
    if (userCouponId) {
      const uc = db.find('userCoupons', uc => uc.id == userCouponId && uc.userId == userId && uc.status === 'available')
      if (uc) {
        const coupon = db.find('coupons', c => c.id === uc.couponId)
        if (coupon && coupon.isActive) {
          if (coupon.type === 'reduction' && subtotal >= coupon.threshold) {
            couponDiscount = coupon.value
            couponId = coupon.id
          } else if (coupon.type === 'discount' && subtotal >= coupon.threshold) {
            couponDiscount = Math.round(subtotal * (1 - coupon.value))
            couponId = coupon.id
          }
        }
      }
    }

    const baseDiscount = subtotal >= 100 ? 5 : 0
    const serviceFee = type === 'dine_in' ? qty * 3 : 0
    const orderDeliveryFee = type === 'delivery' ? (parseFloat(deliveryFee) || 0) : 0

    // 积分抵扣计算（100积分=1元，最多抵扣订单金额的30%）
    let pointsDiscount = 0
    let pointsUsed = 0
    const amountForPointsCalc = subtotal - baseDiscount - couponDiscount + serviceFee + orderDeliveryFee
    const maxPointsDiscount = Math.floor(amountForPointsCalc * 0.3) // 最多抵扣30%
    if (usePoints && usePoints > 0) {
      const userPoints = db.find('points', p => p.userId == userId)
      if (userPoints && userPoints.balance > 0) {
        pointsUsed = Math.min(usePoints, userPoints.balance)
        const pointsToYuan = Math.floor(pointsUsed / 100) // 100积分=1元
        pointsDiscount = Math.min(pointsToYuan, maxPointsDiscount)
        // 重新计算实际使用积分（可能不全部用完）
        pointsUsed = Math.min(pointsUsed, pointsDiscount * 100 + (pointsUsed % 100))
        // 精确计算：按实际抵扣金额反推需要的积分
        pointsUsed = pointsDiscount * 100
        if (pointsUsed > userPoints.balance) {
          pointsUsed = Math.floor(userPoints.balance / 100) * 100
          pointsDiscount = pointsUsed / 100
        }
      }
    }

    const total = amountForPointsCalc - pointsDiscount

    // 地址校验
    let addressInfo = null
    if (addressId) {
      const addr = db.find('addresses', a => a.id == addressId && a.userId == userId)
      if (!addr) return error(req, res, '地址不存在或不属于该用户')
      addressInfo = {
        addressId: addr.id,
        name: addr.name,
        phone: addr.phone,
        province: addr.province,
        city: addr.city,
        district: addr.district,
        detail: addr.detail
      }
    }

    const now = new Date()
    const orderId = 'ORD' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0') + String(Math.floor(Math.random()*1000)).padStart(3,'0')
    const order = {
      id: orderId,
      userId: parseInt(userId),
      tableNo: type === 'dine_in' ? (tableNo || '') : '',
      dineType: type,
      peopleCount: type === 'dine_in' ? qty : 0,
      items,
      subtotal,
      discount: baseDiscount,
      couponDiscount,
      couponId,
      pointsDiscount,
      pointsUsed,
      deliveryFee: orderDeliveryFee,
      estimatedTime: type === 'delivery' ? (parseInt(estimatedTime) || 30) : 0,
      total,
      note: note || '',
      address: addressInfo,
      status: 'pending',
      createdAt: now.toISOString()
    }
    db.push('orders', order)

    // 使用优惠券
    if (userCouponId && couponDiscount > 0) {
      useCoupon(userCouponId, orderId)
    }

    // 扣减积分
    if (pointsUsed > 0) {
      spendPoints(userId, pointsUsed, orderId, '订单积分抵扣')
    }

    // Clear cart
    const carts = db.get('carts') || {}
    carts[userId] = []
    db.set('carts', carts)

    // WebSocket 推送：新订单通知
    notify(req, null, 'order:new', { orderId, userId: parseInt(userId), tableNo, total })

    success(res, order)
  } catch (err) {
    console.error('[order/create]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/list', (req, res) => {
  try {
    const { userId, status } = req.query
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    if (!userId) return error(req, res, '缺少 userId')
    let all = db.filter('orders', o => o.userId == userId)
    if (status) {
      all = all.filter(o => o.status === status)
    }
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const total = all.length
    const start = (page - 1) * pageSize
    const list = all.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[order/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.get('/detail', (req, res) => {
  try {
    const { id } = req.query
    if (!id) return error(req, res, '缺少 id')
    const order = db.find('orders', o => o.id == id)
    if (!order) return error(req, res, '订单不存在', 404)
    success(res, order)
  } catch (err) {
    console.error('[order/detail]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 商家接单：pending → confirmed
router.post('/accept', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const order = db.find('orders', o => o.id == id)
    if (!order) return error(req, res, '订单不存在', 404)
    if (order.status !== 'pending') return error(req, res, '当前状态不可接单')
    db.update('orders', o => o.id == id, o => { o.status = 'confirmed' })
    order.status = 'confirmed'
    notify(req, order.userId, 'order:status', { orderId: id, status: 'confirmed' })
    success(res, order)
  } catch (err) {
    console.error('[order/accept]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 商家出餐：confirmed → ready
router.post('/ready', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const order = db.find('orders', o => o.id == id)
    if (!order) return error(req, res, '订单不存在', 404)
    if (order.status !== 'confirmed') return error(req, res, '当前状态不可出餐')
    db.update('orders', o => o.id == id, o => { o.status = 'ready' })
    order.status = 'ready'
    notify(req, order.userId, 'order:status', { orderId: id, status: 'ready' })
    success(res, order)
  } catch (err) {
    console.error('[order/ready]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

router.post('/cancel', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const order = db.update('orders', o => o.id == id, o => { o.status = 'cancelled' })
    if (!order) return error(req, res, '订单不存在', 404)
    notify(req, order.userId, 'order:status', { orderId: id, status: 'cancelled' })
    success(res, order)
  } catch (err) {
    console.error('[order/cancel]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 确认取餐：ready → completed（堂食/自提）
router.post('/complete', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const order = db.find('orders', o => o.id == id)
    if (!order) return error(req, res, '订单不存在', 404)
    // 堂食/自提从 ready 完成；配送订单需从 delivering 完成
    if (order.dineType === 'delivery') {
      if (order.status !== 'delivering') return error(req, res, '配送订单需先确认配送中')
    } else {
      if (order.status !== 'ready') return error(req, res, '当前状态不可完成')
    }
    db.update('orders', o => o.id == id, o => { o.status = 'completed' })
    order.status = 'completed'

    // 订单完成后自动获取积分（消费金额 x 1，1元=1积分）
    if (order.total > 0) {
      earnPoints(order.userId, Math.floor(order.total), 'order', id, '下单奖励')
    }

    notify(req, order.userId, 'order:status', { orderId: id, status: 'completed' })
    success(res, order)
  } catch (err) {
    console.error('[order/complete]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 骑手取餐：ready → delivering（仅配送订单）
router.post('/delivering', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const order = db.find('orders', o => o.id == id)
    if (!order) return error(req, res, '订单不存在', 404)
    if (order.dineType !== 'delivery') return error(req, res, '非配送订单不可执行此操作')
    if (order.status !== 'ready') return error(req, res, '当前状态不可配送')

    // 生成模拟骑手信息
    const riders = [
      { name: '王师傅', phone: '13812345678' },
      { name: '李师傅', phone: '13987654321' },
      { name: '张师傅', phone: '13611223344' },
      { name: '赵师傅', phone: '13755667788' },
      { name: '陈师傅', phone: '13599887766' }
    ]
    const rider = riders[Math.floor(Math.random() * riders.length)]

    db.update('orders', o => o.id == id, o => {
      o.status = 'delivering'
      o.delivery = o.delivery || {}
      o.delivery.riderName = rider.name
      o.delivery.riderPhone = rider.phone
      o.delivery.pickupTime = new Date().toISOString()
      o.delivery.deliveringTime = new Date().toISOString()
    })
    order.status = 'delivering'
    order.delivery = order.delivery || {}
    order.delivery.riderName = rider.name
    order.delivery.riderPhone = rider.phone

    notify(req, order.userId, 'order:delivering', { orderId: id, status: 'delivering', rider })
    success(res, order)
  } catch (err) {
    console.error('[order/delivering]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 确认收货：delivering → completed（配送订单用户确认）
router.post('/delivered', (req, res) => {
  try {
    const { id } = req.body
    if (!id) return error(req, res, '缺少 id')
    const order = db.find('orders', o => o.id == id)
    if (!order) return error(req, res, '订单不存在', 404)
    if (order.status !== 'delivering') return error(req, res, '当前状态不可确认收货')

    db.update('orders', o => o.id == id, o => {
      o.status = 'completed'
      if (o.delivery) o.delivery.deliveredTime = new Date().toISOString()
    })
    order.status = 'completed'
    if (order.delivery) order.delivery.deliveredTime = new Date().toISOString()

    // 订单完成后自动获取积分
    if (order.total > 0) {
      earnPoints(order.userId, Math.floor(order.total), 'order', id, '下单奖励')
    }

    notify(req, order.userId, 'order:delivered', { orderId: id, status: 'completed' })
    success(res, order)
  } catch (err) {
    console.error('[order/delivered]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
