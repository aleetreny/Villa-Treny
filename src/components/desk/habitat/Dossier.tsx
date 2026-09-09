// One of the twenty-five.
//
// Presented the way the board presents its own dossiers — a registry header,
// numbered blocks, the same paper — because that is what welds this layer to the
// portfolio rather than sitting beside it.
//
// The order is deliberate. Who they are now, then what the ship decided they were,
// then the week in their own words, then the people, then how they came to be
// here. The boarding goes last because it is the only part that does not resolve.

import { useEffect, useRef } from 'react';
import { Portrait } from './Portrait';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import { ROOM_BY_ID } from '../../../lib/habitat/rooms';
import { BONDS, LATENT, type Edge } from '../../../lib/habitat/weave';
import { journalOf } from '../../../lib/habitat/journal';
import type { HabitatSnapshot } from '../../../lib/habitat/snapshot';
import type { ArchiveEntry } from '../../../lib/habitat/live';
import { observerRoom } from './RoomAtlas';
import { SLEEPS } from '../../../lib/habitat/engine/state';
import type { SocietySnapshot } from '../../../lib/habitat/society';
import { ResidentMeans } from './SocietyLedger';
import { ResidentAgency } from './AgencyNotebook';
import type { AgencySnapshot } from '../../../lib/habitat/agency';

type Props = {
  id: ResidentId;
  snapshot: HabitatSnapshot;
  onClose: () => void;
  onOpen: (id: ResidentId) => void;
  onObserve?: (id: ResidentId) => void;
  archive?: readonly ArchiveEntry[];
  archiveDay?: number;
  relationships?: readonly Edge[];
  society?: SocietySnapshot | null;
  agency?: AgencySnapshot | null;
};

/** Everything the observer can see between this person and the others: the bonds
 *  they carried aboard, and the dotted ones neither of them has mentioned. */
function tiesOf(id: ResidentId) {
  const real = BONDS
    .filter((b) => b.from === id || b.to === id)
    .map((b) => ({
      other: (b.from === id ? b.to : b.from) as ResidentId,
      line: b.line,
      latent: false,
      /** Whether this person is the one who knows. Meaningless for a real bond. */
      knows: false,
      knower: null,
    }));
  const hidden = LATENT
    .filter((b) => b.from === id || b.to === id)
    .map((b) => ({
      other: (b.from === id ? b.to : b.from) as ResidentId,
      line: b.line,
      latent: true,
      knows: b.knower === id,
      /** The one who does know, whoever is being looked at. */
      knower: b.knower as ResidentId,
    }));
  return [...real, ...hidden];
}

