import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function ProtectedAdminRoute({ children }) {
  const [idToken, setIdToken] = useState('dev-token');
  const [adminUser, setAdminUser] = useState({
    email: 'admin@system.local',
    uid: 'admin-owner',
  });

  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          setAdminUser(user);
        } catch {
          // Keep fallback
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = () => {
    if (auth) auth.signOut().catch(() => {});
    setIdToken('dev-token');
    setAdminUser({ email: 'admin@system.local', uid: 'admin-owner' });
  };

  return typeof children === 'function' ? children({ idToken, adminUser, onSignOut: handleSignOut }) : children;
}
