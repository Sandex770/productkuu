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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
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

const formatPrice = (price) => {
    return new Intl.NumberFormat('id-ID').format(price);
};

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// PRODUCT ENDPOINTS
// ============================================

// Get all products with filters
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

        // Basic filters
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

        // Apply constraints
        constraints.forEach(constraint => {
            query = query.where(constraint.fieldPath, constraint.opStr, constraint.value);
        });

        // Search by name
        if (search) {
            // Firestore doesn't support full-text search, using startsWith
            query = query.where('name', '>=', search)
                         .where('name', '<=', search + '\uf8ff');
        }

        // Sorting
        const [sortField, sortOrder] = sort.split('_');
        query = query.orderBy(sortField, sortOrder);

        // Pagination
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

        // Get total count
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

// Get single product
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
        
        // Get seller info
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

        // Get reviews
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

// Create product (Seller only)
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
            premiumAccounts = []
        } = req.body;

        // Validation
        if (!name || !category || !price || !sellerId) {
            return res.status(400).json({
                error: 'Name, category, price, and sellerId are required'
            });
        }

        // Validate seller exists
        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();
        if (!sellerDoc.exists) {
            return res.status(404).json({
                error: 'Seller not found'
            });
        }

        // Generate slug
        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        // Prepare product data
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // Add type-specific fields
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

        // Create notification for admin
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

// Update product
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

        // Remove fields that shouldn't be updated directly
        delete updates.id;
        delete updates.createdAt;
        delete updates.sales;
        delete updates.views;

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

// Delete product
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