export function Dossier({ id, snapshot, onClose, onOpen, onObserve, archive, archiveDay, relationships, society, agency }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const person = RESIDENT_BY_ID[id];
  const home = ROOM_BY_ID[SLEEPS[id]];
  const housemates = RESIDENTS.filter((resident) => resident.id !== id && SLEEPS[resident.id] === home.id);
  const state = snapshot.people.find((p) => p.id === id);
  const week = journalOf(id)[0];
  const ties = tiesOf(id);
  const recent = archive?.filter((entry) => entry.who.includes(id)).slice(-8).reverse() ?? [];
  useEffect(() => {
    const section = heading.current?.closest('.hab-dossier');
    if (section) section.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [id]);

  return (
    <section className="hab-dossier" aria-label={`Dossier: ${person.name}`}>
      <header className="hab-dossier__head">
        <Portrait id={id} scale={3} />
        <div className="hab-dossier__id">
          <span className="hab-dossier__reg">
            {person.age} years · Group {person.cluster}
          </span>
          <h2 className="hab-dossier__name" ref={heading} tabIndex={-1}>{person.name}</h2>
          <p className="hab-dossier__where">
            {state
              ? <>{ROOM_BY_ID[observerRoom(state.room)].name} · {state.doing}.</>
              : 'Not accounted for.'}
          </p>
        </div>
        <button type="button" className="hab-dossier__close" onClick={onClose}>
          Back to notebook
        </button>
        {onObserve ? <button type="button" className="hab-dossier__observe" onClick={() => onObserve(id)}>Follow {person.name.split(' ')[0]}</button> : null}
      </header>

      <div className="hab-dossier__blocks">
        <article className="hab-block">
          <h3 className="hab-block__head">Who they are</h3>
          <p className="hab-block__body">{person.before}</p>
        </article>

        <ResidentAgency id={id} agency={agency} />

        <article className="hab-block">
          <h3 className="hab-block__head">What the ship decided</h3>
          <dl className="hab-facts">
            <div><dt>Home</dt><dd>{home.name}, shared with {housemates.map((resident) => resident.name).join(' and ')}.</dd></div>
            <div><dt>Before</dt><dd>{person.was}</dd></div>
            <div>
              <dt>Assigned</dt>
              <dd className={person.duty ? '' : 'is-none'}>
                {person.duty ?? 'Nothing. The triage had no field for it.'}
              </dd>
            </div>
            {person.keys.length ? (
              <div>
                <dt>Has access to</dt>
                <dd className="is-key">
                  {person.keys.map((k) => ROOM_BY_ID[k].name).join(', ')}
                </dd>
              </div>
            ) : null}
            <div><dt>Fears</dt><dd>{person.fears}</dd></div>
            <div><dt>Wants</dt><dd>{person.wants}</dd></div>
          </dl>
        </article>

        <ResidentMeans id={id} society={society ?? null} day={snapshot.day} watch={snapshot.watch} onOpen={onOpen} />

        {week ? (
          <article className="hab-block hab-block--journal">
            <h3 className="hab-block__head">Their journal · week {week.week}</h3>
            <blockquote className="hab-journal">{week.text}</blockquote>
          </article>
        ) : null}

        {recent.length ? <article className="hab-block">
          <h3 className="hab-block__head">Journal · day {archiveDay ?? snapshot.day}</h3>
          <ol className="ns-profile-record">{recent.map((entry, index) => <li key={`${entry.day}-${entry.minute}-${index}`}><time>Day {entry.day} · {ROOM_BY_ID[entry.room].name}</time><p>{entry.text}</p></li>)}</ol>
        </article> : null}

        <article className="hab-block">
          <h3 className="hab-block__head">
            Who they knew aboard
          </h3>
          {ties.length ? (
            <ul className="hab-ties">
              {ties.map((t) => (
                <li key={t.other} className={t.latent ? 'hab-tie hab-tie--latent' : 'hab-tie'}>
                  <button
                    type="button"
                    className="hab-tie__who"
                    onClick={() => onOpen(t.other)}
                  >
                    <span className="hab-tie__initial">{t.other}</span>
                    {RESIDENT_BY_ID[t.other].name}
                  </button>
                  <p className="hab-tie__line">
                    {t.latent && !t.knows
                      ? `There is something here, and it has never been said. `
                        + `${RESIDENT_BY_ID[t.knower!].name.split(' ')[0]} knows what it is. `
                        + `${person.name.split(' ')[0]} has no idea it is there.`
                      : t.line}
                  </p>
                  {(() => {
                    const held = relationships?.find((edge) => edge.from === id && edge.to === t.other);
                    if (!held) return null;
                    return <p className="ns-profile-axes"><span>Trust {held.axes.trust}</span><span>Affection {held.axes.affection}</span><span>Resentment {held.axes.resentment}</span></p>;
                  })()}
                  {t.latent && t.knows ? (
                    <p className="hab-tie__flag">
                      Known to {person.name.split(' ')[0]} alone. Not said.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hab-block__body hab-block__body--quiet">
              Nobody. Whatever these twenty-five are to each other now, they built
              all of it in a hundred days.
            </p>
          )}
        </article>

        <article className="hab-block">
          <h3 className="hab-block__head">How they came to be here</h3>
          <p className="hab-block__body">{person.boarding}</p>
          <p className="hab-block__body hab-block__body--quiet">
            Twenty-five accounts, and read together they do not add up. There is no
            document that reconciles them and no author who knows.
          </p>
        </article>
      </div>
    </section>
  );
}
