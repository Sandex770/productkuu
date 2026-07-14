import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Search, 
  ShoppingCart, 
  Sun, 
  Moon, 
  Menu, 
  X,
  User,
  LogOut,
  LayoutDashboard,
  Package,
  Wallet,
  Settings,
  ChevronDown
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const { theme, toggleTheme } = useTheme()
  const { user, userRole, logout } = useAuth()
  const { cartCount } = useCart()
  const navigate = useNavigate()

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/?search=${searchQuery}`)
    }
  }

  const getDashboardLink = () => {
    if (userRole === 'admin') return '/admin/dashboard'
    if (userRole === 'seller') return '/seller/dashboard'
    return '/'
  }

  return React.createElement(
    'nav',
    { className: "sticky top-0 z-50 glass-effect border-b border-gray-200/20 dark:border-gray-700/20" },
    React.createElement(
      'div',
      { className: "container-custom" },
      React.createElement(
        'div',
        { className: "flex items-center justify-between h-16" },
        // Logo
        React.createElement(
          Link,
          { to: "/", className: "flex items-center space-x-2" },
          React.createElement(
            motion.div,
            {
              whileHover: { scale: 1.05 },
              className: "w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl flex items-center justify-center"
            },
            React.createElement('span', { className: "text-white font-bold text-lg" }, "P")
          ),
          React.createElement('span', { className: "text-xl font-bold bg-gradient-to-r from-primary-500 to-primary-600 bg-clip-text text-transparent" }, "ProductKuu")
        ),

        // Search - Desktop
        React.createElement(
          'form',
          { onSubmit: handleSearch, className: "hidden md:flex flex-1 max-w-xl mx-8" },
          React.createElement(
            'div',
            { className: "relative w-full" },
            React.createElement('input', {
              type: "text",
              placeholder: "Cari produk...",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              className: "w-full px-4 py-2 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            }),
            React.createElement(Search, { className: "absolute left-3 top-2.5 w-4 h-4 text-gray-400" })
          )
        ),

        // Right Section
        React.createElement(
          'div',
          { className: "flex items-center space-x-4" },
          // Cart
          React.createElement(
            Link,
            { to: "/cart", className: "relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" },
            React.createElement(ShoppingCart, { className: "w-5 h-5" }),
            cartCount > 0 && React.createElement(
              'span',
              { className: "absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center" },
              cartCount
            )
          ),

          // Dark Mode Toggle
          React.createElement('button', {
            onClick: toggleTheme,
            className: "p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          },
            theme === 'dark' ? React.createElement(Sun, { className: "w-5 h-5" }) : React.createElement(Moon, { className: "w-5 h-5" })
          ),

          // User Menu
          user ? React.createElement(
            'div',
            { className: "relative" },
            React.createElement('button', {
              onClick: () => setShowProfileMenu(!showProfileMenu),
              className: "flex items-center space-x-2 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            },
              React.createElement(
                'div',
                { className: "w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold" },
                user.displayName?.[0] || user.email?.[0] || 'U'
              ),
              React.createElement(ChevronDown, { className: "w-4 h-4" })
            ),
            showProfileMenu && React.createElement(
              motion.div,
              {
                initial: { opacity: 0, y: -10 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: -10 },
                className: "absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-soft-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              },
              React.createElement(
                'div',
                { className: "p-3 border-b border-gray-200 dark:border-gray-700" },
                React.createElement('p', { className: "font-medium" }, user.displayName || 'User'),
                React.createElement('p', { className: "text-sm text-gray-500" }, user.email)
              ),
              React.createElement(
                'div',
                { className: "p-2" },
                React.createElement(Link, {
                  to: getDashboardLink(),
                  className: "flex items-center space-x-2 w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                  onClick: () => setShowProfileMenu(false)
                },
                  React.createElement(LayoutDashboard, { className: "w-4 h-4" }),
                  React.createElement('span', null, "Dashboard")
                ),
                userRole === 'seller' && React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(Link, {
                    to: "/seller/products",
                    className: "flex items-center space-x-2 w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                    onClick: () => setShowProfileMenu(false)
                  },
                    React.createElement(Package, { className: "w-4 h-4" }),
                    React.createElement('span', null, "Produk")
                  ),
                  React.createElement(Link, {
                    to: "/seller/wallet",
                    className: "flex items-center space-x-2 w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                    onClick: () => setShowProfileMenu(false)
                  },
                    React.createElement(Wallet, { className: "w-4 h-4" }),
                    React.createElement('span', null, "Wallet")
                  ),
                  React.createElement(Link, {
                    to: "/seller/settings",
                    className: "flex items-center space-x-2 w-full p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
                    onClick: () => setShowProfileMenu(false)
                  },
                    React.createElement(Settings, { className: "w-4 h-4" }),
                    React.createElement('span', null, "Pengaturan")
                  )
                )
              ),
              React.createElement(
                'div',
                { className: "p-2 border-t border-gray-200 dark:border-gray-700" },
                React.createElement('button', {
                  onClick: () => {
                    logout()
                    setShowProfileMenu(false)
                  },
                  className: "flex items-center space-x-2 w-full p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors"
                },
                  React.createElement(LogOut, { className: "w-4 h-4" }),
                  React.createElement('span', null, "Logout")
                )
              )
            )
          ) : React.createElement(Link, { to: "/login", className: "btn-primary" }, "Login"),

          // Mobile Menu Button
          React.createElement('button', {
            onClick: () => setIsOpen(!isOpen),
            className: "md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          },
            isOpen ? React.createElement(X, { className: "w-6 h-6" }) : React.createElement(Menu, { className: "w-6 h-6" })
          )
        )
      ),

      // Mobile Search
      isOpen && React.createElement(
        motion.div,
        {
          initial: { height: 0, opacity: 0 },
          animate: { height: 'auto', opacity: 1 },
          exit: { height: 0, opacity: 0 },
          className: "md:hidden overflow-hidden"
        },
        React.createElement(
          'form',
          { onSubmit: handleSearch, className: "py-4" },
          React.createElement(
            'div',
            { className: "relative" },
            React.createElement('input', {
              type: "text",
              placeholder: "Cari produk...",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              className: "w-full px-4 py-3 pl-10 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            }),
            React.createElement(Search, { className: "absolute left-3 top-3.5 w-4 h-4 text-gray-400" })
          )
        ),
        React.createElement(
          'div',
          { className: "py-2 border-t border-gray-200 dark:border-gray-700" },
          React.createElement(Link, {
            to: "/categories",
            className: "block py-2 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
            onClick: () => setIsOpen(false)
          }, "Kategori"),
          React.createElement(Link, {
            to: "/seller/dashboard",
            className: "block py-2 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
            onClick: () => setIsOpen(false)
          }, "Dashboard Seller")
        )
      )
    )
  )
}

export default Navbar