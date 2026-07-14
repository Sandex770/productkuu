// File: public/js/admin.js
import { 
    db, auth, collections,
    collection, doc, getDoc, getDocs, query, where, 
    orderBy, limit, addDoc, updateDoc, deleteDoc,
    serverTimestamp, increment, onSnapshot, getCountFromServer,
    signOut
} from './firebase-config.js';
import { showToast, formatPrice, formatDate, navigate } from './app.js';

// ============================================
// ADMIN DASHBOARD
// ============================================

export async function adminDashboardPage() {
    // Check if user is authenticated and is admin
    if (!auth.currentUser) {
        navigate('/seller/login');
        return;
    }

    const userData = await getUserData(auth.currentUser.uid);
    if (!userData || userData.role !== 'admin') {
        showToast('error', 'Anda tidak memiliki akses sebagai admin');
        navigate('/');
        return;
    }

    const html = `
        <div class="flex min-h-screen bg-gray-50 dark:bg-gray-900">
            <!-- Sidebar -->
            <aside class="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 fixed h-full overflow-y-auto">
                <div class="p-4">
                    <div class="flex items-center gap-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-8">
                        <i class="fas fa-cube"></i>
                        <span>ProductKuu</span>
                        <span class="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">Admin</span>
                    </div>
                    
                    <nav class="space-y-1">
                        <a href="/admin/dashboard" class="sidebar-link active flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                            <i class="fas fa-chart-pie"></i>
                            <span>Dashboard</span>
                        </a>
                        <a href="/admin/sellers" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-users"></i>
                            <span>Seller</span>
                        </a>
                        <a href="/admin/products" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-box"></i>
                            <span>Produk</span>
                        </a>
                        <a href="/admin/orders" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-shopping-cart"></i>
                            <span>Order</span>
                        </a>
                        <a href="/admin/banners" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-images"></i>
                            <span>Banner</span>
                        </a>
                        <a href="/admin/withdrawals" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-arrow-up"></i>
                            <span>Withdraw</span>
                        </a>
                        <a href="/admin/settings" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-cog"></i>
                            <span>Pengaturan</span>
                        </a>
                        <button onclick="adminLogout()" class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition mt-4">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Logout</span>
                        </button>
                    </nav>
                </div>
            </aside>

            <!-- Main Content -->
            <main class="ml-64 flex-1 p-6">
                <div class="mb-8">
                    <h1 class="text-2xl font-bold">Dashboard Admin</h1>
                    <p class="text-gray-600 dark:text-gray-400">Selamat datang, ${userData.displayName || 'Admin'}!</p>
                </div>

                <!-- Stats -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" id="adminStats">
                    ${await renderAdminStats()}
                </div>

                <!-- Recent Activity -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h3 class="font-semibold mb-4">Order Terbaru</h3>
                        <div id="recentOrders">
                            ${await renderRecentOrders()}
                        </div>
                    </div>
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
                        <h3 class="font-semibold mb-4">Withdraw Pending</h3>
                        <div id="pendingWithdrawals">
                            ${await renderPendingWithdrawals()}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;

    app.innerHTML = html;
    setupSidebar();
    
    // Real-time updates
    setupRealtimeUpdates();
}

// ============================================
// GET USER DATA
// ============================================

async function getUserData(uid) {
    try {
        const userRef = doc(db, collections.users, uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists) {
            return { id: userDoc.id, ...userDoc.data() };
        }
        return null;
    } catch (error) {
        console.error('Error getting user data:', error);
        return null;
    }
}

// ============================================
// RENDER ADMIN STATS
// ============================================

async function renderAdminStats() {
    try {
        // Get total sellers
        const sellersCount = await getCountFromServer(
            query(collection(db, collections.users), where('role', '==', 'seller'))
        );
        
        // Get total products
        const productsCount = await getCountFromServer(
            query(collection(db, collections.products), where('status', '==', 'published'))
        );
        
        // Get total orders
        const ordersCount = await getCountFromServer(
            query(collection(db, collections.orders), where('paymentStatus', '==', 'settlement'))
        );
        
        // Get total revenue
        const ordersSnapshot = await getDocs(
            query(collection(db, collections.orders), where('paymentStatus', '==', 'settlement'))
        );
        let totalRevenue = 0;
        ordersSnapshot.forEach(doc => {
            totalRevenue += doc.data().amount || 0;
        });
        
        // Get pending withdrawals
        const pendingWithdrawals = await getCountFromServer(
            query(collection(db, collections.withdrawals), where('status', '==', 'pending'))
        );
        
        // Get active banners
        const now = new Date();
        const activeBanners = await getCountFromServer(
            query(
                collection(db, collections.banners), 
                where('isActive', '==', true),
                where('expiresAt', '>', now)
            )
        );

        return `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500">Total Seller</p>
                        <p class="text-2xl font-bold">${sellersCount.data().count}</p>
                    </div>
                    <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xl">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500">Total Produk</p>
                        <p class="text-2xl font-bold">${productsCount.data().count}</p>
                    </div>
                    <div class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 text-xl">
                        <i class="fas fa-box"></i>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500">Total Order</p>
                        <p class="text-2xl font-bold">${ordersCount.data().count}</p>
                    </div>
                    <div class="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-400 text-xl">
                        <i class="fas fa-shopping-cart"></i>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500">Total Pendapatan</p>
                        <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">Rp${formatPrice(totalRevenue)}</p>
                    </div>
                    <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 text-xl">
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500">Withdraw Pending</p>
                        <p class="text-2xl font-bold text-orange-500">${pendingWithdrawals.data().count}</p>
                    </div>
                    <div class="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 text-xl">
                        <i class="fas fa-clock"></i>
                    </div>
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm text-gray-500">Banner Aktif</p>
                        <p class="text-2xl font-bold text-blue-500">${activeBanners.data().count}</p>
                    </div>
                    <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl">
                        <i class="fas fa-images"></i>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading admin stats:', error);
        return '<div class="col-span-full text-red-500">Gagal memuat statistik</div>';
    }
}

