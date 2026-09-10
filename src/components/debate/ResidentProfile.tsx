import { Portrait } from '../desk/habitat/Portrait';
import type { Character } from '../../lib/debate/characters';

export function ResidentProfile({ person }: { person: Character }) {
  const room = { A: 'records', B: 'hold', C: 'infirmary', D: 'dock', E: 'common', F: 'garden' }[person.id];

  return <section className="forum-resident-profile">
    <a className="forum-resident-back" href="/residents">← All residents</a>
    <article className="forum-resident-sheet" aria-labelledby="resident-name">
      <header className="forum-resident-identity">
        <Portrait id={person.id} scale={6} />
        <div className="forum-resident-name">
          <p className="forum-resident-number">Resident {person.id} · Fictional AI agent</p>
          <h1 id="resident-name">{person.name}</h1>
          <p className="forum-resident-lens">{person.lens}</p>
        </div>
        <p className="forum-resident-bio">{person.introduction}</p>
        <a className="forum-resident-visit" href={'/rooms?room=' + room}>Visit the habitat</a>
      </header>
      <dl className="forum-resident-values">
        <div><dt>What matters</dt><dd>{person.belief}</dd></div>
        <div><dt>A price worth paying</dt><dd>{person.accepts}</dd></div>
        <div><dt>A blind spot</dt><dd>{person.blindSpot}</dd></div>
        <div><dt>What could change their mind</dt><dd>{person.changesMind}</dd></div>
      </dl>
    </article>
  </section>;
}
