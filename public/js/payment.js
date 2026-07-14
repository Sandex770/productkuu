// File: public/js/payment.js
import { db, collections, doc, updateDoc, serverTimestamp } from './firebase-config.js';
import { showToast, navigate } from './app.js';

// ============================================
// PAYMENT HANDLER
// ============================================

export function initPayment() {
    // Load Midtrans Snap
    const script = document.createElement('script');
    script.src = 'https://app.sandbox.midtrans.com/snap/snap.js';
    script.setAttribute('data-client-key', 'YOUR_CLIENT_KEY');
    document.head.appendChild(script);
}

// ============================================
// CREATE PAYMENT
// ============================================

export async function createPayment(orderData) {
    try {
        const response = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        
        if (!response.ok) throw new Error('Failed to create payment');
        return await response.json();
        
    } catch (error) {
        console.error('Error creating payment:', error);
        throw error;
    }
}

// ============================================
// PROCESS PAYMENT
// ============================================

export function processPayment(token, orderId, callbacks = {}) {
    if (typeof snap === 'undefined') {
        showToast('error', 'Payment system not loaded');
        return;
    }
    
    snap.pay(token, {
        onSuccess: async function(result) {
            await updateOrderStatus(orderId, 'settlement', result);
            if (callbacks.onSuccess) callbacks.onSuccess(result);
            showToast('success', 'Pembayaran berhasil! 🎉');
            navigate(`/order/${orderId}`);
        },
        onPending: async function(result) {
            await updateOrderStatus(orderId, 'pending', result);
            if (callbacks.onPending) callbacks.onPending(result);
            showToast('info', 'Menunggu pembayaran...');
            navigate(`/order/${orderId}`);
        },
        onError: async function(result) {
            await updateOrderStatus(orderId, 'failed', result);
            if (callbacks.onError) callbacks.onError(result);
            showToast('error', 'Pembayaran gagal');
        },
        onClose: function() {
            if (callbacks.onClose) callbacks.onClose();
            showToast('info', 'Pembayaran dibatalkan');
        }
    });
}

// ============================================
// UPDATE ORDER STATUS
// ============================================

async function updateOrderStatus(orderId, status, result) {
    try {
        const orderRef = doc(db, collections.orders, orderId);
        await updateDoc(orderRef, {
            paymentStatus: status,
            status: status === 'settlement' ? 'paid' : status,
            midtransResponse: result,
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating order:', error);
    }
}

// ============================================
// CHECK ORDER STATUS
// ============================================

export async function checkOrderStatus(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`);
        if (!response.ok) throw new Error('Order not found');
        return await response.json();
    } catch (error) {
        console.error('Error checking order:', error);
        throw error;
    }
}

// ============================================
// HANDLE PAYMENT NOTIFICATION
// ============================================

export function handlePaymentNotification(notification) {
    // This is called from the webhook endpoint
    // The actual processing is done on the server
    console.log('Payment notification received:', notification);
}