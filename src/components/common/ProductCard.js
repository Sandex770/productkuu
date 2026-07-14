import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Heart, Eye, Star, ShoppingCart } from 'lucide-react'

const ProductCard = ({ product }) => {
  const { id, name, price, images, category, seller, rating, sold, views, badge } = product

  const getBadgeColor = (type) => {
    const colors = {
      trending: 'bg-orange-500',
      'best-seller': 'bg-yellow-500',
      premium: 'bg-purple-500',
      baru: 'bg-green-500',
      dipromosikan: 'bg-blue-500'
    }
    return colors[type] || 'bg-gray-500'
  }

  return React.createElement(
    motion.div,
    {
      whileHover: { y: -4 },
      className: "group bg-white dark:bg-gray-800 rounded-2xl shadow-soft hover:shadow-soft-lg transition-all duration-300 overflow-hidden"
    },
    React.createElement(
      Link,
      { to: `/product/${id}` },
      // Image
      React.createElement(
        'div',
        { className: "relative aspect-square overflow-hidden bg-gray-100 dark:bg-gray-700" },
        React.createElement('img', {
          src: images?.[0] || '/placeholder-product.jpg',
          alt: name,
          className: "w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        }),
        
        // Badge
        badge && React.createElement(
          'span',
          { className: `absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-medium text-white ${getBadgeColor(badge)}` },
          badge
        ),

        // Quick Actions
        React.createElement(
          'div',
          { className: "absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300" },
          React.createElement('button', { className: "p-2 bg-white dark:bg-gray-800 rounded-full shadow-soft hover:shadow-md transition-shadow" },
            React.createElement(Heart, { className: "w-4 h-4" })
          ),
          React.createElement('button', { className: "p-2 bg-white dark:bg-gray-800 rounded-full shadow-soft hover:shadow-md transition-shadow" },
            React.createElement(ShoppingCart, { className: "w-4 h-4" })
          )
        )
      ),

      // Content
      React.createElement(
        'div',
        { className: "p-4" },
        React.createElement(
          'div',
          { className: "flex items-start justify-between mb-1" },
          React.createElement('h3', { className: "font-medium text-sm line-clamp-2 flex-1" }, name)
        ),
        React.createElement('p', { className: "text-xs text-gray-500 dark:text-gray-400 mb-2" },
          category, " • ", seller?.storeName || 'Seller'
        ),
        React.createElement(
          'div',
          { className: "flex items-center justify-between" },
          React.createElement('span', { className: "font-bold text-primary-500" }, 
            'Rp ', price?.toLocaleString('id-ID')
          ),
          React.createElement(
            'div',
            { className: "flex items-center gap-3 text-xs text-gray-500" },
            rating > 0 && React.createElement(
              'span',
              { className: "flex items-center gap-1" },
              React.createElement(Star, { className: "w-3 h-3 fill-yellow-400 text-yellow-400" }),
              rating
            ),
            React.createElement(
              'span',
              { className: "flex items-center gap-1" },
              React.createElement(Eye, { className: "w-3 h-3" }),
              views || 0
            )
          )
        )
      )
    )
  )
}

export default ProductCard