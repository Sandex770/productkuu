// File: public/js/app.js
import { 
    db, auth, collections,
    collection, doc, getDoc, getDocs, query, where, 
    orderBy, limit, onSnapshot, addDoc, updateDoc,
    serverTimestamp, increment, getCountFromServer,
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';

// ============================================
// APPLICATION STATE
// ============================================

const state = {
    currentPage: 'home',
    products: [],
    categories: [],
    cart: JSON.parse(localStorage.getItem('cart') || '[]'),
    wishlist: JSON.parse(localStorage.getItem('wishlist') || '[]'),
    recentlyViewed: JSON.parse(localStorage.getItem('recentlyViewed') || '[]'),
    user: null,
    darkMode: localStorage.getItem('darkMode') === 'true' || false,
    loading: false
};

// ============================================
// DOM REFS
// ============================================

const app = document.getElementById('app');
const themeToggle = document.getElementById('themeToggle');

// ============================================
// ROUTER
// ============================================

// Tambahkan routes ini ke dalam object routes di app.js

// Tambahkan route ini ke object routes
const routes = {
    '/': homePage,
    '/product/:id': productDetailPage,
    '/category/:slug': categoryPage,
    '/search': searchPage,
    '/cek-order': checkOrderPage,
    '/seller/login': sellerLoginPage,
    '/seller/register': sellerRegisterPage,
    '/seller/dashboard': sellerDashboardPage,
    '/admin/login': adminLoginPage,  // <-- Tambahkan ini
    '/admin/dashboard': adminDashboardPage,
    '/order/:id': orderDetailPage
};

// Tambahkan fungsi adminLoginPage
async function adminLoginPage() {
    const response = await fetch('/pages/admin/login.html');
    const html = await response.text();
    app.innerHTML = html;
    // Re-initialize scripts
    const scripts = app.querySelectorAll('script');
    scripts.forEach(script => {
        const newScript = document.createElement('script');
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
        script.remove();
    });
}

// Update fungsi halaman login dan register
async function sellerLoginPage() {
    // Load login.html content
    const response = await fetch('/pages/seller/login.html');
    const html = await response.text();
    app.innerHTML = html;
    // Re-initialize scripts
    const scripts = app.querySelectorAll('script');
    scripts.forEach(script => {
        const newScript = document.createElement('script');
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
        script.remove();
    });
}

async function sellerRegisterPage() {
    // Load register.html content
    const response = await fetch('/pages/seller/register.html');
    const html = await response.text();
    app.innerHTML = html;
    // Re-initialize scripts
    const scripts = app.querySelectorAll('script');
    scripts.forEach(script => {
        const newScript = document.createElement('script');
        newScript.textContent = script.textContent;
        document.body.appendChild(newScript);
        script.remove();
    });
}



function navigate(path) {
    window.history.pushState({}, '', path);
    renderPage(path);
}

window.navigate = navigate;

// ============================================
// RENDER ENGINE
// ============================================

async function renderPage(path) {
    // Show loading
    app.innerHTML = `
        <div class="flex justify-center items-center min-h-[60vh]">
            <div class="text-center">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent mx-auto"></div>
                <p class="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
        </div>
    `;

    try {
        let route = path;
        let params = {};
        
        // Parse dynamic routes
        if (path.startsWith('/product/')) {
            route = '/product/:id';
            params.id = path.split('/')[2];
        } else if (path.startsWith('/category/')) {
            route = '/category/:slug';
            params.slug = path.split('/')[2];
        } else if (path.startsWith('/order/')) {
            route = '/order/:id';
            params.id = path.split('/')[2];
        }
        
        const pageFunction = routes[route] || notFoundPage;
        await pageFunction(params);
        
        // Update active nav
        updateActiveNav(path);
        
    } catch (error) {
        console.error('Error rendering page:', error);
        app.innerHTML = `
            <div class="container mx-auto px-4 py-20 text-center">
                <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                <h2 class="text-2xl font-bold mb-2">Oops! Terjadi Kesalahan</h2>
                <p class="text-gray-600 dark:text-gray-400">${error.message || 'Maaf, terjadi kesalahan saat memuat halaman.'}</p>
                <button onclick="navigate('/')" class="btn-primary inline-block mt-6">
                    Kembali ke Beranda
                </button>
            </div>
        `;
    }
}

function updateActiveNav(path) {
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('text-indigo-600', 'dark:text-indigo-400');
        if (link.getAttribute('href') === path) {
            link.classList.add('text-indigo-600', 'dark:text-indigo-400');
        }
    });
}

// ============================================
// PAGE: Home
// ============================================

