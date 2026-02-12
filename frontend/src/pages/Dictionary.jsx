import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getDictionary } from '../api/client';
import { LANGUAGES } from '../languages';
import Flag from '../components/ui/Flag';
import PageLayout from '../components/layout/PageLayout';
import Spinner from '../components/ui/Spinner';
import { speakTerm, stop, isSupported as speechSupported } from '../utils/speech';

const CATEGORIES = [
  'all', 'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'article', 'connector', 'other',
];

export default function Dictionary() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [sortCol, setSortCol] = useState('term');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    getDictionary(currentUser.id)
      .then(setTerms)
      .catch(() => setTerms([]))
      .finally(() => setLoading(false));
  }, [currentUser]);

  const languages = useMemo(() => {
    const codes = [...new Set(terms.map((t) => t.language))];
    return codes.sort();
  }, [terms]);

  const filtered = useMemo(() => {
    let list = terms;
    if (langFilter !== 'all') {
      list = list.filter((t) => t.language === langFilter);
    }
    if (catFilter !== 'all') {
      list = list.filter((t) => t.category === catFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.term.toLowerCase().includes(q) ||
          t.translation.toLowerCase().includes(q) ||
          (t.grammar_note && t.grammar_note.toLowerCase().includes(q))
      );
    }
    list = [...list].sort((a, b) => {
      const aVal = (a[sortCol] || '').toString().toLowerCase();
      const bVal = (b[sortCol] || '').toString().toLowerCase();
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return list;
  }, [terms, langFilter, catFilter, search, sortCol, sortAsc]);

  function toggleSort(col) {
    if (sortCol === col) {
      setSortAsc((a) => !a);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  function sortIndicator(col) {
    if (sortCol !== col) return '';
    return sortAsc ? ' \u25B2' : ' \u25BC';
  }

  if (loading) {
    return (
      <PageLayout wide>
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout wide>
      <h1 className="text-2xl font-semibold mb-6">Dictionary</h1>

      {terms.length === 0 ? (
        <p className="text-text-muted">
          No vocabulary yet. Start reading to build your dictionary.
        </p>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="text"
              placeholder="Search terms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50 w-56"
            />
            <select
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm bg-bg"
            >
              <option value="all">All languages</option>
              {languages.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGES[code]?.name || code}
                </option>
              ))}
            </select>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm bg-bg"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All categories' : c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            <span className="text-sm text-text-muted self-center">
              {filtered.length} term{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  <Th onClick={() => toggleSort('term')}>
                    Term{sortIndicator('term')}
                  </Th>
                  <Th onClick={() => toggleSort('translation')}>
                    Translation{sortIndicator('translation')}
                  </Th>
                  <th className="px-3 py-2 font-medium text-text-muted">Pronunciation</th>
                  <Th onClick={() => toggleSort('category')}>
                    Category{sortIndicator('category')}
                  </Th>
                  <th className="px-3 py-2 font-medium text-text-muted">Grammar</th>
                  <Th onClick={() => toggleSort('first_chapter')}>
                    Level{sortIndicator('first_chapter')}
                  </Th>
                  <th className="px-3 py-2 font-medium text-text-muted">Context</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => (
                  <tr key={`${t.term_key}-${t.language}-${i}`} className="border-t border-border/50 hover:bg-surface/50">
                    <td className="px-3 py-2">
                      <div
                        className="flex items-center gap-1.5 cursor-pointer"
                        onMouseEnter={() => {
                          if (speechSupported()) {
                            speakTerm(t.term, t.language, t.native_script || null);
                          }
                        }}
                        onMouseLeave={() => stop()}
                      >
                        <Flag code={t.language} size="sm" />
                        <span className="font-medium">{t.term}</span>
                        {t.native_script && t.native_script !== t.term && (
                          <span className="text-text-muted">({t.native_script})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{t.translation}</td>
                    <td className="px-3 py-2 text-text-muted italic">
                      {t.pronunciation ? `/${t.pronunciation}/` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-text-muted">
                        {t.category || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text-muted text-xs max-w-[200px]">
                      {t.grammar_note}
                    </td>
                    <td className="px-3 py-2 text-center">{t.first_chapter}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() =>
                          navigate(
                            `/project/${t.project_id}/read?chapter=${t.first_chapter}&term=${encodeURIComponent(t.term_key)}`
                          )
                        }
                        className="text-xs text-accent hover:text-accent-hover"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </PageLayout>
  );
}

function Th({ children, onClick }) {
  return (
    <th
      onClick={onClick}
      className="px-3 py-2 font-medium text-text-muted cursor-pointer select-none hover:text-text"
    >
      {children}
    </th>
  );
}
