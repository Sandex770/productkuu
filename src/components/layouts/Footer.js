import React from 'react'
import { Link } from 'react-router-dom'
import { Facebook, Twitter, Instagram, Youtube, Mail, Phone } from 'lucide-react'

const Footer = () => {
  return React.createElement(
    'footer',
    { className: "bg-gray-900 dark:bg-gray-950 text-white py-12" },
    React.createElement(
      'div',
      { className: "container-custom" },
      React.createElement(
        'div',
        { className: "grid grid-cols-1 md:grid-cols-4 gap-8" },
        // Brand
        React.createElement(
          'div',
          null,
          React.createElement('h3', { className: "text-xl font-bold mb-4" }, "ProductKuu"),
          React.createElement('p', { className: "text-gray-400 text-sm" },
            "Platform jual beli produk digital terbaik di Indonesia"
          ),
          React.createElement(
            'div',
            { className: "flex gap-3 mt-4" },
            React.createElement('a', { href: "#", className: "text-gray-400 hover:text-white transition-colors" },
              React.createElement(Facebook, { className: "w-5 h-5" })
            ),
            React.createElement('a', { href: "#", className: "text-gray-400 hover:text-white transition-colors" },
              React.createElement(Twitter, { className: "w-5 h-5" })
            ),
            React.createElement('a', { href: "#", className: "text-gray-400 hover:text-white transition-colors" },
              React.createElement(Instagram, { className: "w-5 h-5" })
            ),
            React.createElement('a', { href: "#", className: "text-gray-400 hover:text-white transition-colors" },
              React.createElement(Youtube, { className: "w-5 h-5" })
            )
          )
        ),
        
        // Quick Links
        React.createElement(
          'div',
          null,
          React.createElement('h4', { className: "font-semibold mb-4" }, "Tautan Cepat"),
          React.createElement('ul', { className: "space-y-2 text-sm text-gray-400" },
            React.createElement('li', null, React.createElement(Link, { to: "/", className: "hover:text-white transition-colors" }, "Beranda")),
            React.createElement('li', null, React.createElement(Link, { to: "/products", className: "hover:text-white transition-colors" }, "Produk")),
            React.createElement('li', null, React.createElement(Link, { to: "/categories", className: "hover:text-white transition-colors" }, "Kategori")),
            React.createElement('li', null, React.createElement(Link, { to: "/seller/register", className: "hover:text-white transition-colors" }, "Jadi Seller"))
          )
        ),
        
        // Support
        React.createElement(
          'div',
          null,
          React.createElement('h4', { className: "font-semibold mb-4" }, "Bantuan"),
          React.createElement('ul', { className: "space-y-2 text-sm text-gray-400" },
            React.createElement('li', null, React.createElement(Link, { to: "/cek-order", className: "hover:text-white transition-colors" }, "Cek Order")),
            React.createElement('li', null, React.createElement(Link, { to: "/faq", className: "hover:text-white transition-colors" }, "FAQ")),
            React.createElement('li', null, React.createElement(Link, { to: "/kontak", className: "hover:text-white transition-colors" }, "Kontak")),
            React.createElement('li', null, React.createElement(Link, { to: "/kebijakan", className: "hover:text-white transition-colors" }, "Kebijakan"))
          )
        ),
        
        // Contact
        React.createElement(
          'div',
          null,
          React.createElement('h4', { className: "font-semibold mb-4" }, "Hubungi Kami"),
          React.createElement('ul', { className: "space-y-2 text-sm text-gray-400" },
            React.createElement('li', { className: "flex items-center gap-2" },
              React.createElement(Mail, { className: "w-4 h-4" }),
              "support@productkuu.com"
            ),
            React.createElement('li', { className: "flex items-center gap-2" },
              React.createElement(Phone, { className: "w-4 h-4" }),
              "+62 812-3456-7890"
            )
          )
        )
      ),
      
      // Bottom
      React.createElement(
        'div',
        { className: "border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400" },
        "© 2024 ProductKuu. All rights reserved."
      )
    )
  )
}

export default Footer