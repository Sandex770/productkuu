const express = require('express');
const midtransClient = require('midtrans-client');
const path = require('path');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Firebase Admin
const serviceAccount = require('../firebase/serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Create Snap API instance
const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateOrderId = () => {
    const prefix = 'PK';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${date}-${random}`;
};

const generateProductCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const formatPrice = (price) => {
    return new Intl.NumberFormat('id-ID').format(price);
};

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// PRODUCT ENDPOINTS
// ============================================

app.get('/api/products', async (req, res) => {
    try {
        const { 
            category, 
            search, 
            minPrice, 
            maxPrice, 
            sort = 'createdAt_desc',
            page = 1,
            limit = 20,
            sellerId,
            status = 'published'
        } = req.query;

        let query = db.collection('products');
        let constraints = [];

        if (status) {
            constraints.push(admin.firestore.where('status', '==', status));
        }

        if (category && category !== 'all') {
            constraints.push(admin.firestore.where('category', '==', category));
        }

        if (sellerId) {
            constraints.push(admin.firestore.where('sellerId', '==', sellerId));
        }

        if (minPrice) {
            constraints.push(admin.firestore.where('price', '>=', parseInt(minPrice)));
        }

        if (maxPrice) {
            constraints.push(admin.firestore.where('price', '<=', parseInt(maxPrice)));
        }

        constraints.forEach(constraint => {
            query = query.where(constraint.fieldPath, constraint.opStr, constraint.value);
        });

        if (search) {
            query = query.where('name', '>=', search)
                         .where('name', '<=', search + '\uf8ff');
        }

        const [sortField, sortOrder] = sort.split('_');
        query = query.orderBy(sortField, sortOrder);

        const startAt = (parseInt(page) - 1) * parseInt(limit);
        query = query.limit(parseInt(limit));

        const snapshot = await query.get();
        
        const products = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            products.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            });
        });

        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

        res.json({
            products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            error: 'Failed to fetch products',
            details: error.message
        });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        const data = productDoc.data();
        
        let seller = null;
        if (data.sellerId) {
            const sellerRef = db.collection('users').doc(data.sellerId);
            const sellerDoc = await sellerRef.get();
            if (sellerDoc.exists) {
                seller = {
                    id: sellerDoc.id,
                    ...sellerDoc.data()
                };
            }
        }

        const reviewsQuery = await db.collection('reviews')
            .where('productId', '==', id)
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        const reviews = [];
        reviewsQuery.forEach(doc => {
            reviews.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
            });
        });

        res.json({
            id: productDoc.id,
            ...data,
            seller,
            reviews,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });

    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            error: 'Failed to fetch product',
            details: error.message
        });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { 
            name, 
            category, 
            price, 
            description, 
            type = 'digital',
            downloadLink,
            demoLink,
            tags = [],
            stock = 0,
            unlimited = false,
            sellerId,
            note = '',
            premiumAccounts = [],
            imageUrl
        } = req.body;

        if (!name || !category || !price || !sellerId) {
            return res.status(400).json({
                error: 'Name, category, price, and sellerId are required'
            });
        }

        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();
        if (!sellerDoc.exists) {
            return res.status(404).json({
                error: 'Seller not found'
            });
        }

        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        let productCode = generateProductCode();
        let codeExists = true;
        let attempts = 0;
        while (codeExists && attempts < 50) {
            const checkSnapshot = await db.collection('products')
                .where('productCode', '==', productCode)
                .limit(1)
                .get();
            if (checkSnapshot.empty) {
                codeExists = false;
            } else {
                productCode = generateProductCode();
                attempts++;
            }
        }

        const productData = {
            name,
            slug,
            category,
            price: parseInt(price),
            description: description || '',
            type,
            sellerId,
            status: 'draft',
            stock: unlimited ? 'unlimited' : parseInt(stock),
            unlimited: Boolean(unlimited),
            tags: Array.isArray(tags) ? tags : [],
            sales: 0,
            views: 0,
            isTrending: false,
            isBestSeller: false,
            isPremium: false,
            isNew: true,
            imageUrl: imageUrl || '',
            productCode: productCode,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (type === 'digital') {
            if (!downloadLink) {
                return res.status(400).json({
                    error: 'Download link is required for digital products'
                });
            }
            productData.downloadLink = downloadLink;
            if (demoLink) productData.demoLink = demoLink;
        } else if (type === 'premium-account') {
            if (!premiumAccounts || premiumAccounts.length === 0) {
                return res.status(400).json({
                    error: 'At least one premium account is required'
                });
            }
            productData.premiumAccounts = premiumAccounts;
            productData.note = note;
            productData.stock = premiumAccounts.length;
        }

        const docRef = await db.collection('products').add(productData);

        await db.collection('notifications').add({
            type: 'product_created',
            title: 'Produk Baru Menunggu Review',
            message: `${name} oleh ${sellerDoc.data().storeName || 'Seller'}`,
            userId: 'admin',
            productId: docRef.id,
            sellerId,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(201).json({
            id: docRef.id,
            ...productData,
            createdAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            error: 'Failed to create product',
            details: error.message
        });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        delete updates.id;
        delete updates.createdAt;
        delete updates.sales;
        delete updates.views;
        delete updates.productCode;

        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

        await productRef.update(updates);

        res.json({
            id,
            ...updates,
            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            error: 'Failed to update product',
            details: error.message
        });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const productRef = db.collection('products').doc(id);
        const productDoc = await productRef.get();

        if (!productDoc.exists) {
            return res.status(404).json({
                error: 'Product not found'
            });
        }

        await productRef.delete();

        res.json({
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            error: 'Failed to delete product',
            details: error.message
        });
    }
});

// ============================================
// ORDER ENDPOINTS
// ============================================

app.post('/api/orders', async (req, res) => {
    try {
        const { 
            productId, 
            buyerName, 
            buyerEmail, 
            buyerPhone,
            sellerId,
            amount,
            productName
        } = req.body;

        if (!productId || !buyerName || !buyerEmail || !amount) {
            return res.status(400).json({
                error: 'Product ID, buyer name, email, and amount are required'
            });
        }

        const orderId = generateOrderId();

        const orderData = {
            orderId,
            productId,
            productName: productName || 'Product',
            buyerName,
            buyerEmail,
            buyerPhone: buyerPhone || '',
            sellerId: sellerId || '',
            amount: parseInt(amount),
            status: 'pending',
            paymentStatus: 'pending',
            paymentMethod: 'midtrans',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('orders').add(orderData);

        res.status(201).json({
            id: docRef.id,
            orderId,
            ...orderData
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({
            error: 'Failed to create order',
            details: error.message
        });
    }
});

app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const snapshot = await db.collection('orders')
            .where('orderId', '==', orderId)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        const emailParts = data.buyerEmail.split('@');
        const maskedEmail = emailParts[0].length > 2 
            ? emailParts[0].substring(0, 2) + '*'.repeat(Math.min(emailParts[0].length - 2, 4)) + '@' + emailParts[1]
            : data.buyerEmail;

        res.json({
            id: doc.id,
            ...data,
            buyerEmail: maskedEmail,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });

    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({
            error: 'Failed to fetch order',
            details: error.message
        });
    }
});

app.patch('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paymentStatus } = req.body;

        const orderRef = db.collection('orders').doc(id);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const updates = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (status) updates.status = status;
        if (paymentStatus) updates.paymentStatus = paymentStatus;

        await orderRef.update(updates);

        if (paymentStatus === 'paid' || paymentStatus === 'settlement') {
            const data = orderDoc.data();
            
            await db.collection('products').doc(data.productId).update({
                sales: admin.firestore.FieldValue.increment(1)
            });

            if (data.sellerId) {
                const sellerRef = db.collection('users').doc(data.sellerId);
                await sellerRef.update({
                    'wallet.holding': admin.firestore.FieldValue.increment(data.amount || 0)
                });

                await db.collection('notifications').add({
                    type: 'order_paid',
                    title: 'Produk Terjual!',
                    message: `${data.productName} telah dibayar oleh ${data.buyerName}`,
                    userId: data.sellerId,
                    orderId: id,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        res.json({
            id,
            ...updates,
            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error updating order:', error);
        res.status(500).json({
            error: 'Failed to update order',
            details: error.message
        });
    }
});

app.get('/api/seller/:sellerId/orders', async (req, res) => {
    try {
        const { sellerId } = req.params;
        const { status, page = 1, limit = 20 } = req.query;

        let query = db.collection('orders')
            .where('sellerId', '==', sellerId);

        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset((parseInt(page) - 1) * parseInt(limit));

        const snapshot = await query.get();
        
        const orders = [];
        snapshot.forEach(doc => {
            orders.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
            });
        });

        res.json({
            orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching seller orders:', error);
        res.status(500).json({
            error: 'Failed to fetch orders',
            details: error.message
        });
    }
});

// ============================================
// PAYMENT ENDPOINTS
// ============================================

// ============================================
// CREATE MIDTRANS PAYMENT (UNTUK BANNER & PRODUK)
// ============================================

app.post('/api/payment/create', async (req, res) => {
    try {
        const { 
            orderId, 
            amount, 
            buyerName, 
            buyerEmail, 
            buyerPhone, 
            productName
        } = req.body;

        console.log('📦 [PAYMENT CREATE] Request:', { 
            orderId, 
            amount, 
            buyerName, 
            buyerEmail, 
            productName 
        });

        // Validasi
        if (!orderId) {
            return res.status(400).json({
                error: 'Order ID is required'
            });
        }

        if (!amount || amount < 100) {
            return res.status(400).json({
                error: 'Invalid amount (minimum Rp 100)'
            });
        }

        // Base URL untuk callback (opsional, karena kita pakai Snap callback)
        const baseUrl = process.env.APP_URL || 'https://productkuu.vercel.app';

        // Parameter Midtrans
        const parameter = {
            transaction_details: {
                order_id: orderId,
                gross_amount: parseInt(amount)
            },
            customer_details: {
                first_name: buyerName || 'Customer',
                email: buyerEmail || 'customer@example.com',
                phone: buyerPhone || '08123456789'
            },
            item_details: [
                {
                    id: 'BANNER_PROMO',
                    price: parseInt(amount),
                    quantity: 1,
                    name: productName || 'Banner Promosi'
                }
            ],
            credit_card: {
                secure: true
            },
            // Callback tetap disertakan untuk fallback
            callbacks: {
    finish: `${baseUrl}/success.html?order=${orderId}&status=success`,
    error: `${baseUrl}/success.html?order=${orderId}&status=error`,
    pending: `${baseUrl}/success.html?order=${orderId}&status=pending`
}
        };

        console.log('🔐 [PAYMENT CREATE] Creating Midtrans transaction...');
        const transaction = await snap.createTransaction(parameter);
        
        console.log('✅ [PAYMENT CREATE] Transaction created:', transaction.token);
        
        res.json({
            token: transaction.token,
            redirect_url: transaction.redirect_url,
            order_id: orderId
        });

    } catch (error) {
        console.error('❌ [PAYMENT CREATE] Error:', error);
        res.status(500).json({
            error: 'Failed to create payment',
            details: error.message
        });
    }
});



// Payment notification webhook (dari Midtrans)
app.post('/api/payment/notification', async (req, res) => {
    try {
        const notification = req.body;
        console.log('Payment notification received:', JSON.stringify(notification, null, 2));

        const { order_id, transaction_status, fraud_status } = notification;

        const ordersRef = db.collection('orders');
        const snapshot = await ordersRef.where('orderId', '==', order_id).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const orderDoc = snapshot.docs[0];
        const orderData = orderDoc.data();

        let newStatus = 'pending';
        let newPaymentStatus = 'pending';

        // CEK JIKA INI BANNER PURCHASE
        if (orderData.type === 'banner_purchase') {
            if (transaction_status === 'capture' || transaction_status === 'settlement') {
                if (fraud_status === 'accept') {
                    const bannerData = orderData.bannerData || {};
                    const expiresAt = new Date(bannerData.expiresAt) || new Date();
                    expiresAt.setHours(expiresAt.getHours() + 24);

                    const docRef = await db.collection('banners').add({
                        title: bannerData.title || 'Banner Promosi',
                        description: bannerData.description || '',
                        imageUrl: bannerData.imageUrl || '',
                        linkUrl: `/product/${orderData.productId}`,
                        isActive: true,
                        type: 'seller',
                        sellerId: orderData.sellerId,
                        productId: orderData.productId,
                        duration: bannerData.duration || 24,
                        price: orderData.amount || 0,
                        paymentMethod: 'midtrans',
                        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    newStatus = 'paid';
                    newPaymentStatus = 'settlement';

                    await orderDoc.ref.update({
                        status: newStatus,
                        paymentStatus: newPaymentStatus,
                        bannerId: docRef.id,
                        midtransResponse: notification,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    await db.collection('notifications').add({
                        type: 'banner_purchase_midtrans',
                        title: 'Pembelian Banner (Midtrans)',
                        message: `${orderData.sellerName || 'Seller'} membeli banner untuk produk ${orderData.productName || 'Produk'}`,
                        userId: 'admin',
                        sellerId: orderData.sellerId,
                        bannerId: docRef.id,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    return res.status(200).json({ message: 'Banner created from Midtrans payment' });
                }
            } else if (transaction_status === 'pending') {
                newStatus = 'pending';
                newPaymentStatus = 'pending';
            } else if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
                newStatus = 'failed';
                newPaymentStatus = transaction_status;
            }

            await orderDoc.ref.update({
                status: newStatus,
                paymentStatus: newPaymentStatus,
                midtransResponse: notification,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(200).json({ message: 'Banner order updated' });
        }

        // REGULAR PRODUCT ORDER
        if (transaction_status === 'capture' || transaction_status === 'settlement') {
            if (fraud_status === 'accept') {
                newStatus = 'paid';
                newPaymentStatus = 'settlement';
                
                await db.collection('products').doc(orderData.productId).update({
                    sales: admin.firestore.FieldValue.increment(1)
                });

                if (orderData.sellerId) {
                    const sellerRef = db.collection('users').doc(orderData.sellerId);
                    await sellerRef.update({
                        'wallet.holding': admin.firestore.FieldValue.increment(orderData.amount || 0)
                    });

                    await db.collection('notifications').add({
                        type: 'order_paid',
                        title: 'Produk Terjual! 🎉',
                        message: `${orderData.productName} telah dibayar oleh ${orderData.buyerName}`,
                        userId: orderData.sellerId,
                        orderId: orderDoc.id,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        } else if (transaction_status === 'pending') {
            newStatus = 'pending';
            newPaymentStatus = 'pending';
        } else if (transaction_status === 'deny' || transaction_status === 'cancel' || transaction_status === 'expire') {
            newStatus = 'failed';
            newPaymentStatus = transaction_status;
        }

        await orderDoc.ref.update({
            status: newStatus,
            paymentStatus: newPaymentStatus,
            midtransResponse: notification,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(200).json({
            message: 'Notification processed successfully'
        });

    } catch (error) {
        console.error('Payment notification error:', error);
        res.status(500).json({
            error: 'Failed to process notification',
            details: error.message
        });
    }
});

// ============================================
// CONFIRM BANNER PAYMENT (DARI SNAP CALLBACK)
// ============================================

app.post('/api/banners/confirm-payment', async (req, res) => {
    try {
        const { orderId, transactionStatus, result } = req.body;

        console.log('📦 [CONFIRM PAYMENT] Request:', { orderId, transactionStatus });

        if (!orderId) {
            return res.status(400).json({ error: 'Order ID is required' });
        }

        // Cari order di database
        const snapshot = await db.collection('orders')
            .where('orderId', '==', orderId)
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.error('❌ [CONFIRM PAYMENT] Order not found:', orderId);
            return res.status(404).json({ error: 'Order not found' });
        }

        const orderDoc = snapshot.docs[0];
        const orderData = orderDoc.data();

        console.log('📦 [CONFIRM PAYMENT] Order found:', {
            id: orderDoc.id,
            type: orderData.type,
            paymentStatus: orderData.paymentStatus
        });

        // Jika sudah settlement, skip
        if (orderData.paymentStatus === 'settlement') {
            console.log('✅ [CONFIRM PAYMENT] Order already settled');
            return res.json({ 
                message: 'Order already settled', 
                bannerId: orderData.bannerId 
            });
        }

        // Cek jika ini banner purchase
        if (orderData.type === 'banner_purchase') {
            console.log('📦 [CONFIRM PAYMENT] Creating banner...');
            
            // Buat banner
            const bannerData = orderData.bannerData || {};
            const expiresAt = new Date(bannerData.expiresAt) || new Date();
            expiresAt.setHours(expiresAt.getHours() + 24);

            const docRef = await db.collection('banners').add({
                title: bannerData.title || 'Banner Promosi',
                description: bannerData.description || '',
                imageUrl: bannerData.imageUrl || '',
                linkUrl: `/product/${orderData.productId}`,
                isActive: true,
                type: 'seller',
                sellerId: orderData.sellerId,
                productId: orderData.productId,
                duration: bannerData.duration || 24,
                price: orderData.amount || 0,
                paymentMethod: 'midtrans',
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ [CONFIRM PAYMENT] Banner created:', docRef.id);

            // Update order
            await orderDoc.ref.update({
                status: 'paid',
                paymentStatus: 'settlement',
                bannerId: docRef.id,
                midtransResponse: result || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ [CONFIRM PAYMENT] Order updated');

            // Notification untuk admin
            await db.collection('notifications').add({
                type: 'banner_purchase_midtrans',
                title: 'Pembelian Banner (Midtrans) - Confirmed',
                message: `${orderData.sellerName || 'Seller'} membeli banner untuk produk ${orderData.productName || 'Produk'}`,
                userId: 'admin',
                sellerId: orderData.sellerId,
                bannerId: docRef.id,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ [CONFIRM PAYMENT] Admin notification created');

            return res.json({ 
                success: true, 
                message: 'Banner activated successfully',
                bannerId: docRef.id 
            });
        }

        // Untuk order biasa (bukan banner)
        await orderDoc.ref.update({
            status: 'paid',
            paymentStatus: 'settlement',
            midtransResponse: result || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ message: 'Order updated successfully' });

    } catch (error) {
        console.error('❌ [CONFIRM PAYMENT] Error:', error);
        res.status(500).json({ 
            error: 'Failed to confirm payment', 
            details: error.message 
        });
    }
});

// ============================================
// PAYMENT CALLBACK - REDIRECT KE FRONTEND
// ============================================

app.get('/payment/finish', (req, res) => {
    const { order_id, status_code, transaction_status } = req.query;
    console.log(`✅ [PAYMENT FINISH] Order: ${order_id}, Status: ${transaction_status || status_code}`);
    
    const redirectUrl = `/seller/products?payment=success&order=${order_id}`;
    res.redirect(redirectUrl);
});

app.get('/payment/error', (req, res) => {
    const { order_id, status_code, transaction_status } = req.query;
    console.log(`❌ [PAYMENT ERROR] Order: ${order_id}, Status: ${transaction_status || status_code}`);
    
    const redirectUrl = `/seller/products?payment=error&order=${order_id}`;
    res.redirect(redirectUrl);
});

app.get('/payment/pending', (req, res) => {
    const { order_id, status_code, transaction_status } = req.query;
    console.log(`⏳ [PAYMENT PENDING] Order: ${order_id}, Status: ${transaction_status || status_code}`);
    
    const redirectUrl = `/seller/products?payment=pending&order=${order_id}`;
    res.redirect(redirectUrl);
});

// ============================================
// WALLET & WITHDRAW ENDPOINTS
// ============================================

app.get('/api/seller/:sellerId/wallet', async (req, res) => {
    try {
        const { sellerId } = req.params;
        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();

        if (!sellerDoc.exists) {
            return res.status(404).json({
                error: 'Seller not found'
            });
        }

        const data = sellerDoc.data();
        const wallet = data.wallet || {
            available: 0,
            holding: 0,
            totalRevenue: 0,
            totalWithdraw: 0
        };

        res.json({
            sellerId,
            ...wallet
        });

    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).json({
            error: 'Failed to fetch wallet',
            details: error.message
        });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { sellerId, amount, method, accountNumber, accountName, note } = req.body;

        if (!sellerId || !amount || !method || !accountNumber || !accountName) {
            return res.status(400).json({
                error: 'Seller ID, amount, method, account number, and account name are required'
            });
        }

        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();
        
        if (!sellerDoc.exists) {
            return res.status(404).json({
                error: 'Seller not found'
            });
        }

        const data = sellerDoc.data();
        const wallet = data.wallet || { available: 0, holding: 0 };
        
        if (wallet.available < amount) {
            return res.status(400).json({
                error: 'Insufficient balance'
            });
        }

        const settingsRef = db.collection('settings').doc('marketplace');
        const settingsDoc = await settingsRef.get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const minWithdraw = settings.minWithdraw || 50000;
        const maxWithdraw = settings.maxWithdraw || 10000000;

        if (amount < minWithdraw) {
            return res.status(400).json({
                error: `Minimum withdrawal is Rp ${formatPrice(minWithdraw)}`
            });
        }

        if (amount > maxWithdraw) {
            return res.status(400).json({
                error: `Maximum withdrawal is Rp ${formatPrice(maxWithdraw)}`
            });
        }

        const withdrawalData = {
            sellerId,
            amount: parseInt(amount),
            method,
            accountNumber,
            accountName,
            note: note || '',
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('withdrawals').add(withdrawalData);

        await sellerRef.update({
            'wallet.available': admin.firestore.FieldValue.increment(-amount),
            'wallet.holding': admin.firestore.FieldValue.increment(amount)
        });

        await db.collection('notifications').add({
            type: 'withdraw_request',
            title: 'Permintaan Withdraw Baru',
            message: `${data.storeName || 'Seller'} meminta withdraw Rp ${formatPrice(amount)}`,
            userId: 'admin',
            sellerId,
            withdrawalId: docRef.id,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.status(201).json({
            id: docRef.id,
            ...withdrawalData
        });

    } catch (error) {
        console.error('Error creating withdrawal:', error);
        res.status(500).json({
            error: 'Failed to create withdrawal',
            details: error.message
        });
    }
});

app.get('/api/seller/:sellerId/withdrawals', async (req, res) => {
    try {
        const { sellerId } = req.params;
        const { status, page = 1, limit = 20 } = req.query;

        let query = db.collection('withdrawals')
            .where('sellerId', '==', sellerId);

        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset((parseInt(page) - 1) * parseInt(limit));

        const snapshot = await query.get();
        
        const withdrawals = [];
        snapshot.forEach(doc => {
            withdrawals.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
            });
        });

        res.json({
            withdrawals,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        res.status(500).json({
            error: 'Failed to fetch withdrawals',
            details: error.message
        });
    }
});

// ============================================
// BANNER ENDPOINTS
// ============================================

// Get active banners for homepage
app.get('/api/banners', async (req, res) => {
    try {
        const now = new Date();
        const snapshot = await db.collection('banners')
            .where('isActive', '==', true)
            .orderBy('createdAt', 'desc')
            .get();

        const banners = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const expiresAt = data.expiresAt?.toDate?.() || data.expiresAt;
            if (!expiresAt || new Date(expiresAt) > now) {
                banners.push({
                    id: doc.id,
                    ...data,
                    expiresAt: expiresAt,
                    createdAt: data.createdAt?.toDate?.() || data.createdAt
                });
            }
        });

        res.json(banners);

    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({
            error: 'Failed to fetch banners',
            details: error.message
        });
    }
});

// Get banner pricing
app.get('/api/banner-pricing', async (req, res) => {
    try {
        const settingsRef = db.collection('settings').doc('banner');
        const settingsDoc = await settingsRef.get();
        
        const data = settingsDoc.exists ? settingsDoc.data() : {};
        res.json({
            price: data.price || 100000,
            duration: data.duration || 24,
            maxSlots: data.maxSlots || 5,
            autoSlideSpeed: data.autoSlideSpeed || 5
        });
    } catch (error) {
        console.error('Error fetching banner pricing:', error);
        res.status(500).json({ 
            error: 'Failed to fetch banner pricing', 
            details: error.message 
        });
    }
});

// ============================================
// SELLER PURCHASE BANNER
// ============================================

app.post('/api/banners/purchase', async (req, res) => {
    try {
        console.log('📦 [BANNER PURCHASE] Request received:', JSON.stringify(req.body, null, 2));

        const { sellerId, productId, title, imageUrl, duration, paymentMethod } = req.body;

        if (!sellerId) {
            return res.status(400).json({ error: 'Seller ID is required' });
        }
        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' });
        }
        if (!duration) {
            return res.status(400).json({ error: 'Duration is required' });
        }

        // GET PRICING
        const settingsRef = db.collection('settings').doc('banner');
        const settingsDoc = await settingsRef.get();
        let flatPrice = 100000;
        if (settingsDoc.exists) {
            flatPrice = settingsDoc.data().price || 100000;
        }

        // GET SELLER DATA
        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();
        if (!sellerDoc.exists) {
            return res.status(404).json({ error: 'Seller not found' });
        }
        const sellerData = sellerDoc.data();

        // GET PRODUCT DATA
        const productRef = db.collection('products').doc(productId);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const product = productDoc.data();

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + parseInt(duration));

        // METODE 1: WALLET
        if (paymentMethod === 'wallet' || !paymentMethod) {
            const wallet = sellerData.wallet || { available: 0 };
            
            if (wallet.available < flatPrice) {
                return res.status(400).json({ 
                    error: 'Saldo tidak mencukupi',
                    available: wallet.available,
                    price: flatPrice
                });
            }

            const bannerData = {
                title: title || product.name,
                description: `Promosi produk ${product.name} oleh ${sellerData.storeName || 'Seller'}`,
                imageUrl: imageUrl || '',
                linkUrl: `/product/${productId}`,
                isActive: true,
                type: 'seller',
                sellerId: sellerId,
                productId: productId,
                duration: parseInt(duration),
                price: flatPrice,
                paymentMethod: 'wallet',
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('banners').add(bannerData);

            await sellerRef.update({
                'wallet.available': admin.firestore.FieldValue.increment(-flatPrice)
            });

            await db.collection('notifications').add({
                type: 'banner_purchase_wallet',
                title: 'Pembelian Banner (Wallet)',
                message: `${sellerData.storeName || 'Seller'} membeli banner untuk produk ${product.name}`,
                userId: 'admin',
                sellerId: sellerId,
                bannerId: docRef.id,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return res.status(201).json({
                id: docRef.id,
                ...bannerData,
                paymentMethod: 'wallet'
            });
        }

        // METODE 2: MIDTRANS
        if (paymentMethod === 'midtrans') {
            const orderId = `BANNER-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

            const orderData = {
                orderId: orderId,
                type: 'banner_purchase',
                sellerId: sellerId,
                productId: productId,
                productName: product.name,
                sellerName: sellerData.storeName || sellerData.displayName || 'Seller',
                amount: flatPrice,
                status: 'pending',
                paymentStatus: 'pending',
                bannerData: {
                    title: title || product.name,
                    description: `Promosi produk ${product.name} oleh ${sellerData.storeName || 'Seller'}`,
                    imageUrl: imageUrl || '',
                    duration: parseInt(duration),
                    expiresAt: expiresAt.toISOString()
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const orderRef = await db.collection('orders').add(orderData);

            const baseUrl = process.env.APP_URL || 'https://productkuu.vercel.app';

            const parameter = {
                transaction_details: {
                    order_id: orderId,
                    gross_amount: flatPrice
                },
                customer_details: {
                    first_name: sellerData.displayName || sellerData.storeName || 'Seller',
                    email: sellerData.email || 'seller@example.com',
                    phone: sellerData.whatsapp || '08123456789'
                },
                item_details: [
                    {
                        id: 'BANNER_PROMO',
                        price: flatPrice,
                        quantity: 1,
                        name: `Banner Promosi - ${product.name}`
                    }
                ],
                callbacks: {
    finish: `${baseUrl}/success.html?order=${orderId}&status=success`,
    error: `${baseUrl}/success.html?order=${orderId}&status=error`,
    pending: `${baseUrl}/success.html?order=${orderId}&status=pending`
}
            };

            const transaction = await snap.createTransaction(parameter);

            await orderRef.update({
                midtransToken: transaction.token,
                midtransRedirect: transaction.redirect_url
            });

            return res.status(200).json({
                orderId: orderId,
                token: transaction.token,
                redirect_url: transaction.redirect_url,
                paymentMethod: 'midtrans'
            });
        }

        return res.status(400).json({ error: 'Metode pembayaran tidak valid' });

    } catch (error) {
        console.error('❌ [BANNER PURCHASE] Error:', error);
        res.status(500).json({ 
            error: 'Failed to purchase banner', 
            details: error.message 
        });
    }
});


