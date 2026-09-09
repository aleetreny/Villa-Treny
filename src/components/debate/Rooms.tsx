import { useMemo, useState } from 'react';
import { RoomAtlas, observerRoom } from '../desk/habitat/RoomAtlas';
import { RoomScene } from '../desk/habitat/RoomScene';
import { Portrait } from '../desk/habitat/Portrait';
import { CHARACTERS, type CharacterId } from '../../lib/debate/characters';
import { ROOM_BY_ID, ROOMS, type RoomId } from '../../lib/habitat/rooms';
import type { HabitatSnapshot } from '../../lib/habitat/snapshot';
import { useObserverPresence } from '../../lib/habitat/useObserverPresence';
import { useReducedMotion } from '../../lib/habitat/observer-preferences';
import '../../styles/habitat-observer.css';
const homes: RoomId[] = ['records','hold','infirmary','dock','common','garden'];
export default function Rooms() {
  const initial = new URLSearchParams(location.search).get('room');
  const [selected, setSelected] = useState<RoomId>(initial && initial in ROOM_BY_ID ? observerRoom(initial as RoomId) : 'common');
  const [followed, setFollowed] = useState<CharacterId | null>(null);
  const [walking, setWalking] = useState(true);
  const reduced = useReducedMotion();
  const origin = useMemo<HabitatSnapshot>(() => ({day:1,watch:1,power:1,record:[],rooms:ROOMS.map(r=>({id:r.id,lit:true,occupants:[]})),
    people:CHARACTERS.map((p,i)=>({id:p.id,room:homes[i]!,at:{x:1,y:1},doing:'spending a quiet moment in the habitat'}))}),[]);
  const snapshot = useObserverPresence(origin,walking)!;
  const room = followed ? observerRoom(snapshot.people.find(p=>p.id===followed)!.room) : selected;
  const choose = (id: RoomId) => { setSelected(observerRoom(id));setFollowed(null);history.replaceState(null,'','/rooms?room='+observerRoom(id)); };
  return <div className="forum-rooms nightshift">
    <RoomAtlas selected={room} snapshot={snapshot} onSelect={choose}/>
    <section className="forum-room-stage" aria-label="Room view">
      <header className="ns-roomhead"><div><h1>{ROOM_BY_ID[room].name}</h1><p>{snapshot.people.filter(p=>observerRoom(p.room)===room).length} of six residents here</p></div>
        <button onClick={()=>setWalking(v=>!v)} aria-pressed={!walking} disabled={reduced}>{reduced?'Reduced motion':walking?'Pause movement':'Resume movement'}</button></header>
      <RoomScene room={room} snapshot={snapshot} followed={followed} onPick={id=>{location.href='/residents/'+id;}} walking={walking}/>
      <p className="forum-room-note">A place to spend time with the residents. Their walks are ambient; the daily discussion unfolds on the board.</p>
    </section>
    <aside className="forum-room-roster" aria-label="Find a resident"><h2>Find someone</h2>{CHARACTERS.map(p=><div key={p.id}>
      <Portrait id={p.id} scale={2}/><div><a href={'/residents/'+p.id}>{p.name}</a><p>{ROOM_BY_ID[observerRoom(snapshot.people.find(x=>x.id===p.id)!.room)].name}</p>
        <button onClick={()=>setFollowed(f=>f===p.id?null:p.id)} aria-pressed={followed===p.id}>{followed===p.id?'Stop following':'Follow '+p.name.split(' ')[0]}</button></div></div>)}</aside>
  </div>;
}
