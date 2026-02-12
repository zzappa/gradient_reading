import { createContext, useContext, useState, useEffect } from 'react';
import { getUsers } from '../api/client';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getUsers()
      .then((data) => {
        setUsers(data);
        const saved = localStorage.getItem('gradient_user_id');
        const found = data.find((u) => u.id === saved);
        if (found) setCurrentUser(found);
      })
      .catch((err) => {
        console.error('Failed to load users:', err);
        setError('Could not connect to the server. Is the backend running?');
      })
      .finally(() => setLoading(false));
  }, []);

  function selectUser(user) {
    setCurrentUser(user);
    localStorage.setItem('gradient_user_id', user.id);
  }

  function updateCurrentUser(updated) {
    setCurrentUser(updated);
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
  }

  return (
    <UserContext.Provider
      value={{ users, currentUser, selectUser, updateCurrentUser, loading, error }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