// ============================================
// ADMIN STATS - PERBAIKAN
// ============================================

app.get('/api/admin/stats', async (req, res) => {
    try {
        // Total Sellers
        const sellersSnapshot = await db.collection('users')
            .where('role', '==', 'seller')
            .count()
            .get();
        const totalSellers = sellersSnapshot.data().count;

        // Total Products
        const productsSnapshot = await db.collection('products')
            .where('status', '==', 'published')
            .count()
            .get();
        const totalProducts = productsSnapshot.data().count;

        // Total Orders (semua settlement)
        const ordersSnapshot = await db.collection('orders')
            .where('paymentStatus', '==', 'settlement')
            .get();
        const totalOrders = ordersSnapshot.size;

        // Total Revenue (semua settlement)
        let totalRevenue = 0;
        ordersSnapshot.forEach(doc => {
            totalRevenue += doc.data().amount || 0;
        });

        // Total Komisi (10% dari total revenue)
        const totalCommission = Math.round(totalRevenue * 0.1);

        // Pending Withdrawals
        const pendingWithdrawals = await db.collection('withdrawals')
            .where('status', '==', 'pending')
            .count()
            .get();

        // Active Banners
        const activeBanners = await db.collection('banners')
            .where('isActive', '==', true)
            .count()
            .get();

        res.json({
            totalSellers: totalSellers,
            totalProducts: totalProducts,
            totalOrders: totalOrders,
            totalRevenue: totalRevenue,
            totalCommission: totalCommission,
            pendingWithdrawals: pendingWithdrawals.data().count,
            activeBanners: activeBanners.data().count
        });

    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({
            error: 'Failed to fetch stats',
            details: error.message
        });
    }
});

