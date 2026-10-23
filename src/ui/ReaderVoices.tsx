/** The emotional response to the issue, separate from the scoring ledger. */
export function ReaderVoices({ voices, week }: { voices: string[]; week: number }) {
  if (voices.length === 0) return null;
  return (
    <section className="result-readers" aria-labelledby="reader-voices-heading">
      <header className="readers-heading">
        <div><span className="readers-kicker">読者アンケート</span><h2 id="reader-voices-heading">読者の声</h2></div>
        <span className="readers-issue">第{String(week).padStart(2, '0')}話<br />掲載後の反応</span>
      </header>
      <ol className="reader-letters">
        {voices.map((voice, index) => (
          <li key={voice} className={`reader-letter ${index === 0 ? 'reader-letter-lead' : ''}`}>
            <span className="reader-letter-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <blockquote>{voice}</blockquote>
          </li>
        ))}
      </ol>
    </section>
  );
}
