import React, { createContext, useContext, useState, useEffect } from 'react'
import { auth, db } from '../firebase/config'
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut 
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'

const AuthContext = createContext()

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))
          const userData = userDoc.exists() ? userDoc.data() : null
          
          setUser({
            ...firebaseUser,
            ...userData
          })
          setUserRole(userData?.role || 'seller')
        } catch (error) {
          console.error('Error fetching user data:', error)
          setUser(null)
          setUserRole(null)
        }
      } else {
        setUser(null)
        setUserRole(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email, password) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password)
      const userDoc = await getDoc(doc(db, 'users', result.user.uid))
      
      if (!userDoc.exists()) {
        throw new Error('User data not found')
      }
      
      const userData = userDoc.data()
      if (userData.role === 'buyer') {
        throw new Error('Buyer accounts cannot login')
      }
      
      toast.success('Login successful')
      return result
    } catch (error) {
      toast.error(error.message)
      throw error
    }
  }

  const register = async (email, password, userData) => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password)
      
      await setDoc(doc(db, 'users', result.user.uid), {
        ...userData,
        email,
        role: 'seller',
        createdAt: new Date().toISOString(),
        verified: false,
        suspended: false,
        level: 'Bronze',
        totalSales: 0,
        totalProducts: 0,
        emailNotifications: true,
        pushNotifications: true,
        orderNotifications: true,
        marketingNotifications: false
      })
      
      toast.success('Registration successful')
      return result
    } catch (error) {
      toast.error(error.message)
      throw error
    }
  }

  const logout = async () => {
    try {
      await signOut(auth)
      toast.success('Logged out')
    } catch (error) {
      toast.error(error.message)
    }
  }

  const value = {
    user,
    userRole,
    loading,
    login,
    register,
    logout,
    isAdmin: userRole === 'admin',
    isSeller: userRole === 'seller'
  }

  return React.createElement(
    AuthContext.Provider,
    { value },
    children
  )
}