// ============================================
// ADMIN BANNER ENDPOINTS
// ============================================

app.get('/api/admin/banners-full', async (req, res) => {
    try {
        const snapshot = await db.collection('banners')
            .orderBy('createdAt', 'desc')
            .get();

        const banners = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            let product = null;
            
            if (data.productId) {
                const productRef = db.collection('products').doc(data.productId);
                const productDoc = await productRef.get();
                if (productDoc.exists) {
                    product = {
                        id: productDoc.id,
                        ...productDoc.data(),
                        createdAt: productDoc.data().createdAt?.toDate?.() || productDoc.data().createdAt
                    };
                }
            }

            banners.push({
                id: doc.id,
                ...data,
                product,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                expiresAt: data.expiresAt?.toDate?.() || data.expiresAt
            });
        }

        res.json(banners);

    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ error: 'Failed to fetch banners', details: error.message });
    }
});

app.get('/api/admin/products-with-banner', async (req, res) => {
    try {
        const productsSnapshot = await db.collection('products')
            .where('status', '==', 'published')
            .orderBy('createdAt', 'desc')
            .get();

        const bannersSnapshot = await db.collection('banners')
            .where('isActive', '==', true)
            .get();

        const bannerProductIds = new Set();
        bannersSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.productId) {
                bannerProductIds.add(data.productId);
            }
        });

        const products = [];
        productsSnapshot.forEach(doc => {
            const data = doc.data();
            products.push({
                id: doc.id,
                ...data,
                hasBanner: bannerProductIds.has(doc.id),
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            });
        });

        res.json(products);

    } catch (error) {
        console.error('Error fetching products with banner:', error);
        res.status(500).json({ error: 'Failed to fetch products', details: error.message });
    }
});

