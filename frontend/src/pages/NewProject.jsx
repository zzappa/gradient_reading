import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { createProject, startTransformation } from '../api/client';
import { LANGUAGE_LIST, SOURCE_LANGUAGE_LIST } from '../languages';
import Flag from '../components/ui/Flag';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import PageLayout from '../components/layout/PageLayout';

const MAX_WORDS = 5000;

const SAMPLE_TITLE = 'Winnie-the-Pooh — The Flood';
const SAMPLE_TEXT = `When the rain began Pooh was asleep. It rained, and it rained, and it rained, and he slept and he slept and he slept. He had had a tiring day. You remember how he discovered the North Pole; well, he was so proud of this that he asked Christopher Robin if there were any other Poles such as a Bear of Little Brain might discover.

"There's a South Pole," said Christopher Robin, "and I expect there's an East Pole and a West Pole, though people don't like talking about them."

Pooh was very excited when he heard this, and suggested that they should have an Expotition to discover the East Pole, but Christopher Robin had thought of something else to do with Kanga; so Pooh went out to discover the East Pole by himself. Whether he discovered it or not, I forget; but he was so tired when he got home that, in the very middle of his supper, after he had been eating for little more than half-an-hour, he fell fast asleep in his chair, and slept and slept and slept.

Then suddenly he was dreaming. He was at the East Pole, and it was a very cold pole with the coldest sort of snow and ice all over it. He had found a bee-hive to sleep in, but there wasn't room for his legs, so he had left them outside. And Wild Woozles, such as inhabit the East Pole, came and nibbled all the fur off his legs to make nests for their Young. And the more they nibbled, the colder his legs got, until suddenly he woke up with an Ow!\u2014and there he was, sitting in his chair with his feet in the water, and water all round him!

He splashed to his door and looked out....

"This is Serious," said Pooh. "I must have an Escape."

So he took his largest pot of honey and escaped with it to a broad branch of his tree, well above the water, and then he climbed down again and escaped with another pot ... and when the whole Escape was finished, there was Pooh sitting on his branch, dangling his legs, and there, beside him, were ten pots of honey....`;

export default function NewProject() {
  const { currentUser } = useUser();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [lang, setLang] = useState('es');
  const [sourceLang, setSourceLang] = useState('en');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const userLevel = (currentUser?.levels || {})[lang] || 0;

  if (!currentUser) {
    return (
      <PageLayout>
        <p className="text-text-muted">Select a user before creating a project.</p>
      </PageLayout>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !text.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const project = await createProject({
        title: title.trim(),
        source_text: text.trim(),
        user_id: currentUser.id,
        target_language: lang,
        source_language: sourceLang,
      });
      const { job_id } = await startTransformation(project.id);
      navigate(`/project/${project.id}/processing`, {
        state: { jobId: job_id },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout>
      <h1 className="font-serif text-3xl font-semibold mb-2">New project</h1>
      <p className="text-sm text-text-muted mb-8">
        Paste text to transform through 7 gradient levels.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="Title"
          placeholder="My first story"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Source language
          </label>
          <div className="flex flex-wrap gap-2">
            {SOURCE_LANGUAGE_LIST.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setSourceLang(l.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  sourceLang === l.code
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-muted hover:border-accent hover:text-accent'
                }`}
              >
                <Flag code={l.code} size="sm" />
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Target language
          </label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_LIST.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                  lang === l.code
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-muted hover:border-accent hover:text-accent'
                }`}
              >
                <Flag code={l.code} size="sm" />
                <span>{l.name}</span>
              </button>
            ))}
          </div>
          {sourceLang === lang ? (
            <p className="text-xs text-red-600 mt-2">
              Source and target language cannot be the same.
            </p>
          ) : (
            <p className="text-xs text-text-muted mt-2">
              <Flag code={lang} size="sm" /> Your level: {userLevel} &mdash; text transforms through 7 gradient levels.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-text">
              Source text
            </label>
            <button
              type="button"
              onClick={() => {
                setTitle(SAMPLE_TITLE);
                setText(SAMPLE_TEXT);
                setSourceLang('en');
              }}
              className="text-xs text-accent hover:text-accent/80"
            >
              Load sample
            </button>
          </div>
          <textarea
            className="w-full h-64 px-3 py-2 border border-border rounded-lg text-sm font-serif leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent placeholder:text-text-muted/50"
            placeholder={`Paste your ${SOURCE_LANGUAGE_LIST.find(l => l.code === sourceLang)?.name || 'source'} text here...`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-between mt-1">
            <span
              className={`text-xs ${wordCount > MAX_WORDS ? 'text-red-600' : 'text-text-muted'}`}
            >
              {wordCount.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
            </span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={
              submitting || !title.trim() || !text.trim() || wordCount > MAX_WORDS || sourceLang === lang
            }
          >
            {submitting ? 'Creating...' : 'Transform'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/dashboard')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </PageLayout>
  );
}