async function homePage() {
    const html = `
        <!-- Hero Section -->
        <section class="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white py-20 md:py-28">
            <div class="absolute inset-0 opacity-10">
                <div class="absolute top-0 left-0 w-72 h-72 bg-white rounded-full blur-3xl"></div>
                <div class="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
            </div>
            <div class="container mx-auto px-4 relative z-10">
                <div class="max-w-3xl mx-auto text-center">
                    <h1 class="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                        Platform Marketplace 
                        <span class="text-yellow-300">Produk Digital</span> 
                        Premium
                    </h1>
                    <p class="text-xl md:text-2xl mb-8 text-indigo-100">
                        Temukan dan beli produk digital berkualitas dari seller terbaik di Indonesia
                    </p>
                    <div class="flex flex-wrap justify-center gap-4">
                        <a href="#products" class="bg-white text-indigo-600 px-8 py-4 rounded-xl font-semibold hover:shadow-xl transition-all hover:scale-105">
                            Jelajahi Produk
                        </a>
                        <a href="/seller/register" class="bg-transparent border-2 border-white text-white px-8 py-4 rounded-xl font-semibold hover:bg-white hover:text-indigo-600 transition-all">
                            Jadi Seller
                        </a>
                    </div>
                </div>
            </div>
        </section>

        <!-- Banners Carousel -->
        <section id="bannerCarousel" class="container mx-auto px-4 -mt-8 relative z-20">
            <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
                <div class="relative">
                    <div id="bannerSlides" class="flex transition-transform duration-500 ease-in-out">
                        <!-- Banners will be loaded here -->
                    </div>
                    <!-- Controls -->
                    <button id="prevBanner" class="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button id="nextBanner" class="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-3 rounded-full hover:bg-black/70 transition">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <div id="bannerIndicators" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    </div>
                </div>
            </div>
        </section>

        <!-- Categories -->
        <section class="py-16 container mx-auto px-4">
            <div class="flex justify-between items-center mb-8">
                <h2 class="text-3xl font-bold">Kategori Populer</h2>
                <a href="/categories" class="text-indigo-600 dark:text-indigo-400 hover:underline">Lihat Semua →</a>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4" id="categoriesGrid">
                <div class="col-span-full text-center text-gray-500">Memuat kategori...</div>
            </div>
        </section>

        <!-- Products -->
        <section class="py-16 bg-gray-50 dark:bg-gray-800/50" id="products">
            <div class="container mx-auto px-4">
                <div class="flex justify-between items-center mb-8">
                    <div class="flex gap-4">
                        <button class="tab-btn active" data-tab="new">Terbaru</button>
                        <button class="tab-btn" data-tab="trending">Trending</button>
                        <button class="tab-btn" data-tab="bestseller">Best Seller</button>
                        <button class="tab-btn" data-tab="premium">Premium</button>
                    </div>
                    <a href="/products" class="text-indigo-600 dark:text-indigo-400 hover:underline">Lihat Semua →</a>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="productsGrid">
                    <div class="col-span-full text-center text-gray-500">Memuat produk...</div>
                </div>
            </div>
        </section>
    `;

    app.innerHTML = html;

    // Load data
    await loadCategories();
    await loadProducts('new');
    await loadBanners();
    
    // Setup tabs
    setupTabs();
    setupBannerCarousel();
}

// ============================================
// LOAD CATEGORIES
// ============================================

async function loadCategories() {
    try {
        const categoriesRef = collection(db, collections.categories);
        const q = query(categoriesRef, orderBy('name'), limit(12));
        const snapshot = await getDocs(q);
        
        const categories = [];
        snapshot.forEach(doc => {
            categories.push({ id: doc.id, ...doc.data() });
        });

        const grid = document.getElementById('categoriesGrid');
        if (categories.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center text-gray-500">Belum ada kategori</div>';
            return;
        }

        grid.innerHTML = categories.map(cat => `
            <a href="/category/${cat.slug}" 
               class="group bg-white dark:bg-gray-800 rounded-xl p-6 text-center shadow-sm hover:shadow-xl transition-all hover:-translate-y-1">
                <div class="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-2xl mb-3 group-hover:scale-110 transition-transform">
                    <i class="fas ${cat.icon || 'fa-tag'}"></i>
                </div>
                <p class="font-medium text-sm">${cat.name}</p>
                <p class="text-xs text-gray-500 mt-1">${cat.productCount || 0} produk</p>
            </a>
        `).join('');

        state.categories = categories;
        
    } catch (error) {
        console.error('Error loading categories:', error);
        const grid = document.getElementById('categoriesGrid');
        grid.innerHTML = '<div class="col-span-full text-center text-red-500">Gagal memuat kategori</div>';
    }
}

// ============================================
// LOAD PRODUCTS
// ============================================

