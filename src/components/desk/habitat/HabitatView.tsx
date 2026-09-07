import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomScene } from './RoomScene';
import { RoomAtlas, ROOM_WINGS, observerRoom } from './RoomAtlas';
import { Dossier } from './Dossier';
import { Portrait } from './Portrait';
import { Weave } from './Weave';
import { SocietyLedger } from './SocietyLedger';
import { LiveStatus } from './LiveStatus';
import { useReducedMotion } from '../../../lib/habitat/observer-preferences';
import { ROOM_BY_ID, type RoomId } from '../../../lib/habitat/rooms';
import { RESIDENTS, RESIDENT_BY_ID, type ResidentId } from '../../../lib/habitat/residents';
import { useHabitatLive } from '../../../lib/habitat/useHabitatLive';
import { useObserverPresence } from '../../../lib/habitat/useObserverPresence';
import '../../../styles/habitat-observer.css';

type Notebook = 'diary' | 'people' | 'relations';
const WATCH = ['', 'I', 'II', 'III', 'IV'] as const;

function clock(minute: number): string {
  return `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
}

export function HabitatView({ onClose, portfolioUrl = 'https://aleetreny.github.io/' }: { onClose?: () => void; portfolioUrl?: string } = {}) {
  const live = useHabitatLive();
  const [wandering, setWandering] = useState(true);
  const reducedMotion = useReducedMotion();
  const snapshot = useObserverPresence(live.snapshot, wandering);
  const [selected, setSelected] = useState<RoomId>('common');
  const [opened, setOpened] = useState<ResidentId | null>(null);
  const [followed, setFollowed] = useState<ResidentId | null>(null);
  const [notebook, setNotebook] = useState<Notebook>('diary');
  const [localRecord, setLocalRecord] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const returnFocus = useRef<HTMLElement | null>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const followedState = followed ? snapshot?.people.find((person) => person.id === followed) : null;
  const selectedRoom = followedState ? observerRoom(followedState.room) : selected;
  const room = ROOM_BY_ID[selectedRoom];
  const inside = snapshot?.people.filter((person) => observerRoom(person.room) === selectedRoom) ?? [];
  const wing = ROOM_WINGS.find((group) => group.rooms.includes(selectedRoom));

  const selectRoom = useCallback((id: RoomId) => {
    setSelected(observerRoom(id));
    setFollowed(null);
    if (notebook === 'relations') setNotebook('diary');
  }, [notebook]);

  const openPerson = useCallback((id: ResidentId) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpened(id);
  }, []);

  const closeProfile = useCallback(() => {
    setOpened(null);
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else viewer.current?.querySelector<HTMLElement>('.ns-notebook__tabs [aria-pressed="true"]')?.focus();
    });
  }, []);

  const close = useCallback(() => {
    if (opened) closeProfile();
    else if (notebook === 'relations') setNotebook('diary');

  }, [closeProfile, notebook, opened]);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = 'Night Shift · The Habitat';
    document.documentElement.lang = 'en';
    viewer.current?.focus();
    return () => { document.title = previousTitle; document.documentElement.lang = previousLanguage; previous?.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (opened || notebook === 'relations')) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, opened, notebook]);

  const residents = RESIDENTS.filter((person) => {
    const state = snapshot?.people.find((candidate) => candidate.id === person.id);
    return `${person.name} ${state ? ROOM_BY_ID[observerRoom(state.room)].name : ''}`.toLocaleLowerCase().includes(rosterSearch.toLocaleLowerCase());
  });

  const records = live.archive
    .filter((entry) => (!localRecord || observerRoom(entry.room) === selectedRoom)
      && (!followed || entry.who.includes(followed)))
    .slice().reverse();

  if (!snapshot || !live.snapshot) return <div className="nightshift" lang="en" ref={viewer}>
    <header className="ns-head"><h1>Night Shift<span>The habitat</span></h1><LiveStatus {...live} /><a className="ns-close" href={portfolioUrl}>Portfolio</a></header>
    <main className="ns-loading" aria-busy={live.connection === 'connecting'}><h2>{live.connection === 'connecting' ? 'Opening the habitat…' : 'The habitat could not be reached'}</h2><p>{live.connection === 'connecting' ? 'Waiting for the saved world.' : 'The saved world is unavailable. Check the connection and try again.'}</p>{live.connection !== 'connecting' ? <button type="button" onClick={live.refresh}>Try again</button> : null}</main>
  </div>;

  return (
    <div className="nightshift" lang="en" ref={viewer} tabIndex={-1} aria-label="Night Shift, the habitat">
      <header className="ns-head">
        <h1>Night Shift<span>The habitat</span></h1>
        <div className="ns-clock"><span>Day <b>{snapshot.day}</b></span><span>Watch <b>{WATCH[snapshot.watch]}</b></span></div>
        <LiveStatus {...live} />
        {onClose ? <button type="button" className="ns-close" onClick={onClose}>Leave</button> : <a className="ns-close" href={portfolioUrl}>Portfolio</a>}
      </header>

      <div className="ns-world">
        <RoomAtlas selected={selectedRoom} snapshot={snapshot} onSelect={selectRoom} />
        <main className="ns-chamber">
          <header className="ns-roomhead">
            <div><h2>{notebook === 'relations' ? 'The Weave' : room.name}</h2><p>{notebook === 'relations' ? 'What they hold for one another' : wing?.name}</p></div>
            {followed ? (
              <button className="ns-follow" type="button" onClick={() => { setSelected(selectedRoom); setFollowed(null); }}>
                Following {RESIDENT_BY_ID[followed].name.split(' ')[0]} <span>Stop following</span>
              </button>
            ) : <span className="ns-count">{notebook === 'relations' ? snapshot.people.length : inside.length} {notebook !== 'relations' && inside.length === 1 ? 'resident' : 'residents'}</span>}
          </header>
          <div className="ns-scene">
            <div className="ns-scene__room" hidden={notebook === 'relations'}><RoomScene room={selectedRoom} snapshot={snapshot} onPick={openPerson} followed={followed ?? undefined} active={notebook !== 'relations'} walking={wandering && !reducedMotion} /></div>
            {notebook === 'relations' ? <Weave onOpen={openPerson} relationships={live.relationships} day={snapshot.day} /> : null}
          </div>
          {notebook === 'relations' ? (
            <div className="ns-roomfoot"><button type="button" onClick={() => setNotebook('diary')}>Back to {room.name}</button></div>
          ) : (
            <footer className="ns-roomfoot">
              <p>{room.description}</p>
              <p className="ns-presentation">The figures wander for observation. Their choices, accounts and journal follow the saved world independently. <button type="button" onClick={() => setWandering((value) => !value)} disabled={reducedMotion}>{reducedMotion ? 'Wandering paused by motion preference' : wandering ? 'Pause wandering' : 'Resume wandering'}</button></p>
              <div className="ns-nearby"><span>Explore</span>{wing?.rooms.filter((id) => id !== selectedRoom).slice(0, 5).map((id) => (
                <button type="button" key={id} onClick={() => selectRoom(id)}>{ROOM_BY_ID[id].name}</button>
              ))}</div>
            </footer>
          )}
        </main>

        <aside className="ns-notebook" aria-label="Observer’s notebook">
          <div className="ns-notebook__tabs" role="group" aria-label="Notebook">
            {([['diary', 'Journal'], ['people', 'The 25'], ['relations', 'Weave']] as const).map(([id, label]) => (
              <button type="button" key={id} aria-pressed={notebook === id} onClick={() => { setNotebook(id); setOpened(null); }}>{label}</button>
            ))}
          </div>
          {opened ? (
            <Dossier id={opened} snapshot={snapshot} onClose={closeProfile} onOpen={openPerson}
              onObserve={(id) => { setFollowed(id); setOpened(null); setNotebook('diary'); }}
              archive={live.archive} archiveDay={live.archiveDay} relationships={live.relationships} society={live.society} />
          ) : notebook === 'people' ? (
            <div className="ns-roster">
              <label className="ns-search"><span>Find someone</span><input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Name or room" /></label>
              {!residents.length ? <p className="ns-message">No matching residents. Try another name or a room.</p> : null}
              <ul>{residents.map((person) => {
                const state = snapshot?.people.find((candidate) => candidate.id === person.id);
                return <li key={person.id}><button type="button" onClick={() => openPerson(person.id)}><Portrait id={person.id} scale={2} /><span><b>{person.name}</b><small>{state ? ROOM_BY_ID[observerRoom(state.room)].name : 'Not accounted for'}</small><em>{state?.doing}</em></span></button></li>;
              })}</ul>
            </div>
          ) : notebook === 'relations' ? (
            <div className="ns-trama-help"><h3>Nobody lives alone.</h3><p>Trust, affection, admiration, debt, resentment and desire. What one person feels may differ from what they receive.</p><p>Choose a portrait to read their story. Switch between the graph, matrix and bonds to see the same community from another angle.</p><button type="button" onClick={() => setNotebook('people')}>Meet the 25</button></div>
          ) : (
            <div className="ns-diary">
              <SocietyLedger society={live.society} day={live.snapshot.day} watch={live.snapshot.watch} onOpen={openPerson} />
              <div className="ns-diary__day"><button type="button" aria-label="Previous day" disabled={live.archiveDay <= 100} onClick={() => live.setArchiveDay(live.archiveDay - 1)}>Previous</button><span>Day {live.archiveDay}</span><button type="button" aria-label="Next day" disabled={live.archiveDay >= snapshot.day} onClick={() => live.setArchiveDay(live.archiveDay + 1)}>Next</button></div>
              <div className="ns-diary__filter"><button type="button" aria-pressed={!localRecord} onClick={() => setLocalRecord(false)}>Whole habitat</button><button type="button" aria-pressed={localRecord} onClick={() => setLocalRecord(true)}>This room</button></div>
              {followed ? <p className="ns-diary__following">Events involving {RESIDENT_BY_ID[followed].name.split(' ')[0]}</p> : null}
              {live.archiveLoading ? <p className="ns-message" role="status">Reading the journal…</p> : null}
              {live.archiveError ? <p className="ns-message">{live.archiveError} <button type="button" onClick={live.refresh}>Refresh</button></p> : null}
              {!records.length && !live.archiveLoading && !live.archiveError ? <p className="ns-message">No events match this selection yet.</p> : null}
              <ol className="ns-record">{records.map((entry, index) => (
                <li key={`${entry.day}-${entry.minute}-${entry.room}-${index}`}>
                  <div><time>{clock(entry.minute)}</time><button type="button" onClick={() => selectRoom(entry.room)}>{ROOM_BY_ID[entry.room].name}</button></div>
                  <p>{entry.text}</p>
                  <div className="ns-record__who">{entry.who.map((id) => <button type="button" key={id} onClick={() => openPerson(id)}>{RESIDENT_BY_ID[id].name.split(' ')[0]}</button>)}</div>
                </li>
              ))}</ol>
            </div>
          )}
          <footer className="ns-notebook__status"><span>{snapshot.people.length} lives · one shared refuge</span><button type="button" onClick={live.refresh} aria-label="Refresh the habitat state">Refresh</button></footer>
        </aside>
      </div>
    </div>
  );
}