app.post('/api/admin/banners/add-product', async (req, res) => {
    try {
        const { productCode, duration } = req.body;

        if (!productCode) {
            return res.status(400).json({ error: 'Kode produk wajib diisi' });
        }

        const productSnapshot = await db.collection('products')
            .where('productCode', '==', productCode.toUpperCase())
            .where('status', '==', 'published')
            .limit(1)
            .get();

        if (productSnapshot.empty) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }

        const productDoc = productSnapshot.docs[0];
        const product = productDoc.data();

        const sellerRef = db.collection('users').doc(product.sellerId);
        const sellerDoc = await sellerRef.get();
        const seller = sellerDoc.exists ? sellerDoc.data() : null;

        const existingBanner = await db.collection('banners')
            .where('productId', '==', productDoc.id)
            .where('isActive', '==', true)
            .get();

        if (!existingBanner.empty) {
            return res.status(400).json({ 
                error: 'Produk sudah memiliki banner aktif',
                bannerId: existingBanner.docs[0].id
            });
        }

        const durationHours = parseInt(duration) || 24;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + durationHours);

        const bannerData = {
            title: product.name,
            description: `${product.name} - oleh ${seller?.storeName || 'Seller'}`,
            imageUrl: product.imageUrl || '',
            linkUrl: `/product/${productDoc.id}`,
            isActive: true,
            type: 'admin',
            sellerId: product.sellerId,
            productId: productDoc.id,
            duration: durationHours,
            price: 0,
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('banners').add(bannerData);

        res.status(201).json({
            id: docRef.id,
            ...bannerData,
            product: {
                id: productDoc.id,
                ...product
            }
        });

    } catch (error) {
        console.error('Error adding product to banner:', error);
        res.status(500).json({ error: 'Failed to add product to banner', details: error.message });
    }
});

