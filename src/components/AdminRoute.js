import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingScreen from './LoadingScreen'

const AdminRoute = () => {
  const { user, userRole, loading } = useAuth()

  if (loading) {
    return React.createElement(LoadingScreen, null)
  }

  if (!user || userRole !== 'admin') {
    return React.createElement(Navigate, { to: "/", replace: true })
  }

  return React.createElement(Outlet, null)
}

export default AdminRoute