async function loadProducts(tab = 'new') {
    try {
        let productsRef = collection(db, collections.products);
        let constraints = [];
        
        constraints.push(where('status', '==', 'published'));
        
        // Filter by tab
        if (tab === 'trending') {
            constraints.push(where('isTrending', '==', true));
        } else if (tab === 'bestseller') {
            constraints.push(where('isBestSeller', '==', true));
        } else if (tab === 'premium') {
            constraints.push(where('isPremium', '==', true));
        }
        
        // Sort
        let sortField = 'createdAt';
        let sortOrder = 'desc';
        
        if (tab === 'trending') sortField = 'views';
        else if (tab === 'bestseller') sortField = 'sales';
        
        let q = query(productsRef, ...constraints, orderBy(sortField, sortOrder), limit(8));
        const snapshot = await getDocs(q);
        
        const products = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            products.push({ 
                id: doc.id, 
                ...data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt
            });
        });

        const grid = document.getElementById('productsGrid');
        if (products.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12">
                    <i class="fas fa-box-open text-4xl text-gray-400 mb-4"></i>
                    <p class="text-gray-500">Belum ada produk di kategori ini</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = products.map(product => `
            <div class="card-premium p-4 cursor-pointer" onclick="navigate('/product/${product.id}')">
                <div class="relative">
                    <div class="aspect-square bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl flex items-center justify-center text-4xl">
                        <i class="fas fa-box"></i>
                    </div>
                    <div class="absolute top-2 right-2 flex flex-col gap-1">
                        ${product.isPremium ? '<span class="badge badge-info text-xs">Premium</span>' : ''}
                        ${product.isTrending ? '<span class="badge badge-warning text-xs">🔥 Trending</span>' : ''}
                        ${product.isBestSeller ? '<span class="badge badge-success text-xs">⭐ Best Seller</span>' : ''}
                    </div>
                    ${product.type === 'premium-account' ? '<span class="absolute bottom-2 left-2 badge badge-warning text-xs">Account</span>' : ''}
                </div>
                <div class="mt-4">
                    <h3 class="font-semibold text-lg line-clamp-1">${product.name}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${product.category || 'Uncategorized'}</p>
                    <div class="flex items-center justify-between mt-2">
                        <span class="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                            Rp${formatPrice(product.price)}
                        </span>
                        <span class="text-sm text-gray-500">${product.sales || 0} terjual</span>
                    </div>
                </div>
            </div>
        `).join('');

        state.products = products;
        
    } catch (error) {
        console.error('Error loading products:', error);
        const grid = document.getElementById('productsGrid');
        grid.innerHTML = '<div class="col-span-full text-center text-red-500">Gagal memuat produk</div>';
    }
}

// ============================================
// LOAD BANNERS
// ============================================

async function loadBanners() {
    try {
        const bannersRef = collection(db, collections.banners);
        const now = new Date();
        const q = query(
            bannersRef, 
            where('isActive', '==', true),
            where('expiresAt', '>', now),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        const snapshot = await getDocs(q);
        
        const banners = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            banners.push({
                id: doc.id,
                ...data,
                expiresAt: data.expiresAt?.toDate?.() || data.expiresAt
            });
        });

        const slides = document.getElementById('bannerSlides');
        const indicators = document.getElementById('bannerIndicators');
        
        if (banners.length === 0) {
            slides.innerHTML = `
                <div class="min-w-full h-48 md:h-64 flex items-center justify-center bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                    <div class="text-center">
                        <i class="fas fa-cube text-4xl mb-2"></i>
                        <p class="text-xl font-bold">ProductKuu</p>
                        <p class="text-sm opacity-80">Tempat belanja produk digital</p>
                    </div>
                </div>
            `;
            indicators.innerHTML = '';
            return;
        }

        slides.innerHTML = banners.map((banner, index) => `
            <div class="min-w-full h-48 md:h-64 flex items-center justify-center bg-gradient-to-r from-${banner.color || 'indigo-500'} to-${banner.color2 || 'purple-500'} text-white relative">
                ${banner.imageUrl ? `
                    <img src="${banner.imageUrl}" alt="${banner.title}" class="w-full h-full object-cover">
                ` : `
                    <div class="text-center p-4">
                        <i class="fas fa-cube text-4xl mb-2"></i>
                        <p class="text-xl font-bold">${banner.title || 'Promo Spesial'}</p>
                        ${banner.description ? `<p class="text-sm opacity-80">${banner.description}</p>` : ''}
                    </div>
                `}
                ${banner.productId ? `
                    <a href="/product/${banner.productId}" class="absolute inset-0"></a>
                ` : ''}
            </div>
        `).join('');

        indicators.innerHTML = banners.map((_, index) => `
            <button class="w-2 h-2 rounded-full ${index === 0 ? 'bg-white' : 'bg-white/50'} transition" data-index="${index}"></button>
        `).join('');

        state.banners = banners;
        
    } catch (error) {
        console.error('Error loading banners:', error);
    }
}

// ============================================
// SETUP BANNER CAROUSEL
// ============================================

let currentBannerIndex = 0;
let bannerInterval;

