import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react'

const BannerCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const intervalRef = useRef(null)

  const banners = [
    {
      id: 1,
      title: 'Promo Spesial!',
      description: 'Dapatkan diskon hingga 50% untuk produk digital pilihan',
      image: '/banner-1.jpg',
      color: 'from-primary-500 to-primary-600'
    },
    {
      id: 2,
      title: 'Source Code Premium',
      description: 'Koleksi source code berkualitas untuk project Anda',
      image: '/banner-2.jpg',
      color: 'from-purple-500 to-pink-500'
    },
    {
      id: 3,
      title: 'Template Modern',
      description: 'Template website terbaru dengan desain terkini',
      image: '/banner-3.jpg',
      color: 'from-blue-500 to-cyan-500'
    }
  ]

  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length)
      }, 5000)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPaused, banners.length])

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % banners.length)
  }

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)
  }

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchMove = (e) => {
    setTouchEnd(e.touches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    if (isLeftSwipe) {
      goToNext()
    } else if (isRightSwipe) {
      goToPrevious()
    }

    setTouchStart(null)
    setTouchEnd(null)
  }

  return React.createElement(
    'div', 
    {
      className: "relative rounded-2xl overflow-hidden shadow-soft-lg",
      onMouseEnter: () => setIsPaused(true),
      onMouseLeave: () => setIsPaused(false),
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    },
    React.createElement(
      'div',
      { className: "relative aspect-[21/9] min-h-[200px] md:min-h-[300px] lg:min-h-[400px]" },
      React.createElement(
        AnimatePresence,
        { mode: "wait" },
        React.createElement(
          motion.div,
          {
            key: currentIndex,
            initial: { opacity: 0, x: 100 },
            animate: { opacity: 1, x: 0 },
            exit: { opacity: 0, x: -100 },
            transition: { duration: 0.5 },
            className: `absolute inset-0 bg-gradient-to-r ${banners[currentIndex].color}`
          },
          React.createElement('div', { className: "absolute inset-0 bg-black/20" }),
          React.createElement(
            'div',
            { className: "relative h-full flex items-center justify-center text-center text-white p-8" },
            React.createElement(
              'div',
              null,
              React.createElement('h2', { className: "text-2xl md:text-4xl lg:text-5xl font-bold mb-4" },
                banners[currentIndex].title
              ),
              React.createElement('p', { className: "text-sm md:text-lg text-white/90 max-w-2xl mx-auto" },
                banners[currentIndex].description
              ),
              React.createElement('button', { className: "mt-6 px-6 py-2.5 bg-white text-gray-900 rounded-xl font-medium hover:shadow-lg transition-all hover:scale-105" },
                "Lihat Produk"
              )
            )
          )
        )
      )
    ),

    // Navigation Buttons
    React.createElement('button', {
      onClick: goToPrevious,
      className: "absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all hover:scale-110"
    },
      React.createElement(ChevronLeft, { className: "w-5 h-5" })
    ),
    React.createElement('button', {
      onClick: goToNext,
      className: "absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-all hover:scale-110"
    },
      React.createElement(ChevronRight, { className: "w-5 h-5" })
    ),

    // Indicators
    React.createElement(
      'div',
      { className: "absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2" },
      banners.map((_, index) =>
        React.createElement('button', {
          key: index,
          onClick: () => setCurrentIndex(index),
          className: `transition-all duration-300 ${
            index === currentIndex
              ? 'w-8 h-2 bg-white'
              : 'w-2 h-2 bg-white/50 hover:bg-white/70'
          } rounded-full`
        })
      ),
      React.createElement('button', {
        onClick: () => setIsPaused(!isPaused),
        className: "ml-2 p-1 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
      },
        isPaused ? 
          React.createElement(Play, { className: "w-3 h-3 text-white" }) :
          React.createElement(Pause, { className: "w-3 h-3 text-white" })
      )
    )
  )
}

export default BannerCarousel