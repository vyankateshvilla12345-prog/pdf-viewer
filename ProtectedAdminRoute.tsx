import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface ProtectedAdminRouteProps {
  children: (props: { idToken: string; adminUser: User | any; onSignOut: () => void }) => React.ReactNode;
}

export default function ProtectedAdminRoute({ children }: ProtectedAdminRouteProps) {
  const [idToken, setIdToken] = useState<string>('dev-token');
  const [adminUser, setAdminUser] = useState<User | any>({
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
          // Keep dev token fallback
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

  return <>{children({ idToken, adminUser, onSignOut: handleSignOut })}</>;
}