function setupBannerCarousel() {
    const slides = document.getElementById('bannerSlides');
    const indicators = document.querySelectorAll('#bannerIndicators button');
    const prevBtn = document.getElementById('prevBanner');
    const nextBtn = document.getElementById('nextBanner');
    
    if (!slides || slides.children.length === 0) return;

    const totalSlides = slides.children.length;
    
    function goToSlide(index) {
        if (index < 0) index = totalSlides - 1;
        if (index >= totalSlides) index = 0;
        currentBannerIndex = index;
        
        slides.style.transform = `translateX(-${index * 100}%)`;
        
        indicators.forEach((indicator, i) => {
            indicator.className = `w-2 h-2 rounded-full transition ${i === index ? 'bg-white' : 'bg-white/50'}`;
        });
    }

    function nextSlide() {
        goToSlide(currentBannerIndex + 1);
    }

    function prevSlide() {
        goToSlide(currentBannerIndex - 1);
    }

    // Event listeners
    if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); resetInterval(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); resetInterval(); });
    
    indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
            goToSlide(index);
            resetInterval();
        });
    });

    // Auto slide
    function startInterval() {
        bannerInterval = setInterval(nextSlide, 5000);
    }

    function resetInterval() {
        clearInterval(bannerInterval);
        startInterval();
    }

    // Pause on hover
    const carousel = document.getElementById('bannerCarousel');
    carousel.addEventListener('mouseenter', () => clearInterval(bannerInterval));
    carousel.addEventListener('mouseleave', startInterval);

    startInterval();
}

// ============================================
// SETUP TABS
// ============================================

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active', 'border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400'));
            tab.classList.add('active', 'border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400');
            
            const tabName = tab.dataset.tab;
            loadProducts(tabName);
        });
    });
}

// ============================================
// PAGE: Product Detail
// ============================================

