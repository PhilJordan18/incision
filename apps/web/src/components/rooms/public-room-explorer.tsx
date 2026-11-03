"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { COMPLEXITIES, TEXT_LANGUAGES } from "@incision/domain";
import { card, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";
import { publicRoomsCopy } from "@/i18n/public-rooms";
import type { Locale } from "@/i18n/locale";
import {
  filterPublicRooms, PUBLIC_ROOMS_EVENT, PUBLIC_ROOMS_UNWATCH_EVENT, PUBLIC_ROOMS_WATCH_EVENT, publicRoomFiltersQuery,
  publicRoomListSchema, type PublicRoomEntry, type PublicRoomFilters,
} from "@/rooms/public-rooms-protocol";

type Props = {
  readonly locale: Locale;
  /** Read by the server for the first paint, so the list works without JavaScript. */
  readonly initialRooms: readonly PublicRoomEntry[] | undefined;
  readonly initialFilters: PublicRoomFilters;
};

type Connection = "connecting" | "live" | "offline";
const chip = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-houle px-4 text-sm text-embrun transition-colors duration-200 ease-incision hover:text-ecume has-[:checked]:border-2 has-[:checked]:border-moi has-[:checked]:text-ecume has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-moi";
const ROW = "lg:grid-cols-[minmax(6rem,1fr)_minmax(6rem,1.2fr)_minmax(5.5rem,1fr)_minmax(8rem,1.5fr)_minmax(4.5rem,0.8fr)_minmax(7rem,1.1fr)_minmax(7rem,auto)]";

/** Screen 04's public room list (JOIN-02, D-18): live, filtered by language and complexity. */
export function PublicRoomExplorer({ locale, initialRooms, initialFilters }: Props) {
  const t = publicRoomsCopy(locale);
  const id = useId();
  const [rooms, setRooms] = useState(initialRooms);
  const [filters, setFilters] = useState(initialFilters);
  const [connection, setConnection] = useState<Connection>("connecting");

  useEffect(() => {
    const socket = io({ reconnectionDelayMax: 5_000 });
    const accept = (payload: unknown) => {
      const parsed = publicRoomListSchema.safeParse(payload);
      if (parsed.success) setRooms(parsed.data.rooms);
    };
    socket.on("connect", () => {
      socket.timeout(5_000).emitWithAck(PUBLIC_ROOMS_WATCH_EVENT, null).then((ack: unknown) => {
        if (typeof ack === "object" && ack !== null && "ok" in ack && ack.ok === true) { accept(ack); setConnection("live"); }
        else setConnection("offline");
      }, () => setConnection("offline"));
    });
    socket.on("disconnect", () => setConnection("offline"));
    socket.on(PUBLIC_ROOMS_EVENT, accept);
    return () => { socket.emit(PUBLIC_ROOMS_UNWATCH_EVENT); socket.close(); };
  }, []);

  const shown = useMemo(() => filterPublicRooms(rooms ?? [], filters), [rooms, filters]);
  const filtered = filters.language !== undefined || filters.complexity !== undefined;

  function choose(next: PublicRoomFilters) {
    setFilters(next);
    window.history.replaceState(null, "", `/rooms${publicRoomFiltersQuery(next)}`);
  }

  return <section aria-labelledby={`${id}-title`} className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h2 id={`${id}-title`} className="font-display text-4xl font-black uppercase sm:text-[44px]">
        {t.listTitle}
        {rooms !== undefined && <span className="ml-3 inline-block whitespace-nowrap align-middle font-mono text-sm font-medium tracking-[0.2em] text-brume">· {t.openCount(rooms.length)}</span>}
      </h2>
    </div>

    <form method="get" action="/rooms" aria-label={t.filters} className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end"
      onSubmit={(event) => event.preventDefault()}>
      <FilterGroup legend={t.language} name="language" value={filters.language} all={t.all}
        options={TEXT_LANGUAGES.map((value) => ({ value, label: t.languages[value] }))}
        onChange={(language) => choose({ ...filters, language })} />
      <FilterGroup legend={t.complexity} name="complexity" value={filters.complexity} all={t.all}
        options={COMPLEXITIES.map((value) => ({ value, label: t.complexities[value] }))}
        onChange={(complexity) => choose({ ...filters, complexity })} />
      {/* Without JavaScript, the choice is sent as a query string; with it, it applies at once. */}
      <noscript><button type="submit" className={discreetButton}>{t.apply}</button></noscript>
    </form>

    <p role="status" className="text-sm text-brume">
      {rooms === undefined ? t.unavailable : connection === "offline" ? t.offline : connection === "live" ? t.live : ""}
    </p>

    {rooms !== undefined && (shown.length === 0
      ? <div className={`${card} flex flex-col items-start gap-4`}>
          <p>{filtered ? t.emptyFiltered : t.empty}</p>
          <div className="flex flex-wrap gap-3">
            {filtered && <Link href="/rooms" className={discreetButton} onClick={(event) => { event.preventDefault(); choose({}); }}>{t.clearFilters}</Link>}
            <Link href="/rooms/new" className={secondaryButton}>{t.createRoom}</Link>
          </div>
        </div>
      : <div className="rounded-carte border border-houle bg-nuit">
          <div aria-hidden="true" className={`hidden gap-x-4 px-6 py-4 lg:grid ${ROW} ${monoLabel}`}>
            <span>{t.columns.room}</span><span>{t.columns.host}</span><span>{t.columns.mode}</span><span>{t.columns.text}</span>
            <span>{t.columns.players}</span><span>{t.columns.state}</span><span />
          </div>
          <ul className="flex flex-col">
            {shown.map((room) => <RoomRow key={room.code} room={room} t={t} />)}
          </ul>
        </div>)}
    <p className="text-sm text-brume">{t.footnote}</p>
  </section>;
}

function FilterGroup<T extends string>({ legend, name, value, all, options, onChange }: {
  readonly legend: string; readonly name: string; readonly value: T | undefined; readonly all: string;
  readonly options: readonly { value: T; label: string }[]; readonly onChange: (next: T | undefined) => void;
}) {
  return <fieldset className="flex flex-col gap-2">
    <legend className={`${monoLabel} mb-2`}>{legend}</legend>
    <div className="flex flex-wrap gap-2">
      <label className={chip}><input type="radio" name={name} value="" className="sr-only" checked={value === undefined} onChange={() => onChange(undefined)} />{all}</label>
      {options.map((option) => <label key={option.value} className={chip}>
        <input type="radio" name={name} value={option.value} className="sr-only" checked={value === option.value} onChange={() => onChange(option.value)} />
        {option.label}
      </label>)}
    </div>
  </fieldset>;
}

function RoomRow({ room, t }: { readonly room: PublicRoomEntry; readonly t: ReturnType<typeof publicRoomsCopy> }) {
  const phaseTone = room.phase === "waiting" ? "text-juste" : room.phase === "results" ? "text-moi" : "text-or";
  const field = (label: string, value: ReactNode, extra = "") => <div className={`flex gap-2 lg:block ${extra}`}>
    <dt className={`${monoLabel} lg:sr-only`}>{label}</dt><dd>{value}</dd>
  </div>;
  return <li className={`grid gap-x-4 gap-y-2 border-t border-houle px-6 py-4 lg:items-center ${ROW}`}>
    <dl className="contents">
      {field(t.columns.room, <span className="font-mono font-semibold tracking-[0.12em]">{room.code}</span>)}
      {field(t.columns.host, <span className="break-words">{room.hostName}</span>)}
      {field(t.columns.mode, room.arcade
        ? <span className="font-semibold text-arcade"><span aria-hidden="true">◆ </span>{t.arcade}</span>
        : t.training)}
      {field(t.columns.text, `${room.textLanguage.toUpperCase()} · ${t.complexities[room.complexity]} · ${room.textKind === "random" ? t.random : t.words(room.wordCount)}`)}
      {field(t.columns.players, <span className="font-mono">{room.participants} / {room.capacity}</span>)}
      {field(t.columns.state, <span className={`font-mono text-xs tracking-[0.14em] uppercase ${phaseTone}`}>[.{t.phases[room.phase]}]</span>)}
    </dl>
    <div className="pt-1 lg:pt-0 lg:text-right">
        {room.joinable
          ? <Link href={`/rooms/${room.code}`} aria-label={t.join(room.code)} className={`${secondaryButton} h-11`}>{t.joinShort}</Link>
          : <span className="text-sm text-brume">{room.phase === "countdown" || room.phase === "racing" ? t.notAdmitting : t.full}</span>}
    </div>
  </li>;
}
