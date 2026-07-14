import { db } from '../firebase/config';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  addDoc,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';

// ============ USER FUNCTIONS ============
export const getUser = async (userId) => {
  const docRef = doc(db, 'users', userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
};

export const updateUser = async (userId, data) => {
  const docRef = doc(db, 'users', userId);
  await updateDoc(docRef, data);
  return { id: userId, ...data };
};

export const getSellers = async (filters = {}) => {
  let q = collection(db, 'users');
  const conditions = [where('role', '==', 'seller')];
  
  if (filters.verified !== undefined) {
    conditions.push(where('verified', '==', filters.verified));
  }
  
  if (filters.suspended !== undefined) {
    conditions.push(where('suspended', '==', filters.suspended));
  }
  
  q = query(q, ...conditions);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ============ PRODUCT FUNCTIONS ============
export const getProducts = async (filters = {}) => {
  let q = collection(db, 'products');
  const conditions = [];
  
  if (filters.status) {
    conditions.push(where('status', '==', filters.status));
  }
  
  if (filters.sellerId) {
    conditions.push(where('sellerId', '==', filters.sellerId));
  }
  
  if (filters.category) {
    conditions.push(where('category', '==', filters.category));
  }
  
  if (filters.isPremium !== undefined) {
    conditions.push(where('isPremium', '==', filters.isPremium));
  }
  
  if (filters.orderBy) {
    q = query(q, ...conditions, orderBy(filters.orderBy, filters.orderDir || 'desc'));
  } else {
    q = query(q, ...conditions, orderBy('createdAt', 'desc'));
  }
  
  if (filters.limit) {
    q = query(q, limit(filters.limit));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getProduct = async (productId) => {
  const docRef = doc(db, 'products', productId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
};

export const createProduct = async (productData) => {
  const docRef = await addDoc(collection(db, 'products'), {
    ...productData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    views: 0,
    sold: 0,
    rating: 0,
    reviews: []
  });
  return { id: docRef.id, ...productData };
};

export const updateProduct = async (productId, data) => {
  const docRef = doc(db, 'products', productId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
  return { id: productId, ...data };
};

export const deleteProduct = async (productId) => {
  const docRef = doc(db, 'products', productId);
  await deleteDoc(docRef);
  return productId;
};

// ============ ORDER FUNCTIONS ============
export const createOrder = async (orderData) => {
  const docRef = await addDoc(collection(db, 'orders'), {
    ...orderData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'pending'
  });
  return { id: docRef.id, ...orderData };
};

export const getOrder = async (orderId) => {
  const docRef = doc(db, 'orders', orderId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
};

export const getOrders = async (filters = {}) => {
  let q = collection(db, 'orders');
  const conditions = [];
  
  if (filters.status) {
    conditions.push(where('status', '==', filters.status));
  }
  
  if (filters.sellerId) {
    conditions.push(where('sellerId', '==', filters.sellerId));
  }
  
  if (filters.buyerEmail) {
    conditions.push(where('buyerEmail', '==', filters.buyerEmail));
  }
  
  q = query(q, ...conditions, orderBy('createdAt', 'desc'));
  
  if (filters.limit) {
    q = query(q, limit(filters.limit));
  }
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getOrdersBySeller = async (sellerId) => {
  const q = query(
    collection(db, 'orders'),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getOrdersByBuyer = async (buyerEmail) => {
  const q = query(
    collection(db, 'orders'),
    where('buyerEmail', '==', buyerEmail),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateOrder = async (orderId, data) => {
  const docRef = doc(db, 'orders', orderId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
  return { id: orderId, ...data };
};

// ============ WALLET FUNCTIONS ============
export const getWallet = async (sellerId) => {
  const q = query(collection(db, 'wallets'), where('sellerId', '==', sellerId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    const docRef = await addDoc(collection(db, 'wallets'), {
      sellerId: sellerId,
      available: 0,
      holding: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: docRef.id, sellerId, available: 0, holding: 0, totalEarned: 0, totalWithdrawn: 0 };
  }
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const updateWallet = async (walletId, data) => {
  const docRef = doc(db, 'wallets', walletId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
  return { id: walletId, ...data };
};

// ============ WITHDRAWAL FUNCTIONS ============
export const createWithdrawal = async (data) => {
  const docRef = await addDoc(collection(db, 'withdrawals'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: docRef.id, ...data };
};

export const getWithdrawals = async (filters = {}) => {
  let q = collection(db, 'withdrawals');
  const conditions = [];
  
  if (filters.status) {
    conditions.push(where('status', '==', filters.status));
  }
  
  if (filters.sellerId) {
    conditions.push(where('sellerId', '==', filters.sellerId));
  }
  
  q = query(q, ...conditions, orderBy('createdAt', 'desc'));
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getWithdrawalsBySeller = async (sellerId) => {
  const q = query(
    collection(db, 'withdrawals'),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const updateWithdrawal = async (withdrawalId, data) => {
  const docRef = doc(db, 'withdrawals', withdrawalId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
  return { id: withdrawalId, ...data };
};

// ============ BANNER FUNCTIONS ============
export const getBanners = async (active = null) => {
  let q = collection(db, 'banner_promotions');
  if (active !== null) {
    q = query(q, where('active', '==', active));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const createBanner = async (data) => {
  const docRef = await addDoc(collection(db, 'banner_promotions'), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return { id: docRef.id, ...data };
};

export const updateBanner = async (bannerId, data) => {
  const docRef = doc(db, 'banner_promotions', bannerId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
  return { id: bannerId, ...data };
};

export const deleteBanner = async (bannerId) => {
  const docRef = doc(db, 'banner_promotions', bannerId);
  await deleteDoc(docRef);
  return bannerId;
};

// ============ SETTINGS FUNCTIONS ============
export const getSettings = async () => {
  const q = collection(db, 'settings');
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    const defaultSettings = {
      websiteName: 'ProductKuu',
      primaryColor: '#6366f1',
      secondaryColor: '#4f46e5',
      bannerPrice: 100000,
      bannerDuration: 24,
      holdingBalance: 7,
      marketplaceCommission: 10,
      minWithdraw: 50000,
      maxWithdraw: 10000000,
      withdrawMethods: ['DANA', 'OVO', 'GoPay', 'ShopeePay', 'Bank BCA', 'Bank BRI', 'Bank Mandiri', 'Bank BNI'],
      maintenanceMode: false,
      updatedAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'settings'), defaultSettings);
    return { id: docRef.id, ...defaultSettings };
  }
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const updateSettings = async (settingsId, data) => {
  const docRef = doc(db, 'settings', settingsId);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp()
  });
  return { id: settingsId, ...data };
};

// ============ NOTIFICATION FUNCTIONS ============
export const createNotification = async (data) => {
  const docRef = await addDoc(collection(db, 'notifications'), {
    ...data,
    read: false,
    createdAt: serverTimestamp()
  });
  return { id: docRef.id, ...data };
};

export const getNotifications = async (userId) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const markNotificationAsRead = async (notificationId) => {
  const docRef = doc(db, 'notifications', notificationId);
  await updateDoc(docRef, { read: true });
  return notificationId;
};

// ============ REVIEW FUNCTIONS ============
export const createReview = async (data) => {
  const docRef = await addDoc(collection(db, 'reviews'), {
    ...data,
    createdAt: serverTimestamp()
  });
  
  const productRef = doc(db, 'products', data.productId);
  const productSnap = await getDoc(productRef);
  if (productSnap.exists()) {
    const product = productSnap.data();
    const reviews = product.reviews || [];
    const newReviews = [...reviews, { rating: data.rating, comment: data.comment, userId: data.userId }];
    const avgRating = newReviews.reduce((acc, r) => acc + r.rating, 0) / newReviews.length;
    
    await updateDoc(productRef, {
      reviews: newReviews,
      rating: Math.round(avgRating * 10) / 10
    });
  }
  
  return { id: docRef.id, ...data };
};

// ============ REAL-TIME LISTENERS ============
export const listenToProducts = (callback, filters = {}) => {
  let q = collection(db, 'products');
  const conditions = [];
  
  if (filters.status) {
    conditions.push(where('status', '==', filters.status));
  }
  
  if (filters.sellerId) {
    conditions.push(where('sellerId', '==', filters.sellerId));
  }
  
  q = query(q, ...conditions, orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(products);
  });
};

export const listenToOrders = (callback, sellerId) => {
  const q = query(
    collection(db, 'orders'),
    where('sellerId', '==', sellerId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(orders);
  });
};

export const listenToNotifications = (callback, userId) => {
  const q = query(
    collection(db, 'notifications'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(notifications);
  });
};