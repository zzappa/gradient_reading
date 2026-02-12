import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { LANGUAGES } from '../../languages';
import { levelToCefr } from '../../utils/cefr';
import { hasAlphabet } from '../../data/alphabets';

export default function Header() {
  const { users, currentUser, selectUser } = useUser();
  const { dark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  function handleUserChange(e) {
    const user = users.find((u) => u.id === e.target.value);
    if (user) {
      selectUser(user);
      navigate('/dashboard');
    }
  }

  function userLabel(u) {
    const levels = u.levels || {};
    const entries = Object.entries(levels);
    if (entries.length === 0) return u.name;
    const parts = entries
      .map(([code, lv]) => `${LANGUAGES[code]?.name || code} ${levelToCefr(lv) || lv}`)
      .join(', ');
    return `${u.name} — ${parts}`;
  }

  const hasScripts = currentUser
    ? Object.keys(currentUser.levels || {}).some(hasAlphabet)
    : false;

  return (
    <header className="border-b border-border bg-bg">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold text-text no-underline">
          Gradient
        </Link>

        <div className="flex items-center gap-4">
          {currentUser && (
            <>
              <Link
                to="/dashboard"
                className="text-sm text-text-muted hover:text-text no-underline"
              >
                Dashboard
              </Link>
              <Link
                to="/dictionary"
                className="text-sm text-text-muted hover:text-text no-underline"
              >
                Dictionary
              </Link>
              <Link
                to="/flashcards"
                className="text-sm text-text-muted hover:text-text no-underline"
              >
                Flashcards
              </Link>
              {hasScripts && (
                <Link
                  to="/alphabet"
                  className="text-sm text-text-muted hover:text-text no-underline"
                >
                  Scripts
                </Link>
              )}
            </>
          )}

          <button
            onClick={toggleTheme}
            className="text-sm text-text-muted hover:text-text"
          >
            {dark ? 'Light' : 'Dark'}
          </button>

          <select
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50"
            value={currentUser?.id || ''}
            onChange={handleUserChange}
          >
            <option value="" disabled>
              Select user
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
