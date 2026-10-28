const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const OrderStatusHistory = require('../models/OrderStatusHistory');

const RESERVATION_MS = 30 * 60 * 1000;
const transitions = {
  pending_payment: ['awaiting_verification', 'cancelled'],
  awaiting_verification: ['payment_verified', 'rejected', 'cancelled'],
  payment_verified: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [], rejected: [], cancelled: [],
};

function fail(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode });
}

function assertTransition(order, status, actor, { customer = false, system = false } = {}) {
  if (system) {
    if (status !== 'cancelled' || order.status !== 'pending_payment') fail('Invalid expiry transition');
  } else if (customer) {
    if (String(order.userId) !== String(actor.id)) fail('Order not found', 404);
    if (!['cancelled', 'awaiting_verification'].includes(status) || order.status !== 'pending_payment') {
      fail('Only pending orders can be updated');
    }
  } else {
    if (!['admin', 'master_admin'].includes(actor?.role)) fail('Admin access required', 403);
    if (['payment_verified', 'rejected', 'pending_payment', 'awaiting_verification'].includes(status)
      && actor.role !== 'master_admin') fail('Master Admin access required', 403);
  }
  if (status === order.status) return;
  if (!transitions[order.status]?.includes(status)) fail('Invalid order status transition');
  if (['processing', 'shipped', 'delivered'].includes(status) && order.payment?.status !== 'captured') {
    fail('Payment must be approved before fulfillment');
  }
  if (status === 'awaiting_verification' && Date.now() - new Date(order.createdAt).getTime() >= RESERVATION_MS) {
    fail('Payment reservation expired; please place a new order');
  }
}

async function transitionOrder(id, status, actor, options = {}) {
  let result;
  await mongoose.connection.transaction(async (session) => {
    const query = options.customer ? { _id: id, userId: actor.id } : { _id: id };
    const order = await Order.findOne(query).session(session);
    if (!order) fail('Order not found', 404);
    if (options.expectedStatus && order.status !== options.expectedStatus) {
      fail('Order is not awaiting verification');
    }
    assertTransition(order, status, actor, options);
    if (status === order.status) { result = order; return; }
    const oldStatus = order.status;

    if (['cancelled', 'rejected'].includes(status) && !order.stockRestored) {
      for (const item of order.items) {
        await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } }, { session });
      }
      order.stockRestored = true;
    }
    if (status === 'payment_verified') {
      order.payment.status = 'captured';
      for (const item of order.items) {
        await Product.updateOne({ _id: item.productId }, { $inc: { salesCount: item.quantity } }, { session });
      }
    } else if (status === 'awaiting_verification') {
      order.payment.status = 'awaiting_verification';
      if (options.utr) order.utr = options.utr;
      if (options.screenshotUrl) order.screenshotUrl = options.screenshotUrl;
    } else if (status === 'rejected') order.payment.status = 'failed';
    else if (status === 'cancelled') order.payment.status = 'cancelled';

    order.status = status;
    const note = options.note || `Order status updated to ${status}`;
    order.timeline.push({ status, note });
    await order.save({ session });
    await OrderStatusHistory.create([{
      orderId: order._id, oldStatus, newStatus: status,
      changedBy: actor.id, note,
    }], { session });
    result = order;
  });
  return result;
}

// Request-driven cleanup works in Appwrite without a persistent worker. Bound
// each batch; repeated traffic drains a backlog without one long invocation.
let sweepPromise;
let nextSweepAt = 0;
async function releaseExpiredReservations() {
  if (sweepPromise) return sweepPromise;
  if (Date.now() < nextSweepAt) return;
  sweepPromise = (async () => {
    const orders = await Order.find({
      status: 'pending_payment', createdAt: { $lte: new Date(Date.now() - RESERVATION_MS) }
    }).select('_id userId').limit(25).lean();
    for (const order of orders) {
      try {
        await transitionOrder(order._id, 'cancelled', { id: order.userId }, {
          system: true, note: 'Unpaid reservation expired'
        });
      } catch (error) {
        // A simultaneous payment/cancellation may have won the transaction.
        if (![404, 409].includes(error.statusCode)) throw error;
      }
    }
    nextSweepAt = Date.now() + (orders.length === 25 ? 0 : 60 * 1000);
  })().finally(() => { sweepPromise = null; });
  return sweepPromise;
}

module.exports = { assertTransition, transitionOrder, releaseExpiredReservations, RESERVATION_MS };
