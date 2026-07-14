// Midtrans service for frontend
const API_BASE = import.meta.env.VITE_API_URL || '';

export const createTransaction = async (data) => {
  try {
    const response = await fetch(`${API_BASE}/api/create-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to create transaction');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
};

export const checkTransaction = async (orderId) => {
  try {
    const response = await fetch(`${API_BASE}/api/check-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order_id: orderId })
    });

    if (!response.ok) {
      throw new Error('Failed to check transaction');
    }

    return await response.json();
  } catch (error) {
    console.error('Error checking transaction:', error);
    throw error;
  }
};

export const payWithMidtrans = (token, callbacks) => {
  if (typeof window.snap === 'undefined') {
    console.error('Midtrans Snap is not loaded');
    return;
  }

  window.snap.pay(token, {
    onSuccess: function(result) {
      if (callbacks.onSuccess) callbacks.onSuccess(result);
    },
    onPending: function(result) {
      if (callbacks.onPending) callbacks.onPending(result);
    },
    onError: function(result) {
      if (callbacks.onError) callbacks.onError(result);
    },
    onClose: function() {
      if (callbacks.onClose) callbacks.onClose();
    }
  });
};

export const loadMidtransScript = () => {
  return new Promise((resolve, reject) => {
    if (typeof window.snap !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://app.sandbox.midtrans.com/snap/snap.js`;
    script.setAttribute('data-client-key', import.meta.env.VITE_MIDTRANS_CLIENT_KEY);
    script.async = true;
    
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Midtrans script'));
    
    document.body.appendChild(script);
  });
};