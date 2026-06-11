const express = require('express')
const router = express.Router()
const db = require('../db')
const { success, error } = require('../utils/response')

// 查询用户地址列表
router.get('/list', (req, res) => {
  try {
    const { userId } = req.query
    if (!userId) return error(req, res, '缺少必填参数: userId')
    const addresses = db.filter('addresses', a => a.userId == userId)
      .sort((a, b) => {
        // 默认地址排前面
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
    success(res, addresses)
  } catch (err) {
    console.error('[address/list]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 新增地址
router.post('/add', (req, res) => {
  try {
    const { userId, name, phone, province, city, district, detail, isDefault } = req.body
    if (!userId) return error(req, res, '缺少必填参数: userId')
    if (!name) return error(req, res, '缺少必填参数: name')
    if (!phone) return error(req, res, '缺少必填参数: phone')
    if (!province) return error(req, res, '缺少必填参数: province')
    if (!city) return error(req, res, '缺少必填参数: city')
    if (!district) return error(req, res, '缺少必填参数: district')
    if (!detail) return error(req, res, '缺少必填参数: detail')

    // 手机号格式校验
    if (!/^1\d{10}$/.test(phone)) return error(req, res, '手机号格式不正确')

    const userAddresses = db.filter('addresses', a => a.userId == userId)
    const isFirst = userAddresses.length === 0
    const shouldBeDefault = isDefault || isFirst

    // 如果设为默认，先取消该用户其他默认地址
    if (shouldBeDefault) {
      db.update('addresses', a => a.userId == userId && a.isDefault, a => { a.isDefault = false })
    }

    const address = {
      id: 'addr_' + Date.now(),
      userId: parseInt(userId),
      name,
      phone,
      province,
      city,
      district,
      detail,
      isDefault: shouldBeDefault,
      createdAt: new Date().toISOString()
    }
    db.push('addresses', address)
    success(res, address)
  } catch (err) {
    console.error('[address/add]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 更新地址
router.put('/update', (req, res) => {
  try {
    const { id, name, phone, province, city, district, detail, isDefault } = req.body
    if (!id) return error(req, res, '缺少必填参数: id')

    // 手机号格式校验
    if (phone && !/^1\d{10}$/.test(phone)) return error(req, res, '手机号格式不正确')

    const address = db.find('addresses', a => a.id == id)
    if (!address) return error(req, res, '地址不存在', 404)

    // 如果设为默认，先取消该用户其他默认地址
    if (isDefault) {
      db.update('addresses', a => a.userId == address.userId && a.isDefault, a => { a.isDefault = false })
    }

    // 更新字段
    if (name) address.name = name
    if (phone) address.phone = phone
    if (province) address.province = province
    if (city) address.city = city
    if (district) address.district = district
    if (detail) address.detail = detail
    if (isDefault !== undefined) address.isDefault = isDefault

    db._scheduleSave()
    success(res, address)
  } catch (err) {
    console.error('[address/update]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 删除地址
router.delete('/delete', (req, res) => {
  try {
    const { id, userId } = req.body
    if (!id) return error(req, res, '缺少必填参数: id')
    if (!userId) return error(req, res, '缺少必填参数: userId')

    const address = db.find('addresses', a => a.id == id && a.userId == userId)
    if (!address) return error(req, res, '地址不存在', 404)

    const wasDefault = address.isDefault
    db.splice('addresses', a => a.id == id)

    // 如果删除的是默认地址，将第一个地址设为默认
    if (wasDefault) {
      const remaining = db.filter('addresses', a => a.userId == userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      if (remaining.length > 0) {
        db.update('addresses', a => a.id == remaining[0].id, a => { a.isDefault = true })
      }
    }

    success(res, { deleted: true })
  } catch (err) {
    console.error('[address/delete]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

// 设为默认地址
router.post('/setDefault', (req, res) => {
  try {
    const { id, userId } = req.body
    if (!id) return error(req, res, '缺少必填参数: id')
    if (!userId) return error(req, res, '缺少必填参数: userId')

    const address = db.find('addresses', a => a.id == id && a.userId == userId)
    if (!address) return error(req, res, '地址不存在', 404)

    // 取消该用户其他默认地址
    db.update('addresses', a => a.userId == userId && a.isDefault, a => { a.isDefault = false })
    // 设为默认
    db.update('addresses', a => a.id == id, a => { a.isDefault = true })

    address.isDefault = true
    success(res, address)
  } catch (err) {
    console.error('[address/setDefault]', err)
    res.status(500).json({ code: -1, msg: '服务器错误' })
  }
})

module.exports = router