// ============================================
// RENDER RECENT ORDERS
// ============================================

async function renderRecentOrders() {
    try {
        const q = query(
            collection(db, collections.orders),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            return '<div class="text-center text-gray-500 py-4">Belum ada order</div>';
        }

        return snapshot.docs.map(doc => {
            const order = doc.data();
            const statusColors = {
                'pending': 'badge-warning',
                'paid': 'badge-success',
                'settlement': 'badge-success',
                'failed': 'badge-danger',
                'expire': 'badge-danger'
            };
            const statusClass = statusColors[order.paymentStatus] || 'badge-warning';

            return `
                <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>
                        <p class="font-medium">${order.productName || 'Product'}</p>
                        <p class="text-sm text-gray-500">${order.buyerName} • ${formatDate(order.createdAt)}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-indigo-600 dark:text-indigo-400">Rp${formatPrice(order.amount)}</p>
                        <span class="badge ${statusClass} text-xs">${order.paymentStatus || order.status}</span>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading recent orders:', error);
        return '<div class="text-red-500">Gagal memuat order</div>';
    }
}

// ============================================
// RENDER PENDING WITHDRAWALS
// ============================================

async function renderPendingWithdrawals() {
    try {
        const q = query(
            collection(db, collections.withdrawals),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'asc'),
            limit(5)
        );
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            return '<div class="text-center text-gray-500 py-4">Tidak ada withdraw pending</div>';
        }

        return snapshot.docs.map(doc => {
            const withdrawal = doc.data();
            return `
                <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <div>
                        <p class="font-medium">${withdrawal.accountName}</p>
                        <p class="text-sm text-gray-500">${withdrawal.method} • ${withdrawal.accountNumber}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-orange-500">Rp${formatPrice(withdrawal.amount)}</p>
                        <button onclick="approveWithdrawal('${doc.id}')" class="text-xs text-green-600 hover:text-green-700 mr-2">
                            <i class="fas fa-check"></i> Approve
                        </button>
                        <button onclick="rejectWithdrawal('${doc.id}')" class="text-xs text-red-600 hover:text-red-700">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading pending withdrawals:', error);
        return '<div class="text-red-500">Gagal memuat withdraw</div>';
    }
}

// ============================================
// WITHDRAWAL ACTIONS
// ============================================

window.approveWithdrawal = async function(id) {
    if (!confirm('Setujui permintaan withdraw ini?')) return;
    
    try {
        const response = await fetch(`/api/admin/withdrawals/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved', adminNote: 'Disetujui admin' })
        });
        
        if (!response.ok) throw new Error('Gagal menyetujui withdraw');
        
        showToast('success', 'Withdraw disetujui');
        location.reload();
    } catch (error) {
        console.error('Error approving withdrawal:', error);
        showToast('error', error.message);
    }
};

window.rejectWithdrawal = async function(id) {
    const note = prompt('Alasan penolakan:');
    if (note === null) return;
    
    try {
        const response = await fetch(`/api/admin/withdrawals/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: 'rejected', 
                adminNote: note || 'Ditolak admin' 
            })
        });
        
        if (!response.ok) throw new Error('Gagal menolak withdraw');
        
        showToast('success', 'Withdraw ditolak');
        location.reload();
    } catch (error) {
        console.error('Error rejecting withdrawal:', error);
        showToast('error', error.message);
    }
};

// ============================================
// SETUP REALTIME UPDATES
// ============================================

function setupRealtimeUpdates() {
    // Listen for new orders
    onSnapshot(
        query(collection(db, collections.orders), orderBy('createdAt', 'desc'), limit(1)),
        () => {
            // Refresh recent orders
            renderRecentOrders().then(html => {
                const container = document.getElementById('recentOrders');
                if (container) container.innerHTML = html;
            });
        }
    );
    
    // Listen for pending withdrawals
    onSnapshot(
        query(collection(db, collections.withdrawals), where('status', '==', 'pending')),
        () => {
            // Refresh pending withdrawals
            renderPendingWithdrawals().then(html => {
                const container = document.getElementById('pendingWithdrawals');
                if (container) container.innerHTML = html;
            });
        }
    );
}

// ============================================
// SETUP SIDEBAR
// ============================================

function setupSidebar() {
    const links = document.querySelectorAll('.sidebar-link');
    const currentPath = window.location.pathname;
    
    links.forEach(link => {
        link.classList.remove('active', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'text-indigo-600', 'dark:text-indigo-400');
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active', 'bg-indigo-50', 'dark:bg-indigo-900/20', 'text-indigo-600', 'dark:text-indigo-400');
        }
    });
}

// ============================================
// ADMIN LOGOUT
// ============================================

window.adminLogout = async function() {
    try {
        await signOut(auth);
        showToast('success', 'Berhasil logout');
        navigate('/');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('error', 'Gagal logout');
    }
};

export { adminDashboardPage as default };