async function productDetailPage(params) {
    try {
        const productId = params.id;
        const response = await fetch(`/api/products/${productId}`);
        
        if (!response.ok) {
            throw new Error('Product not found');
        }
        
        const product = await response.json();
        
        // Add to recently viewed
        const recent = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        const filtered = recent.filter(id => id !== productId);
        filtered.unshift(productId);
        localStorage.setItem('recentlyViewed', JSON.stringify(filtered.slice(0, 10)));

        const html = `
            <div class="container mx-auto px-4 py-8">
                <!-- Breadcrumb -->
                <nav class="flex text-sm text-gray-500 dark:text-gray-400 mb-8">
                    <a href="/" class="hover:text-indigo-600 dark:hover:text-indigo-400">Beranda</a>
                    <span class="mx-2">/</span>
                    <a href="/category/${product.category?.toLowerCase().replace(' ', '-') || ''}" class="hover:text-indigo-600 dark:hover:text-indigo-400">${product.category || 'Produk'}</a>
                    <span class="mx-2">/</span>
                    <span class="text-gray-900 dark:text-gray-100">${product.name}</span>
                </nav>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <!-- Product Image -->
                    <div class="bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl p-12 flex items-center justify-center aspect-square">
                        <i class="fas fa-box text-8xl text-indigo-400 dark:text-indigo-500"></i>
                    </div>

                    <!-- Product Info -->
                    <div>
                        <div class="flex flex-wrap items-center gap-3 mb-4">
                            ${product.isTrending ? '<span class="badge badge-warning">🔥 Trending</span>' : ''}
                            ${product.isBestSeller ? '<span class="badge badge-success">⭐ Best Seller</span>' : ''}
                            ${product.isPremium ? '<span class="badge badge-info">💎 Premium</span>' : ''}
                            ${product.isNew ? '<span class="badge badge-success">🆕 Baru</span>' : ''}
                            ${product.type === 'premium-account' ? '<span class="badge badge-warning">🎯 Premium Account</span>' : ''}
                        </div>

                        <h1 class="text-3xl md:text-4xl font-bold mb-4">${product.name}</h1>
                        
                        <div class="flex items-center gap-4 mb-6">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                    <i class="fas fa-store text-indigo-600 dark:text-indigo-400"></i>
                                </div>
                                <div>
                                    <a href="/seller/${product.sellerId}" class="font-medium hover:text-indigo-600 dark:hover:text-indigo-400">
                                        ${product.seller?.storeName || 'Seller'}
                                    </a>
                                    ${product.seller?.verified ? '<i class="fas fa-check-circle text-blue-500 ml-1" title="Verified Seller"></i>' : ''}
                                </div>
                            </div>
                            <span class="text-gray-400">•</span>
                            <span class="text-gray-600 dark:text-gray-400">${product.sales || 0} terjual</span>
                            ${product.views ? `<span class="text-gray-400">•</span><span class="text-gray-600 dark:text-gray-400">${product.views} dilihat</span>` : ''}
                        </div>

                        <div class="mb-6">
                            <span class="text-4xl font-bold text-indigo-600 dark:text-indigo-400">
                                Rp${formatPrice(product.price)}
                            </span>
                            ${product.oldPrice ? `
                                <span class="text-lg text-gray-400 line-through ml-3">Rp${formatPrice(product.oldPrice)}</span>
                                <span class="badge badge-success ml-2">${Math.round((1 - product.price/product.oldPrice) * 100)}% OFF</span>
                            ` : ''}
                        </div>

                        <div class="prose dark:prose-invert max-w-none mb-8">
                            <p class="text-gray-600 dark:text-gray-300">${product.description || 'Tidak ada deskripsi'}</p>
                        </div>

                        ${product.type === 'premium-account' ? `
                            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6">
                                <div class="flex items-start gap-3">
                                    <i class="fas fa-shield-alt text-yellow-600 dark:text-yellow-400 text-xl mt-1"></i>
                                    <div>
                                        <h4 class="font-semibold">Premium Account</h4>
                                        <p class="text-sm text-gray-600 dark:text-gray-400">Stok tersedia: ${product.stock || 0} akun</p>
                                        ${product.note ? `<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">${product.note}</p>` : ''}
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <div class="flex items-center gap-4 mb-6">
                                <div class="flex items-center gap-2">
                                    <i class="fas fa-boxes text-gray-400"></i>
                                    <span class="text-sm text-gray-600 dark:text-gray-400">
                                        Stok: ${product.stock === 'unlimited' ? '♾️ Unlimited' : product.stock || 0}
                                    </span>
                                </div>
                                ${product.demoLink ? `
                                    <a href="${product.demoLink}" target="_blank" class="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                                        <i class="fas fa-external-link-alt mr-1"></i> Lihat Demo
                                    </a>
                                ` : ''}
                            </div>
                        `}

                        <button onclick="buyNow('${product.id}')" 
                                class="btn-primary w-full text-center text-lg py-4">
                            <i class="fas fa-shopping-cart mr-2"></i>
                            Beli Sekarang
                        </button>

                        <div class="flex gap-3 mt-3">
                            <button onclick="addToWishlist('${product.id}')" 
                                    class="flex-1 btn-secondary">
                                <i class="fas fa-heart mr-2"></i>
                                Wishlist
                            </button>
                            ${product.sellerId ? `
                                <a href="/seller/${product.sellerId}" class="flex-1 btn-secondary text-center">
                                    <i class="fas fa-store mr-2"></i>
                                    Toko
                                </a>
                            ` : ''}
                        </div>

                        ${product.tags && product.tags.length > 0 ? `
                            <div class="flex flex-wrap gap-2 mt-6">
                                ${product.tags.map(tag => `
                                    <span class="px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-sm">#${tag}</span>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Reviews -->
                <div class="mt-16">
                    <h3 class="text-2xl font-bold mb-6">Ulasan Pembeli</h3>
                    <div id="reviewsSection">
                        ${await renderReviews(productId)}
                    </div>
                </div>

                <!-- Related Products -->
                <div class="mt-16">
                    <h3 class="text-2xl font-bold mb-6">Produk Serupa</h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="relatedProducts">
                        ${await renderRelatedProducts(product.category, productId)}
                    </div>
                </div>
            </div>
        `;

        app.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading product:', error);
        app.innerHTML = `
            <div class="container mx-auto px-4 py-20 text-center">
                <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
                <h2 class="text-2xl font-bold">Produk Tidak Ditemukan</h2>
                <p class="text-gray-600 dark:text-gray-400">${error.message}</p>
                <button onclick="navigate('/')" class="btn-primary inline-block mt-6">
                    Kembali ke Beranda
                </button>
            </div>
        `;
    }
}

// ============================================
// RENDER REVIEWS
// ============================================

async function renderReviews(productId) {
    try {
        const response = await fetch(`/api/products/${productId}/reviews`);
        if (!response.ok) throw new Error('Failed to load reviews');
        
        const data = await response.json();
        const reviews = data.reviews || [];
        const stats = data.statistics || { averageRating: 0, totalReviews: 0 };

        if (reviews.length === 0) {
            return `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-comment-slash text-4xl mb-2"></i>
                    <p>Belum ada ulasan untuk produk ini</p>
                </div>
            `;
        }

        return `
            <div class="flex items-center gap-8 mb-8">
                <div class="text-center">
                    <div class="text-5xl font-bold text-indigo-600 dark:text-indigo-400">${stats.averageRating}</div>
                    <div class="flex gap-1 justify-center mt-2">
                        ${renderStars(Math.round(stats.averageRating))}
                    </div>
                    <div class="text-sm text-gray-500 mt-1">${stats.totalReviews} ulasan</div>
                </div>
                <div class="flex-1">
                    ${[5,4,3,2,1].map(rating => {
                        const count = stats.ratingCounts?.[rating] || 0;
                        const percentage = stats.totalReviews > 0 ? (count / stats.totalReviews * 100) : 0;
                        return `
                            <div class="flex items-center gap-2 text-sm">
                                <span>${rating} ★</span>
                                <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div class="h-full bg-yellow-400 rounded-full" style="width: ${percentage}%"></div>
                                </div>
                                <span class="text-gray-500">${count}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="space-y-4">
                ${reviews.map(review => `
                    <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                        <div class="flex items-center justify-between mb-2">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                    <span class="font-bold text-indigo-600 dark:text-indigo-400">
                                        ${review.buyerName?.[0]?.toUpperCase() || '?'}
                                    </span>
                                </div>
                                <div>
                                    <div class="font-medium">${review.buyerName || 'Anonymous'}</div>
                                    <div class="flex gap-1">
                                        ${renderStars(review.rating)}
                                    </div>
                                </div>
                            </div>
                            <span class="text-sm text-gray-500">
                                ${formatDate(review.createdAt)}
                            </span>
                        </div>
                        ${review.comment ? `<p class="text-gray-600 dark:text-gray-300">${review.comment}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('Error loading reviews:', error);
        return '<p class="text-red-500">Gagal memuat ulasan</p>';
    }
}

function renderStars(rating) {
    return Array.from({ length: 5 }, (_, i) => 
        `<i class="fas fa-star ${i < rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}"></i>`
    ).join('');
}

// ============================================
// RENDER RELATED PRODUCTS
// ============================================

async function renderRelatedProducts(category, excludeId) {
    try {
        const response = await fetch(`/api/products?category=${category}&limit=4`);
        if (!response.ok) throw new Error('Failed to load related products');
        
        const data = await response.json();
        const products = (data.products || []).filter(p => p.id !== excludeId);

        if (products.length === 0) {
            return '<div class="col-span-full text-center text-gray-500">Tidak ada produk serupa</div>';
        }

        return products.map(product => `
            <div class="card-premium p-4 cursor-pointer" onclick="navigate('/product/${product.id}')">
                <div class="relative">
                    <div class="aspect-square bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-xl flex items-center justify-center text-4xl">
                        <i class="fas fa-box"></i>
                    </div>
                    ${product.isPremium ? '<span class="absolute top-2 right-2 badge badge-info text-xs">Premium</span>' : ''}
                </div>
                <div class="mt-4">
                    <h3 class="font-semibold text-lg line-clamp-1">${product.name}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400">${product.category}</p>
                    <div class="flex items-center justify-between mt-2">
                        <span class="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                            Rp${formatPrice(product.price)}
                        </span>
                        <span class="text-sm text-gray-500">${product.sales || 0} terjual</span>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading related products:', error);
        return '<div class="col-span-full text-center text-red-500">Gagal memuat produk serupa</div>';
    }
}

// ============================================
// PAGE: Check Order
// ============================================

async function checkOrderPage() {
    const html = `
        <div class="container mx-auto px-4 py-12 max-w-2xl">
            <h1 class="text-3xl font-bold text-center mb-8">Cek Status Order</h1>
            <div class="card-premium p-8">
                <form id="checkOrderForm" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">Order ID</label>
                        <input type="text" id="orderIdInput" class="input-premium" 
                               placeholder="Contoh: PK-20260714-AB91CD" required>
                        <p class="text-sm text-gray-500 mt-1">Masukkan Order ID yang Anda terima setelah pembayaran</p>
                    </div>
                    <button type="submit" class="btn-primary w-full py-3">
                        <i class="fas fa-search mr-2"></i>
                        Cek Order
                    </button>
                </form>
                
                <div id="orderResult" class="mt-6 hidden">
                    <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
                        <div id="orderDetail"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    app.innerHTML = html;

    document.getElementById('checkOrderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const orderId = document.getElementById('orderIdInput').value.trim();
        
        if (!orderId) {
            showToast('warning', 'Masukkan Order ID');
            return;
        }

        try {
            const response = await fetch(`/api/orders/${orderId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Order tidak ditemukan');
            }

            displayOrderResult(data);

        } catch (error) {
            showToast('error', error.message);
            document.getElementById('orderResult').classList.add('hidden');
        }
    });
}

function displayOrderResult(order) {
    const resultDiv = document.getElementById('orderResult');
    const detailDiv = document.getElementById('orderDetail');
    
    const statusColors = {
        'paid': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        'settlement': 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        'pending': 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
        'failed': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
        'expire': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    };

    const statusClass = statusColors[order.paymentStatus] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';

    detailDiv.innerHTML = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <p class="text-sm text-gray-500">Order ID</p>
                    <p class="font-semibold">${order.orderId}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Status</p>
                    <span class="badge ${statusClass}">${order.paymentStatus || order.status}</span>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Produk</p>
                    <p class="font-medium">${order.productName || 'Product'}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Pembeli</p>
                    <p class="font-medium">${order.buyerName}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Email</p>
                    <p>${order.buyerEmail}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Harga</p>
                    <p class="font-bold text-indigo-600 dark:text-indigo-400">Rp${formatPrice(order.amount || order.price)}</p>
                </div>
                <div>
                    <p class="text-sm text-gray-500">Tanggal</p>
                    <p>${formatDate(order.createdAt)}</p>
                </div>
            </div>

            ${order.paymentStatus === 'settlement' || order.paymentStatus === 'paid' ? `
                <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mt-4">
                    <div class="flex items-start gap-3">
                        <i class="fas fa-check-circle text-green-600 dark:text-green-400 text-xl mt-1"></i>
                        <div>
                            <h4 class="font-semibold text-green-700 dark:text-green-400">Pembayaran Berhasil!</h4>
                            <p class="text-sm text-green-600 dark:text-green-300">Silakan akses produk Anda di bawah ini:</p>
                        </div>
                    </div>
                </div>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                    <h4 class="font-semibold mb-3">Akses Produk</h4>
                    <div id="productAccess">
                        <!-- Will be loaded from product data -->
                        ${await renderProductAccess(order.productId)}
                    </div>
                </div>
            ` : `
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mt-4">
                    <div class="flex items-start gap-3">
                        <i class="fas fa-clock text-yellow-600 dark:text-yellow-400 text-xl mt-1"></i>
                        <div>
                            <h4 class="font-semibold text-yellow-700 dark:text-yellow-400">Menunggu Pembayaran</h4>
                            <p class="text-sm text-yellow-600 dark:text-yellow-300">Silakan selesaikan pembayaran Anda untuk mengakses produk.</p>
                        </div>
                    </div>
                </div>
            `}
        </div>
    `;

    resultDiv.classList.remove('hidden');
}

async function renderProductAccess(productId) {
    try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) throw new Error('Product not found');
        
        const product = await response.json();

        if (product.type === 'premium-account') {
            // For premium account, show credentials
            const accounts = product.premiumAccounts || [];
            if (accounts.length > 0) {
                const account = accounts[0];
                return `
                    <div class="space-y-3">
                        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-medium">Email</p>
                                    <p class="font-mono text-sm">${account.email}</p>
                                </div>
                                <button onclick="copyText('${account.email}')" class="btn-secondary text-sm">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <div class="flex items-center justify-between mt-2">
                                <div>
                                    <p class="text-sm font-medium">Password</p>
                                    <p class="font-mono text-sm">${account.password}</p>
                                </div>
                                <button onclick="copyText('${account.password}')" class="btn-secondary text-sm">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            ${product.note ? `
                                <div class="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                    <p class="text-sm text-yellow-700 dark:text-yellow-300">
                                        <i class="fas fa-info-circle mr-2"></i>
                                        ${product.note}
                                    </p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
            return '<p class="text-gray-500">Tidak ada akun tersedia</p>';
        } else {
            // Digital product - show download link
            return `
                <div class="space-y-3">
                    <a href="${product.downloadLink}" target="_blank" 
                       class="btn-primary inline-flex items-center w-full justify-center">
                        <i class="fas fa-download mr-2"></i>
                        Download Produk
                    </a>
                    <button onclick="copyText('${product.downloadLink}')" 
                            class="btn-secondary w-full">
                        <i class="fas fa-copy mr-2"></i>
                        Salin Link
                    </button>
                    <button onclick="window.open('${product.downloadLink}', '_blank')" 
                            class="btn-secondary w-full">
                        <i class="fas fa-external-link-alt mr-2"></i>
                        Buka Link
                    </button>
                    ${product.demoLink ? `
                        <a href="${product.demoLink}" target="_blank" 
                           class="btn-secondary w-full text-center block">
                            <i class="fas fa-play mr-2"></i>
                            Lihat Demo
                        </a>
                    ` : ''}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading product access:', error);
        return '<p class="text-red-500">Gagal memuat akses produk</p>';
    }
}

// ============================================
// BUY NOW FUNCTION
// ============================================

window.buyNow = async function(productId) {
    // Check if product is in stock
    try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) throw new Error('Product not found');
        
        const product = await response.json();
        
        if (product.stock === 0) {
            showToast('error', 'Maaf, produk ini sedang habis');
            return;
        }
        
        showCheckoutModal(productId);
        
    } catch (error) {
        console.error('Error:', error);
        showToast('error', 'Gagal memulai pembayaran');
    }
};

// ============================================
// CHECKOUT MODAL
// ============================================

function showCheckoutModal(productId) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm fade-in';
    modal.id = 'checkoutModal';
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 slide-in">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-xl font-bold">Detail Pembeli</h3>
                <button onclick="closeCheckoutModal()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <form id="checkoutForm" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1">Nama Lengkap *</label>
                    <input type="text" id="buyerName" required class="input-premium" placeholder="Masukkan nama Anda">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Email *</label>
                    <input type="email" id="buyerEmail" required class="input-premium" placeholder="Masukkan email Anda">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-1">Nomor HP (Opsional)</label>
                    <input type="tel" id="buyerPhone" class="input-premium" placeholder="Masukkan nomor HP">
                </div>
                
                <button type="submit" class="btn-primary w-full py-3">
                    <i class="fas fa-credit-card mr-2"></i>
                    Bayar Sekarang
                </button>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await processPayment(productId);
    });
}

window.closeCheckoutModal = function() {
    const modal = document.getElementById('checkoutModal');
    if (modal) modal.remove();
};

// ============================================
// PROCESS PAYMENT
// ============================================

async function processPayment(productId) {
    const name = document.getElementById('buyerName').value.trim();
    const email = document.getElementById('buyerEmail').value.trim();
    const phone = document.getElementById('buyerPhone').value.trim();
    
    if (!name || !email) {
        showToast('warning', 'Nama dan email wajib diisi');
        return;
    }
    
    // Validate email
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showToast('warning', 'Format email tidak valid');
        return;
    }
    
    try {
        // Get product details
        const productResponse = await fetch(`/api/products/${productId}`);
        if (!productResponse.ok) throw new Error('Product not found');
        const product = await productResponse.json();
        
        // Check stock
        if (product.stock === 0) {
            showToast('error', 'Maaf, produk ini sedang habis');
            return;
        }
        
        // Create order
        const orderResponse = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                productId,
                buyerName: name,
                buyerEmail: email,
                buyerPhone: phone,
                sellerId: product.sellerId || '',
                amount: product.price
            })
        });
        
        if (!orderResponse.ok) throw new Error('Failed to create order');
        const order = await orderResponse.json();
        
        // Create payment
        const paymentResponse = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: order.orderId,
                amount: product.price,
                buyerName: name,
                buyerEmail: email,
                buyerPhone: phone || '08123456789',
                productName: product.name
            })
        });
        
        if (!paymentResponse.ok) throw new Error('Failed to create payment');
        const payment = await paymentResponse.json();
        
        if (payment.token) {
            // Open Midtrans Snap
            window.snap.pay(payment.token, {
                onSuccess: async (result) => {
                    await updateOrderStatus(order.id, 'settlement', result);
                    showToast('success', 'Pembayaran berhasil! 🎉');
                    closeCheckoutModal();
                    navigate(`/order/${order.id}`);
                },
                onPending: async (result) => {
                    await updateOrderStatus(order.id, 'pending', result);
                    showToast('info', 'Menunggu pembayaran...');
                    closeCheckoutModal();
                    navigate(`/order/${order.id}`);
                },
                onError: async (result) => {
                    await updateOrderStatus(order.id, 'failed', result);
                    showToast('error', 'Pembayaran gagal, silakan coba lagi');
                },
                onClose: () => {
                    showToast('info', 'Pembayaran dibatalkan');
                }
            });
        }
        
    } catch (error) {
        console.error('Payment error:', error);
        showToast('error', error.message || 'Gagal memproses pembayaran');
    }
}

async function updateOrderStatus(orderId, status, result) {
    try {
        await fetch(`/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                status: status === 'settlement' ? 'paid' : status,
                paymentStatus: status,
                midtransResult: result
            })
        });
    } catch (error) {
        console.error('Error updating order:', error);
    }
}

// ============================================
// PAGE: Not Found
// ============================================

async function notFoundPage() {
    return `
        <div class="container mx-auto px-4 py-20 text-center">
            <i class="fas fa-exclamation-circle text-6xl text-gray-400 mb-4"></i>
            <h2 class="text-2xl font-bold mb-2">Halaman Tidak Ditemukan</h2>
            <p class="text-gray-600 dark:text-gray-400">Maaf, halaman yang Anda cari tidak tersedia.</p>
            <button onclick="navigate('/')" class="btn-primary inline-block mt-6">
                Kembali ke Beranda
            </button>
        </div>
    `;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatPrice(price) {
    return new Intl.NumberFormat('id-ID').format(price || 0);
}

function formatDate(date) {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(type, message) {
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    toast.className = `fixed bottom-4 right-4 z-50 px-6 py-3 rounded-xl text-white font-medium fade-in shadow-lg ${colors[type] || colors.info}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

window.showToast = showToast;

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('success', 'Berhasil disalin!');
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        showToast('success', 'Berhasil disalin!');
    });
}

window.copyText = copyText;

function addToWishlist(productId) {
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    if (wishlist.includes(productId)) {
        wishlist = wishlist.filter(id => id !== productId);
        showToast('info', 'Dihapus dari wishlist');
    } else {
        wishlist.push(productId);
        showToast('success', 'Ditambahkan ke wishlist');
    }
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
}

window.addToWishlist = addToWishlist;

// ============================================
// DARK MODE
// ============================================

if (state.darkMode) {
    document.documentElement.classList.add('dark');
}

themeToggle?.addEventListener('click', () => {
    state.darkMode = !state.darkMode;
    document.documentElement.classList.toggle('dark', state.darkMode);
    localStorage.setItem('darkMode', state.darkMode);
    
    const icon = themeToggle.querySelector('i');
    if (state.darkMode) {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-moon';
    }
});

// ============================================
// AUTH STATE
// ============================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        state.user = user;
        // Load user data from Firestore
        loadUserData(user.uid);
    } else {
        state.user = null;
    }
});

async function loadUserData(uid) {
    try {
        const userRef = doc(db, collections.users, uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
            state.userData = userDoc.data();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// ============================================
// SEARCH
// ============================================

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
        const query = e.target.value.trim();
        if (query.length > 2) {
            navigate(`/search?q=${encodeURIComponent(query)}`);
        }
    }, 500));
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Handle initial route
    const path = window.location.pathname;
    renderPage(path || '/');
});

// Handle popstate
window.addEventListener('popstate', () => {
    renderPage(window.location.pathname);
});

// Make functions globally available
window.formatPrice = formatPrice;
window.formatDate = formatDate;

console.log('🚀 ProductKuu v1.0 loaded successfully!');