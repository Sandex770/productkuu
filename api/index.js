const express = require('express');
const midtransClient = require('midtrans-client');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');

dotenv.config();

// Initialize Firebase Admin
const serviceAccount = require('../firebase/serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const app = express();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Midtrans configuration
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

        // Generate unique product code (6 characters)
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

        if (!orderId || !amount || amount < 10000) {
            return res.status(400).json({
                error: 'Invalid amount or order ID (minimum Rp 10,000)'
            });
        }

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
                    id: 'PROD001',
                    price: parseInt(amount),
                    quantity: 1,
                    name: productName || 'Digital Product'
                }
            ],
            credit_card: {
                secure: true
            },
            callbacks: {
                finish: `${process.env.APP_URL || 'http://localhost:5000'}/payment/finish`,
                error: `${process.env.APP_URL || 'http://localhost:5000'}/payment/error`,
                pending: `${process.env.APP_URL || 'http://localhost:5000'}/payment/pending`
            }
        };

        const transaction = await snap.createTransaction(parameter);
        
        res.json({
            token: transaction.token,
            redirect_url: transaction.redirect_url,
            order_id: orderId
        });

    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({
            error: 'Failed to create payment',
            details: error.message
        });
    }
});

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

        // ============================================
        // CEK JIKA INI BANNER PURCHASE
        // ============================================
        if (orderData.type === 'banner_purchase') {
            if (transaction_status === 'capture' || transaction_status === 'settlement') {
                if (fraud_status === 'accept') {
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

                    newStatus = 'paid';
                    newPaymentStatus = 'settlement';

                    // Update order dengan bannerId
                    await orderDoc.ref.update({
                        status: newStatus,
                        paymentStatus: newPaymentStatus,
                        bannerId: docRef.id,
                        midtransResponse: notification,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // Notification untuk admin
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

        // ============================================
        // REGULAR PRODUCT ORDER
        // ============================================
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

// Get all banners with product info (Admin)
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

// Get all products with banner status (Admin)
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

// Admin - Add product to banner by product code
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
            return res.status(404).json({ error: 'Produk tidak ditemukan dengan kode tersebut' });
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

// Admin - Remove product from banner
app.delete('/api/admin/banners/:id/remove', async (req, res) => {
    try {
        const { id } = req.params;
        const bannerRef = db.collection('banners').doc(id);
        const bannerDoc = await bannerRef.get();

        if (!bannerDoc.exists) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        await bannerRef.delete();

        res.json({ message: 'Banner berhasil dihapus' });

    } catch (error) {
        console.error('Error removing banner:', error);
        res.status(500).json({ error: 'Failed to remove banner', details: error.message });
    }
});

// Admin - Toggle banner status
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
// BANNER PRICING ENDPOINTS
// ============================================

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

// Update banner pricing (Admin)
app.put('/api/banner-pricing', async (req, res) => {
    try {
        const { price, duration, maxSlots, autoSlideSpeed } = req.body;
        
        const settingsRef = db.collection('settings').doc('banner');
        await settingsRef.set({
            price: price || 100000,
            duration: duration || 24,
            maxSlots: maxSlots || 5,
            autoSlideSpeed: autoSlideSpeed || 5,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ message: 'Pengaturan harga banner berhasil disimpan' });
    } catch (error) {
        console.error('Error updating banner pricing:', error);
        res.status(500).json({ 
            error: 'Failed to update banner pricing', 
            details: error.message 
        });
    }
});

// ============================================
// SELLER PURCHASE BANNER (DENGAN 2 METODE)
// ============================================

app.post('/api/banners/purchase', async (req, res) => {
    try {
        const { sellerId, productId, title, imageUrl, duration, paymentMethod } = req.body;

        if (!sellerId || !productId || !duration) {
            return res.status(400).json({ error: 'Seller ID, product ID, and duration are required' });
        }

        // Get pricing from settings/banner
        const settingsRef = db.collection('settings').doc('banner');
        const settingsDoc = await settingsRef.get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const flatPrice = settings.price || 100000;

        // Get seller data
        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();
        if (!sellerDoc.exists) {
            return res.status(404).json({ error: 'Seller not found' });
        }

        // Get product data
        const productRef = db.collection('products').doc(productId);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            return res.status(404).json({ error: 'Product not found' });
        }
        const product = productDoc.data();

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + parseInt(duration));

        // ============================================
        // METODE 1: BAYAR PAKAI SALDO WALLET
        // ============================================
        if (paymentMethod === 'wallet' || !paymentMethod) {
            const wallet = sellerDoc.data().wallet || { available: 0 };
            
            if (wallet.available < flatPrice) {
                return res.status(400).json({ 
                    error: 'Saldo tidak mencukupi',
                    available: wallet.available,
                    price: flatPrice,
                    suggestion: 'Gunakan metode pembayaran lain atau isi saldo terlebih dahulu'
                });
            }

            // Create banner
            const bannerData = {
                title: title || product.name,
                description: `Promosi produk ${product.name} oleh ${sellerDoc.data().storeName || 'Seller'}`,
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

            // Deduct from wallet
            await sellerRef.update({
                'wallet.available': admin.firestore.FieldValue.increment(-flatPrice)
            });

            // Notification for admin
            await db.collection('notifications').add({
                type: 'banner_purchase_wallet',
                title: 'Pembelian Banner (Wallet)',
                message: `${sellerDoc.data().storeName || 'Seller'} membeli banner untuk produk ${product.name} dengan saldo wallet`,
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

        // ============================================
        // METODE 2: BAYAR PAKAI MIDTRANS
        // ============================================
        if (paymentMethod === 'midtrans') {
            // Generate order ID untuk Midtrans
            const orderId = `BANNER-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

            // Buat order di database
            const orderData = {
                orderId: orderId,
                type: 'banner_purchase',
                sellerId: sellerId,
                productId: productId,
                productName: product.name,
                sellerName: sellerDoc.data().storeName || sellerDoc.data().displayName || 'Seller',
                amount: flatPrice,
                status: 'pending',
                paymentStatus: 'pending',
                bannerData: {
                    title: title || product.name,
                    description: `Promosi produk ${product.name} oleh ${sellerDoc.data().storeName || 'Seller'}`,
                    imageUrl: imageUrl || '',
                    duration: parseInt(duration),
                    expiresAt: expiresAt.toISOString()
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const orderRef = await db.collection('orders').add(orderData);

            // Buat parameter Midtrans
            const parameter = {
                transaction_details: {
                    order_id: orderId,
                    gross_amount: flatPrice
                },
                customer_details: {
                    first_name: sellerDoc.data().displayName || sellerDoc.data().storeName || 'Seller',
                    email: sellerDoc.data().email || 'seller@example.com',
                    phone: sellerDoc.data().whatsapp || '08123456789'
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
                    finish: `${process.env.APP_URL || 'http://localhost:5000'}/payment/finish`,
                    error: `${process.env.APP_URL || 'http://localhost:5000'}/payment/error`,
                    pending: `${process.env.APP_URL || 'http://localhost:5000'}/payment/pending`
                }
            };

            const transaction = await snap.createTransaction(parameter);

            // Simpan transaksi ke order
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
        console.error('Error purchasing banner:', error);
        res.status(500).json({ error: 'Failed to purchase banner', details: error.message });
    }
});

// Get seller's banner purchases
app.get('/api/seller/:sellerId/banners', async (req, res) => {
    try {
        const { sellerId } = req.params;
        const snapshot = await db.collection('banners')
            .where('sellerId', '==', sellerId)
            .where('type', '==', 'seller')
            .orderBy('createdAt', 'desc')
            .get();

        const banners = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            banners.push({
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt,
                expiresAt: data.expiresAt?.toDate?.() || data.expiresAt
            });
        });

        res.json(banners);

    } catch (error) {
        console.error('Error fetching seller banners:', error);
        res.status(500).json({ error: 'Failed to fetch banners', details: error.message });
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
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

module.exports = app;