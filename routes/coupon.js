const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 可领取的优惠券列表
router.get('/list', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 20
    const now = new Date().toISOString()
    const filtered = db.filter('coupons', c =>
      c.isActive && c.endDate >= now && c.claimed < c.total
    )
    const total = filtered.length
    const start = (page - 1) * pageSize
    const list = filtered.slice(start, start + pageSize)
    success(res, { list, total, page, pageSize })
  } catch (err) {
    console.error('[coupon/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 我的优惠券
router.get('/my', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少 userId')
    const userCoupons = db.filter('userCoupons', uc => uc.userId == userId)
    const coupons = db.get('coupons') || []
    // 附加优惠券详情
    const result = userCoupons.map(uc => {
      const coupon = coupons.find(c => c.id === uc.couponId)
      return { ...uc, coupon: coupon || null }
    })
    success(res, result)
  } catch (err) {
    console.error('[coupon/my]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 领取优惠券
router.post('/claim', (req, res) => {
  try {
    const { userId, couponId } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!couponId) return error(req, res, '缺少必填参数: couponId')
    const coupon = db.find('coupons', c => c.id == couponId)
    if (!coupon) return error(req, res, '优惠券不存在')
    if (!coupon.isActive) return error(req, res, '优惠券已下架')
    if (coupon.claimed >= coupon.total) return error(req, res, '优惠券已领完')
    const now = new Date().toISOString()
    if (coupon.endDate < now) return error(req, res, '优惠券已过期')
    // 检查是否已领取
    const existing = db.find('userCoupons', uc => uc.userId == userId && uc.couponId == couponId)
    if (existing) return error(req, res, '已领取过该优惠券')
    // 领取
    coupon.claimed = (coupon.claimed || 0) + 1
    db._scheduleSave()
    const userCoupon = {
      id: Date.now(),
      userId: parseInt(userId),
      couponId: parseInt(couponId),
      status: 'available',
      usedOrderId: null,
      claimedAt: now,
      usedAt: null
    }
    db.push('userCoupons', userCoupon)
    success(res, { ...userCoupon, coupon })
  } catch (err) {
    console.error('[coupon/claim]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 计算可用优惠（下单时调用）
router.post('/apply', (req, res) => {
  try {
    const { userId, couponCode, subtotal } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    // couponCode 为可选参数，保持向后兼容；subtotal 用于优惠门槛校验
    const orderAmount = parseFloat(subtotal)
    if (!orderAmount || orderAmount <= 0) return error(req, res, '缺少必填参数: orderAmount(正数)')
    // 获取用户可用优惠券
    const userCoupons = db.filter('userCoupons', uc =>
      uc.userId == userId && uc.status === 'available'
    )
    const coupons = db.get('coupons') || []
    const now = new Date().toISOString()

    // 筛选出当前可用的券（未过期、满足门槛）
    const available = userCoupons.map(uc => {
      const coupon = coupons.find(c => c.id === uc.couponId)
      if (!coupon) return null
      if (coupon.endDate < now) return null
      // 计算优惠金额
      let discount = 0
      if (coupon.type === 'reduction') {
        // 满减券：满 threshold 减 value
        if (orderAmount >= coupon.threshold) discount = coupon.value
      } else if (coupon.type === 'discount') {
        // 折扣券：满 threshold 打 value 折
        if (orderAmount >= coupon.threshold) discount = Math.round(orderAmount * (1 - coupon.value))
      }
      return {
        userCouponId: uc.id,
        couponId: coupon.id,
        couponName: coupon.name,
        couponType: coupon.type,
        discount,
        canUse: discount > 0,
        reason: discount > 0 ? '' : `未满¥${coupon.threshold}`
      }
    }).filter(Boolean)

    // 按优惠金额排序
    available.sort((a, b) => b.discount - a.discount)

    success(res, available)
  } catch (err) {
    console.error('[coupon/apply]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 使用优惠券（下单时内部调用）
function useCoupon(userCouponId, orderId) {
  const uc = db.find('userCoupons', uc => uc.id == userCouponId)
  if (uc) {
    uc.status = 'used'
    uc.usedOrderId = orderId
    uc.usedAt = new Date().toISOString()
    db._scheduleSave()
    return true
  }
  return false
}

module.exports = router
module.exports.useCoupon = useCoupon