// Create order
app.post('/api/orders', async (req, res) => {
    try {
        const { 
            productId, 
            buyerName, 
            buyerEmail, 
            buyerPhone,
            sellerId,
            amount
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
            productName: 'Product',
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

// Get order by ID
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

        // Mask email for security
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

// Update order status
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

        // If payment is successful, update product sales and seller wallet
        if (paymentStatus === 'paid' || paymentStatus === 'settlement') {
            const data = orderDoc.data();
            
            // Update product sales
            await db.collection('products').doc(data.productId).update({
                sales: admin.firestore.FieldValue.increment(1)
            });

            // Update seller wallet (holding balance)
            if (data.sellerId) {
                const sellerRef = db.collection('users').doc(data.sellerId);
                await sellerRef.update({
                    'wallet.holding': admin.firestore.FieldValue.increment(data.amount || 0)
                });

                // Create notification for seller
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

// Get seller orders
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

// Create Midtrans transaction
app.post('/api/payment/create', async (req, res) => {
    try {
        const { 
            orderId, 
            amount, 
            buyerName, 
            buyerEmail, 
            buyerPhone, 
            productName,
            orderId: orderRefId 
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

// Payment notification webhook
app.post('/api/payment/notification', async (req, res) => {
    try {
        const notification = req.body;
        console.log('Payment notification received:', JSON.stringify(notification, null, 2));

        const { order_id, transaction_status, fraud_status, gross_amount } = notification;

        // Find order in Firestore
        const ordersRef = db.collection('orders');
        const snapshot = await ordersRef.where('orderId', '==', order_id).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const orderDoc = snapshot.docs[0];
        const orderData = orderDoc.data();

        // Update order status based on payment status
        let newStatus = 'pending';
        let newPaymentStatus = 'pending';

        if (transaction_status === 'capture' || transaction_status === 'settlement') {
            if (fraud_status === 'accept') {
                newStatus = 'paid';
                newPaymentStatus = 'settlement';
                
                // Update product sales
                await db.collection('products').doc(orderData.productId).update({
                    sales: admin.firestore.FieldValue.increment(1)
                });

                // Update seller wallet (holding balance)
                if (orderData.sellerId) {
                    const sellerRef = db.collection('users').doc(orderData.sellerId);
                    await sellerRef.update({
                        'wallet.holding': admin.firestore.FieldValue.increment(orderData.amount || 0)
                    });

                    // Create notification for seller
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

        // Update order
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
// USER/WALLET ENDPOINTS
// ============================================

// Get seller wallet
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

// Request withdrawal
app.post('/api/withdraw', async (req, res) => {
    try {
        const { sellerId, amount, method, accountNumber, accountName, note } = req.body;

        if (!sellerId || !amount || !method || !accountNumber || !accountName) {
            return res.status(400).json({
                error: 'Seller ID, amount, method, account number, and account name are required'
            });
        }

        // Check seller balance
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

        // Get settings for min/max withdrawal
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

        // Create withdrawal request
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

        // Update seller wallet (hold amount)
        await sellerRef.update({
            'wallet.available': admin.firestore.FieldValue.increment(-amount),
            'wallet.holding': admin.firestore.FieldValue.increment(amount)
        });

        // Create notification for admin
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

// Get seller withdrawals
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

// Admin: Update withdrawal status
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
            // Release holding balance to available
            const sellerRef = db.collection('users').doc(data.sellerId);
            await sellerRef.update({
                'wallet.holding': admin.firestore.FieldValue.increment(-data.amount)
            });
        } else if (status === 'rejected') {
            // Return to available balance
            const sellerRef = db.collection('users').doc(data.sellerId);
            await sellerRef.update({
                'wallet.available': admin.firestore.FieldValue.increment(data.amount),
                'wallet.holding': admin.firestore.FieldValue.increment(-data.amount)
            });
        }

        await withdrawalRef.update(updates);

        // Create notification for seller
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
// REVIEW ENDPOINTS
// ============================================

// Create review
app.post('/api/reviews', async (req, res) => {
    try {
        const { productId, orderId, buyerName, rating, comment } = req.body;

        if (!productId || !buyerName || !rating) {
            return res.status(400).json({
                error: 'Product ID, buyer name, and rating are required'
            });
        }

        // Check if order exists and is paid
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

// Get product reviews
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

        // Get total reviews count
        const countSnapshot = await db.collection('reviews')
            .where('productId', '==', productId)
            .count()
            .get();
        const total = countSnapshot.data().count;

        res.json({
            reviews,
            statistics: {
                averageRating: reviewCount > 0 ? (totalRating / reviewCount).toFixed(1) : 0,
                totalReviews: total,
                ratingCounts: await getRatingCounts(productId)
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

// Helper: Get rating counts
async function getRatingCounts(productId) {
    const ratings = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    
    const snapshot = await db.collection('reviews')
        .where('productId', '==', productId)
        .get();

    snapshot.forEach(doc => {
        const rating = doc.data().rating || 0;
        if (rating >= 1 && rating <= 5) {
            ratings[rating]++;
        }
    });

    return ratings;
}

// ============================================
// CATEGORY ENDPOINTS
// ============================================

// Get all categories
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

// Create category (Admin only)
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
// SETTINGS ENDPOINTS
// ============================================

// Get settings
app.get('/api/settings', async (req, res) => {
    try {
        const snapshot = await db.collection('settings').get();
        
        const settings = {};
        snapshot.forEach(doc => {
            settings[doc.id] = {
                id: doc.id,
                ...doc.data()
            };
        });

        res.json(settings);

    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({
            error: 'Failed to fetch settings',
            details: error.message
        });
    }
});

// Update settings (Admin only)
app.put('/api/settings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const settingsRef = db.collection('settings').doc(id);
        await settingsRef.update({
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            id,
            ...updates
        });

    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({
            error: 'Failed to update settings',
            details: error.message
        });
    }
});

// ============================================
// BANNER ENDPOINTS
// ============================================

// Get active banners
app.get('/api/banners', async (req, res) => {
    try {
        const now = new Date();
        const snapshot = await db.collection('banners')
            .where('isActive', '==', true)
            .where('expiresAt', '>', now)
            .orderBy('createdAt', 'desc')
            .get();

        const banners = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            banners.push({
                id: doc.id,
                ...data,
                expiresAt: data.expiresAt?.toDate?.() || data.expiresAt,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            });
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

// Create banner (Seller)
app.post('/api/banners', async (req, res) => {
    try {
        const { 
            productId, 
            sellerId, 
            title, 
            imageUrl, 
            duration, // in hours
            price 
        } = req.body;

        if (!productId || !sellerId || !duration || !price) {
            return res.status(400).json({
                error: 'Product ID, seller ID, duration, and price are required'
            });
        }

        // Check seller balance
        const sellerRef = db.collection('users').doc(sellerId);
        const sellerDoc = await sellerRef.get();
        
        if (!sellerDoc.exists) {
            return res.status(404).json({
                error: 'Seller not found'
            });
        }

        const data = sellerDoc.data();
        const wallet = data.wallet || { available: 0 };

        if (wallet.available < price) {
            return res.status(400).json({
                error: 'Insufficient balance'
            });
        }

        // Calculate expiry date
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + parseInt(duration));

        const bannerData = {
            productId,
            sellerId,
            title: title || 'Banner Promotion',
            imageUrl: imageUrl || '',
            duration: parseInt(duration),
            price: parseInt(price),
            isActive: true,
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await db.collection('banners').add(bannerData);

        // Deduct from seller wallet
        await sellerRef.update({
            'wallet.available': admin.firestore.FieldValue.increment(-price)
        });

        res.status(201).json({
            id: docRef.id,
            ...bannerData
        });

    } catch (error) {
        console.error('Error creating banner:', error);
        res.status(500).json({
            error: 'Failed to create banner',
            details: error.message
        });
    }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================

// Get user notifications
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { unreadOnly = false, page = 1, limit = 20 } = req.query;

        let query = db.collection('notifications')
            .where('userId', '==', userId);

        if (unreadOnly === 'true') {
            query = query.where('read', '==', false);
        }

        query = query.orderBy('createdAt', 'desc')
            .limit(parseInt(limit))
            .offset((parseInt(page) - 1) * parseInt(limit));

        const snapshot = await query.get();
        
        const notifications = [];
        snapshot.forEach(doc => {
            notifications.push({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
            });
        });

        res.json({
            notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            error: 'Failed to fetch notifications',
            details: error.message
        });
    }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const notificationRef = db.collection('notifications').doc(id);
        
        await notificationRef.update({
            read: true,
            readAt: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            error: 'Failed to update notification',
            details: error.message
        });
    }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

// Get dashboard stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        // Get total sellers
        const sellersSnapshot = await db.collection('users')
            .where('role', '==', 'seller')
            .count()
            .get();
        const totalSellers = sellersSnapshot.data().count;

        // Get total products
        const productsSnapshot = await db.collection('products')
            .where('status', '==', 'published')
            .count()
            .get();
        const totalProducts = productsSnapshot.data().count;

        // Get total orders
        const ordersSnapshot = await db.collection('orders')
            .where('paymentStatus', '==', 'settlement')
            .count()
            .get();
        const totalOrders = ordersSnapshot.data().count;

        // Get total revenue
        const revenueSnapshot = await db.collection('orders')
            .where('paymentStatus', '==', 'settlement')
            .get();
        let totalRevenue = 0;
        revenueSnapshot.forEach(doc => {
            totalRevenue += doc.data().amount || 0;
        });

        // Get pending withdrawals
        const pendingWithdrawals = await db.collection('withdrawals')
            .where('status', '==', 'pending')
            .count()
            .get();

        // Get active banners
        const activeBanners = await db.collection('banners')
            .where('isActive', '==', true)
            .count()
            .get();

        res.json({
            totalSellers,
            totalProducts,
            totalOrders,
            totalRevenue,
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

// Get all sellers (Admin)
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

// Update seller (Admin)
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

        // Prevent changing role to admin
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