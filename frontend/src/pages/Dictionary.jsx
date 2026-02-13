import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getDictionary, getDictionaryLanguages, getChapter } from '../api/client';
import { LANGUAGES } from '../languages';
import Flag from '../components/ui/Flag';
import PageLayout from '../components/layout/PageLayout';
import Spinner from '../components/ui/Spinner';
import { speakTerm, stop, isSupported as speechSupported } from '../utils/speech';
import {
  buildSubstitutionData,
  createFlashcardFromTerm,
  upsertFlashcard,
} from '../utils/flashcards';

const CATEGORIES = [
  'all', 'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'article', 'connector', 'other',
];

const FLASHCARD_SCHEMAS = [
  { value: 'en_target', label: 'EN -> Target' },
  { value: 'target_en', label: 'Target -> EN' },
  { value: 'substitution', label: 'Substitution' },
];

export default function Dictionary() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [terms, setTerms] = useState([]);
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [sortCol, setSortCol] = useState('term');
  const [sortAsc, setSortAsc] = useState(true);
  const [schemaByRow, setSchemaByRow] = useState({});
  const [creatingRow, setCreatingRow] = useState(null);
  const [rowFeedback, setRowFeedback] = useState({});

  useEffect(() => {
    if (!currentUser) {
      setAvailableLanguages([]);
      setSelectedLanguage('');
      setTerms([]);
      setLoadingLanguages(false);
      return;
    }

    let cancelled = false;
    setLoadingLanguages(true);
    getDictionaryLanguages(currentUser.id)
      .then((languages) => {
        if (cancelled) return;
        setAvailableLanguages(languages);
        setSelectedLanguage((prev) => {
          if (prev && languages.includes(prev)) return prev;
          return '';
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableLanguages([]);
        setSelectedLanguage('');
      })
      .finally(() => {
        if (!cancelled) setLoadingLanguages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedLanguage) {
      setTerms([]);
      setLoadingTerms(false);
      return;
    }

    let cancelled = false;
    setLoadingTerms(true);
    getDictionary(currentUser.id, selectedLanguage)
      .then((data) => {
        if (!cancelled) setTerms(data);
      })
      .catch(() => {
        if (!cancelled) setTerms([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTerms(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, selectedLanguage]);

  const filtered = useMemo(() => {
    let list = terms;
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
  }, [terms, catFilter, search, sortCol, sortAsc]);

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

  function rowKey(term) {
    return `${term.term_key}-${term.language}`;
  }

  function selectedSchema(term) {
    return schemaByRow[rowKey(term)] || 'en_target';
  }

  function setFeedback(key, value) {
    setRowFeedback((prev) => ({ ...prev, [key]: value }));
    window.setTimeout(() => {
      setRowFeedback((prev) => {
        if (!(key in prev)) return prev;
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }, 2200);
  }

  async function handleCreateFlashcard(term) {
    const key = rowKey(term);
    const schema = selectedSchema(term);
    setCreatingRow(key);

    try {
      let substitution = null;
      if (schema === 'substitution') {
        let chapter = null;
        try {
          chapter = await getChapter(term.project_id, term.first_chapter);
        } catch {
          chapter = null;
        }
        substitution = buildSubstitutionData({
          chapter,
          termKey: term.term_key,
          sourceText: chapter?.source_text || '',
          transformedText: chapter?.content || '',
          targetDisplay: term.term || term.native_script,
          translation: term.translation,
        });
      }

      const card = createFlashcardFromTerm(term, schema, substitution);
      const result = upsertFlashcard(card);
      setFeedback(key, result.mode === 'created' ? 'Created' : 'Updated');
    } catch (err) {
      setFeedback(key, `Error: ${err?.message || 'failed'}`);
    } finally {
      setCreatingRow(null);
    }
  }

  if (loadingLanguages) {
    return (
      <PageLayout wide className="max-w-none">
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout wide className="max-w-none">
      <h1 className="text-2xl font-semibold mb-6">Dictionary</h1>

      {!currentUser || availableLanguages.length === 0 ? (
        <p className="text-text-muted">
          No vocabulary yet. Start reading to build your dictionary.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label htmlFor="dictionary-language" className="text-sm text-text-muted">
              Language
            </label>
            <select
              id="dictionary-language"
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                setSearch('');
                setCatFilter('all');
              }}
              className="px-3 py-1.5 border border-border rounded-lg text-sm bg-bg"
            >
              <option value="">Select language...</option>
              {availableLanguages.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGES[code]?.name || code}
                </option>
              ))}
            </select>
            <span className="text-sm text-text-muted">
              {selectedLanguage
                ? `Showing ${LANGUAGES[selectedLanguage]?.name || selectedLanguage}`
                : 'Select a language to load terms'}
            </span>
          </div>

          {!selectedLanguage ? (
            <p className="text-text-muted">
              Choose a language to load that dictionary.
            </p>
          ) : loadingTerms ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : terms.length === 0 ? (
            <p className="text-text-muted">
              No vocabulary found for this language yet. Read a project in this language to build your dictionary.
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
                      <th className="px-3 py-2 font-medium text-text-muted">Flashcard</th>
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
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedSchema(t)}
                              onChange={(e) =>
                                setSchemaByRow((prev) => ({
                                  ...prev,
                                  [rowKey(t)]: e.target.value,
                                }))
                              }
                              className="px-2 py-1 border border-border rounded text-xs bg-bg"
                              disabled={creatingRow === rowKey(t)}
                            >
                              {FLASHCARD_SCHEMAS.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleCreateFlashcard(t)}
                              disabled={creatingRow === rowKey(t)}
                              className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
                            >
                              {creatingRow === rowKey(t) ? 'Creating...' : 'Create flashcard'}
                            </button>
                          </div>
                          {rowFeedback[rowKey(t)] && (
                            <div className="text-[11px] text-text-muted mt-1">
                              {rowFeedback[rowKey(t)]}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