app.delete('/api/admin/banners/:id/remove', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('banners').doc(id).delete();
        res.json({ message: 'Banner berhasil dihapus' });
    } catch (error) {
        console.error('Error removing banner:', error);
        res.status(500).json({ error: 'Failed to remove banner', details: error.message });
    }
});

app.patch('/api/admin/banners/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const bannerRef = db.collection('banners').doc(id);
        const bannerDoc = await bannerRef.get();

        if (!bannerDoc.exists) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        const current = bannerDoc.data().isActive;
        await bannerRef.update({
            isActive: !current,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ message: `Banner ${!current ? 'diaktifkan' : 'dinonaktifkan'}` });
    } catch (error) {
        console.error('Error toggling banner:', error);
        res.status(500).json({ error: 'Failed to toggle banner', details: error.message });
    }
});

// ============================================
// CATEGORY ENDPOINTS
// ============================================

app.get('/api/categories', async (req, res) => {
    try {
        const snapshot = await db.collection('categories')
            .orderBy('name')
            .get();

        const categories = [];
        snapshot.forEach(doc => {
            categories.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json(categories);

    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({
            error: 'Failed to fetch categories',
            details: error.message
        });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { name, icon, description } = req.body;

        if (!name) {
            return res.status(400).json({
                error: 'Category name is required'
            });
        }

        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const categoryData = {
            name,
            slug,
            icon: icon || 'fa-tag',
            description: description || '',
            productCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('categories').add(categoryData);

        res.status(201).json({
            id: docRef.id,
            ...categoryData
        });

    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({
            error: 'Failed to create category',
            details: error.message
        });
    }
});

// ============================================
// REVIEW ENDPOINTS
// ============================================

app.post('/api/reviews', async (req, res) => {
    try {
        const { productId, orderId, buyerName, rating, comment } = req.body;

        if (!productId || !buyerName || !rating) {
            return res.status(400).json({
                error: 'Product ID, buyer name, and rating are required'
            });
        }

        if (orderId) {
            const orderRef = db.collection('orders').doc(orderId);
            const orderDoc = await orderRef.get();
            
            if (!orderDoc.exists || orderDoc.data().paymentStatus !== 'settlement') {
                return res.status(400).json({
                    error: 'Only paid orders can leave reviews'
                });
            }
        }

        const reviewData = {
            productId,
            orderId: orderId || '',
            buyerName,
            rating: parseInt(rating),
            comment: comment || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('reviews').add(reviewData);

        res.status(201).json({
            id: docRef.id,
            ...reviewData
        });

    } catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json({
            error: 'Failed to create review',
            details: error.message
        });
    }
});

app.get('/api/products/:productId/reviews', async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        let query = db.collection('reviews')
            .where('productId', '==', productId)
            .orderBy('createdAt', 'desc');

        query = query.limit(parseInt(limit))
            .offset((parseInt(page) - 1) * parseInt(limit));

        const snapshot = await query.get();
        
        const reviews = [];
        let totalRating = 0;
        let reviewCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            totalRating += data.rating || 0;
            reviewCount++;
            reviews.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            });
        });

        const countSnapshot = await db.collection('reviews')
            .where('productId', '==', productId)
            .count()
            .get();
        const total = countSnapshot.data().count;

        const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const allReviews = await db.collection('reviews')
            .where('productId', '==', productId)
            .get();
        allReviews.forEach(doc => {
            const rating = doc.data().rating || 0;
            if (rating >= 1 && rating <= 5) {
                ratings[rating]++;
            }
        });

        res.json({
            reviews,
            statistics: {
                averageRating: reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : 0,
                totalReviews: total,
                ratingCounts: ratings
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching reviews:', error);
        res.status(500).json({
            error: 'Failed to fetch reviews',
            details: error.message
        });
    }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

app.get('/api/admin/stats', async (req, res) => {
    try {
        const sellersSnapshot = await db.collection('users')
            .where('role', '==', 'seller')
            .count()
            .get();
        const totalSellers = sellersSnapshot.data().count;

        const productsSnapshot = await db.collection('products')
            .where('status', '==', 'published')
            .count()
            .get();
        const totalProducts = productsSnapshot.data().count;

        const ordersSnapshot = await db.collection('orders')
            .where('paymentStatus', '==', 'settlement')
            .count()
            .get();
        const totalOrders = ordersSnapshot.data().count;

        const revenueSnapshot = await db.collection('orders')
            .where('paymentStatus', '==', 'settlement')
            .get();
        let totalRevenue = 0;
        revenueSnapshot.forEach(doc => {
            totalRevenue += doc.data().amount || 0;
        });

        const pendingWithdrawals = await db.collection('withdrawals')
            .where('status', '==', 'pending')
            .count()
            .get();

        const activeBanners = await db.collection('banners')
            .where('isActive', '==', true)
            .count()
            .get();

        res.json({
            totalSellers: totalSellers,
            totalProducts: totalProducts,
            totalOrders: totalOrders,
            totalRevenue: totalRevenue,
            pendingWithdrawals: pendingWithdrawals.data().count,
            activeBanners: activeBanners.data().count
        });

    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({
            error: 'Failed to fetch stats',
            details: error.message
        });
    }
});

app.get('/api/admin/sellers', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        let query = db.collection('users')
            .where('role', '==', 'seller');

        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset((parseInt(page) - 1) * parseInt(limit));

        const snapshot = await query.get();
        
        const sellers = [];
        snapshot.forEach(doc => {
            sellers.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
            });
        });

        res.json({
            sellers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching sellers:', error);
        res.status(500).json({
            error: 'Failed to fetch sellers',
            details: error.message
        });
    }
});

