import { describeDatabaseError, listPublicRooms } from "@incision/database";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { PublicRoomExplorer } from "@/components/rooms/public-room-explorer";
import { FleetScene } from "@/components/rooms/scenes/fleet-scene";
import { QuickplayCard } from "@/components/rooms/quickplay-card";
import { PageHeading } from "@/components/ui/page-heading";
import { publicRoomsCopy } from "@/i18n/public-rooms";
import { getRequestDictionary } from "@/i18n/server";
import { parsePublicRoomFilters, type PublicRoomEntry } from "@/rooms/public-rooms-protocol";
import { authDatabase } from "@/server/auth/store";
import { publicRoomEntry, sharedPublicRoomFeed } from "@/server/rooms/public-room-feed";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getRequestDictionary();
  return { title: publicRoomsCopy(locale).metaTitle };
}

/**
 * Screen 04's public room list (JOIN-02), open to everyone: it shows only PUBLIC rooms and
 * what they show to anyone with their code. The first list is read here, so the page and its
 * filters work without JavaScript; the browser then follows the live feed.
 */
export default async function PublicRoomsPage({ searchParams }: PageProps<"/rooms">) {
  const [{ locale }, params] = await Promise.all([getRequestDictionary(), searchParams]);
  const t = publicRoomsCopy(locale);
  const filters = parsePublicRoomFilters(params);
  let rooms: PublicRoomEntry[] | undefined;
  try {
    // The server's feed when it runs (always, outside unit tests): pages share its throttled reads.
    const feed = sharedPublicRoomFeed();
    rooms = feed !== undefined ? [...await feed.current()] : (await listPublicRooms(authDatabase())).map(publicRoomEntry);
  } catch (error: unknown) {
    unstable_rethrow(error);
    console.error("[rooms] public room page failed:", describeDatabaseError(error));
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <PageHeading bold={t.headingBold} serif={t.headingSerif} />
        <p className="max-w-[560px] text-lg text-embrun">{t.intro}</p>
      </div>
      {/* Screen 04's card row: matchmaking first (JOIN-03), on the design's three-column grid.
          C1 (docs/da/v2, DA2-6): the two other columns hold the decorative fleet, hidden under 640 px. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <QuickplayCard t={t.quickplay} />
        <FleetScene className="lg:col-span-2" />
      </div>
      <PublicRoomExplorer locale={locale} initialRooms={rooms} initialFilters={filters} />
    </div>
  );
}
