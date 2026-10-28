const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const validate = require('../middleware/validate');
const Order = require('../models/Order');
const { getSettings } = require('../utils/settingsCache');

const { transitionOrder } = require('../utils/orderTransitions');
const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const orders = ['admin', 'master_admin'].includes(req.user.role)
      ? await Order.find().populate('userId', 'email').populate('items.productId', 'images').sort({ createdAt: -1 })
      : await Order.find({ userId: req.user.id }).populate('userId', 'email').populate('items.productId', 'images').sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const query = ['admin', 'master_admin'].includes(req.user.role) ? { _id: req.params.id } : { _id: req.params.id, userId: req.user.id };
    const order = await Order.findOne(query).populate('items.productId', 'images');
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }
    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', auth, async (req, res, next) => {
  try {
    const order = await transitionOrder(req.params.id, 'cancelled', req.user, {
      customer: true, note: 'Order cancelled by customer'
    });

    res.json(order);
  } catch (error) {
    next(error);
  }
});

const statusSchema = z.object({
  body: z.object({
    status: z.enum([
      'pending_payment',
      'awaiting_verification',
      'payment_verified',
      'rejected',
      'processing',
      'shipped',
      'delivered',
      'cancelled'
    ]),
    note: z.string().max(1000).optional(),
  }),
  query: z.object({}),
  params: z.object({ id: z.string() }),
});

router.patch('/:id/status', auth, adminOnly, validate(statusSchema), async (req, res, next) => {
  try {
    const order = await transitionOrder(req.validated.params.id, req.validated.body.status, req.user, {
      note: req.validated.body.note
    });

    res.json(order);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/generate-qr', auth, async (req, res, next) => {
  try {
    const query = ['admin', 'master_admin'].includes(req.user.role) ? { _id: req.params.id } : { _id: req.params.id, userId: req.user.id };
    const order = await Order.findOne(query);
    if (!order) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    if (order.status !== 'pending_payment') {
      const err = new Error('QR can only be generated for pending payments');
      err.statusCode = 400;
      throw err;
    }

    const settings = await getSettings();

    const upiId = settings.upiId || 'test@upi';
    const payeeName = settings.payeeName || 'Store Name';
    const qrExpiryMinutes = settings.qrExpiryMinutes ? Number(settings.qrExpiryMinutes) : 10;

    order.qrGeneratedAt = new Date();
    await order.save();

    res.json({
      upiId,
      payeeName,
      qrExpiryMinutes,
      qrGeneratedAt: order.qrGeneratedAt,
      enableUtrSubmission: settings.enableUtrSubmission !== false,
      enableScreenshotUpload: settings.enableScreenshotUpload !== false
    });
  } catch (error) {
    next(error);
  }
});

const paymentDoneSchema = z.object({
  body: z.object({
    utr: z.string().trim().min(6).max(100).optional(),
    screenshotUrl: z.string().url().max(2048).refine(value => value.startsWith('https://'), 'HTTPS required').optional()
  }),
  query: z.object({}),
  params: z.object({ id: z.string() })
});

router.post('/:id/payment-done', auth, validate(paymentDoneSchema), async (req, res, next) => {
  try {
    const order = await transitionOrder(req.validated.params.id, 'awaiting_verification', req.user, {
      customer: true, ...req.validated.body, note: 'Payment submitted by customer'
    });

    res.json(order);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