app.put('/api/admin/sellers/:sellerId', async (req, res) => {
    try {
        const { sellerId } = req.params;
        const updates = req.body;

        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();

        if (!sellerDoc.exists) {
            return res.status(404).json({
                error: 'Seller not found'
            });
        }

        delete updates.role;

        await sellerRef.update({
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            id: sellerId,
            ...updates
        });

    } catch (error) {
        console.error('Error updating seller:', error);
        res.status(500).json({
            error: 'Failed to update seller',
            details: error.message
        });
    }
});

app.patch('/api/admin/withdrawals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNote } = req.body;

        const withdrawalRef = db.collection('withdrawals').doc(id);
        const withdrawalDoc = await withdrawalRef.get();

        if (!withdrawalDoc.exists) {
            return res.status(404).json({
                error: 'Withdrawal not found'
            });
        }

        const data = withdrawalDoc.data();
        const updates = {
            status,
            adminNote: adminNote || '',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (status === 'approved') {
            const sellerRef = db.collection('users').doc(data.sellerId);
            await sellerRef.update({
                'wallet.holding': admin.firestore.FieldValue.increment(-data.amount)
            });
        } else if (status === 'rejected') {
            const sellerRef = db.collection('users').doc(data.sellerId);
            await sellerRef.update({
                'wallet.available': admin.firestore.FieldValue.increment(data.amount),
                'wallet.holding': admin.firestore.FieldValue.increment(-data.amount)
            });
        }

        await withdrawalRef.update(updates);

        await db.collection('notifications').add({
            type: `withdraw_${status}`,
            title: `Withdraw ${status === 'approved' ? 'Disetujui' : 'Ditolak'}`,
            message: `Permintaan withdraw Rp ${formatPrice(data.amount)} telah ${status === 'approved' ? 'disetujui' : 'ditolak'}`,
            userId: data.sellerId,
            withdrawalId: id,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            id,
            ...updates
        });

    } catch (error) {
        console.error('Error updating withdrawal:', error);
        res.status(500).json({
            error: 'Failed to update withdrawal',
            details: error.message
        });
    }
});

// ============================================
// SELLER PAGE ENDPOINT
// ============================================

app.get('/api/seller/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        const snapshot = await db.collection('users')
            .where('role', '==', 'seller')
            .get();

        let seller = null;
        snapshot.forEach(doc => {
            const data = doc.data();
            const storeSlug = data.storeName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '';
            const displaySlug = data.displayName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '';
            if (storeSlug === username || displaySlug === username || doc.id === username) {
                seller = { id: doc.id, ...data };
            }
        });

        if (!seller) {
            return res.status(404).json({ error: 'Seller not found' });
        }

        const productsSnapshot = await db.collection('products')
            .where('sellerId', '==', seller.id)
            .where('status', '==', 'published')
            .orderBy('createdAt', 'desc')
            .get();

        const products = [];
        productsSnapshot.forEach(doc => {
            const data = doc.data();
            products.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            });
        });

        res.json({
            seller,
            products,
            totalProducts: products.length
        });

    } catch (error) {
        console.error('Error fetching seller:', error);
        res.status(500).json({ error: 'Failed to fetch seller', details: error.message });
    }
});

// ============================================
// HANDLE ROOT ROUTE
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});


// Export for Vercel
module.exports = app;
