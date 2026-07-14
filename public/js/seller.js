// File: public/js/seller.js
import { 
    db, auth, collections,
    collection, doc, getDoc, getDocs, query, where, 
    orderBy, limit, addDoc, updateDoc, deleteDoc,
    serverTimestamp, increment, onSnapshot
} from './firebase-config.js';
import { showToast, formatPrice, formatDate, navigate } from './app.js';

// ============================================
// SELLER DASHBOARD
// ============================================

export async function sellerDashboardPage() {
    // Check if user is authenticated
    if (!auth.currentUser) {
        navigate('/seller/login');
        return;
    }

    // Check if user is a seller
    const userData = await getUserData(auth.currentUser.uid);
    if (!userData || userData.role !== 'seller') {
        showToast('error', 'Anda tidak memiliki akses sebagai seller');
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
                    </div>
                    
                    <nav class="space-y-1">
                        <a href="/seller/dashboard" class="sidebar-link active flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                            <i class="fas fa-chart-pie"></i>
                            <span>Dashboard</span>
                        </a>
                        <a href="/seller/products" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-box"></i>
                            <span>Produk</span>
                            <span class="ml-auto bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full text-xs">${userData.productCount || 0}</span>
                        </a>
                        <a href="/seller/wallet" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-wallet"></i>
                            <span>Wallet</span>
                        </a>
                        <a href="/seller/transactions" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-exchange-alt"></i>
                            <span>Transaksi</span>
                        </a>
                        <a href="/seller/withdraw" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-arrow-up"></i>
                            <span>Withdraw</span>
                        </a>
                        <a href="/seller/settings" class="sidebar-link flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                            <i class="fas fa-cog"></i>
                            <span>Pengaturan</span>
                        </a>
                        <button onclick="handleLogout()" class="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition mt-4">
                            <i class="fas fa-sign-out-alt"></i>
                            <span>Logout</span>
                        </button>
                    </nav>
                </div>
            </aside>

            <!-- Main Content -->
            <main class="ml-64 flex-1 p-6">
                <div class="mb-8">
                    <h1 class="text-2xl font-bold">Dashboard</h1>
                    <p class="text-gray-600 dark:text-gray-400">Selamat datang, ${userData.storeName || userData.displayName || 'Seller'}!</p>
                </div>

                <!-- Stats -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm text-gray-500">Total Produk</p>
                                <p class="text-2xl font-bold" id="totalProducts">${userData.productCount || 0}</p>
                            </div>
                            <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xl">
                                <i class="fas fa-box"></i>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm text-gray-500">Total Penjualan</p>
                                <p class="text-2xl font-bold" id="totalSales">${userData.totalSales || 0}</p>
                            </div>
                            <div class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 text-xl">
                                <i class="fas fa-shopping-cart"></i>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm text-gray-500">Total Pendapatan</p>
                                <p class="text-2xl font-bold text-indigo-600 dark:text-indigo-400" id="totalRevenue">
                                    Rp${formatPrice(userData.wallet?.totalRevenue || 0)}
                                </p>
                            </div>
                            <div class="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-400 text-xl">
                                <i class="fas fa-money-bill-wave"></i>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm text-gray-500">Saldo Tersedia</p>
                                <p class="text-2xl font-bold text-green-600 dark:text-green-400" id="availableBalance">
                                    Rp${formatPrice(userData.wallet?.available || 0)}
                                </p>
                            </div>
                            <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 text-xl">
                                <i class="fas fa-wallet"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Charts -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                        <h3 class="font-semibold mb-4">Grafik Penjualan</h3>
                        <div id="salesChart" class="h-64 flex items-center justify-center text-gray-400">
                            <i class="fas fa-chart-line text-4xl"></i>
                            <span class="ml-3">Data penjualan akan muncul disini</span>
                        </div>
                    </div>
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                        <h3 class="font-semibold mb-4">Grafik Pendapatan</h3>
                        <div id="revenueChart" class="h-64 flex items-center justify-center text-gray-400">
                            <i class="fas fa-chart-bar text-4xl"></i>
                            <span class="ml-3">Data pendapatan akan muncul disini</span>
                        </div>
                    </div>
                </div>

                <!-- Recent Products -->
                <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                    <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                        <div class="flex justify-between items-center">
                            <h3 class="font-semibold">Produk Terbaru</h3>
                            <a href="/seller/products" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Lihat Semua</a>
                        </div>
                    </div>
                    <div id="recentProducts" class="p-6">
                        <div class="text-center text-gray-500">Memuat produk...</div>
                    </div>
                </div>
            </main>
        </div>
    `;

    app.innerHTML = html;

    // Load data
    await loadSellerStats(userData);
    await loadRecentProducts(auth.currentUser.uid);
    
    // Setup sidebar active state
    setupSidebar();
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
// LOAD SELLER STATS
// ============================================

async function loadSellerStats(userData) {
    try {
        const sellerId = auth.currentUser.uid;
        
        // Get total products
        const productsSnapshot = await getDocs(
            query(collection(db, collections.products), 
                  where('sellerId', '==', sellerId),
                  where('status', '==', 'published'))
        );
        const totalProducts = productsSnapshot.size;
        
        // Get total sales
        const ordersSnapshot = await getDocs(
            query(collection(db, collections.orders),
                  where('sellerId', '==', sellerId),
                  where('paymentStatus', '==', 'settlement'))
        );
        const totalSales = ordersSnapshot.size;
        
        // Calculate total revenue
        let totalRevenue = 0;
        ordersSnapshot.forEach(doc => {
            totalRevenue += doc.data().amount || 0;
        });
        
        // Update UI
        document.getElementById('totalProducts').textContent = totalProducts;
        document.getElementById('totalSales').textContent = totalSales;
        document.getElementById('totalRevenue').textContent = `Rp${formatPrice(totalRevenue)}`;
        document.getElementById('availableBalance').textContent = `Rp${formatPrice(userData.wallet?.available || 0)}`;
        
    } catch (error) {
        console.error('Error loading seller stats:', error);
    }
}

// ============================================
// LOAD RECENT PRODUCTS
// ============================================

async function loadRecentProducts(sellerId) {
    try {
        const q = query(
            collection(db, collections.products),
            where('sellerId', '==', sellerId),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        
        const snapshot = await getDocs(q);
        const container = document.getElementById('recentProducts');
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-box-open text-4xl mb-2"></i>
                    <p>Belum ada produk</p>
                    <a href="/seller/products/create" class="btn-primary inline-block mt-4 text-sm">
                        <i class="fas fa-plus mr-2"></i>
                        Tambah Produk
                    </a>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
                ${snapshot.docs.map(doc => {
                    const product = doc.data();
                    return `
                        <div class="py-4 flex items-center justify-between">
                            <div class="flex items-center gap-4">
                                <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                    <i class="fas fa-box"></i>
                                </div>
                                <div>
                                    <p class="font-medium">${product.name}</p>
                                    <p class="text-sm text-gray-500">${product.category} • ${product.sales || 0} terjual</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="font-bold text-indigo-600 dark:text-indigo-400">Rp${formatPrice(product.price)}</p>
                                <span class="badge ${product.status === 'published' ? 'badge-success' : 'badge-warning'} text-xs">
                                    ${product.status === 'published' ? 'Published' : product.status}
                                </span>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading recent products:', error);
        document.getElementById('recentProducts').innerHTML = 
            '<div class="text-center text-red-500">Gagal memuat produk</div>';
    }
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
// HANDLE LOGOUT
// ============================================

window.handleLogout = async function() {
    try {
        await signOut(auth);
        showToast('success', 'Berhasil logout');
        navigate('/');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('error', 'Gagal logout');
    }
};

// ============================================
// EXPORT
// ============================================

export { sellerDashboardPage as default };