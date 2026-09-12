/**
 * Vetrina — free games and discounts from the storefronts.
 *
 * Fork addition. The data comes from the backend (`get_storefront_feed`)
 * because the Steam webview cannot reach the open internet: measured from
 * `SharedJSContext`, a fetch to `steamloopback.host` returns 200 and one to
 * `store.steampowered.com` fails outright. The page only renders.
 *
 * Three things this refuses to do, all of them the same mistake in different
 * clothes — showing an absence as if it were an answer:
 *
 *   - a source that failed is *named*. An empty "free this week" that really
 *     means "Epic timed out" teaches the user to stop checking;
 *   - a cached payload served because everything is down is *labelled old*,
 *     with its date;
 *   - upcoming giveaways are shown next to the live ones, because a free game
 *     you hear about after it ends is worse than not hearing about it.
 *
 * It is the same lesson as the library that shrank in silence, and it is the
 * reason this page exists at all.
 */
import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { Focusable } from "@decky/ui";
import { useTranslation } from "react-i18next";
import { useRPC } from "../api/useRPC";
import { hasStorefront, openStorefront } from "../services/store/StorefrontLauncher";
import { storeReportsConnected } from "../services/auth/store-status";
import { rpcRoutes } from "../api/rpc-routes";
import { RootProvider } from "../contexts/RootProvider";
import { C, FOCUS_CSS, MONO } from "./unifideck-page/theme";

/** One giveaway, live or queued. Mirrors the backend dict exactly. */
interface FreeGame {
  store: string;
  title: string;
  image: string;
  url: string;
  starts?: string | null;
  ends?: string | null;
  active: boolean;
}

/** One discounted title. Prices are in minor units, as the store sends them. */
interface Deal {
  store: string;
  title: string;
  image: string;
  url: string;
  discount: number;
  /** Steam AppID, per aprire la pagina dentro il client invece che nel web. */
  steam_appid?: number | null;
  price_final?: number | null;
  price_original?: number | null;
  currency?: string;
}

interface Feed {
  free: FreeGame[];
  deals: Deal[];
  errors: string[];
  fetched_at: number;
  stale: boolean;
}

const EMPTY: Feed = { free: [], deals: [], errors: [], fetched_at: 0, stale: false };

/** Steam's chrome sits over the page; same insets as the catalogue. */
const TOP_INSET = 40;
const BOTTOM_INSET = 36;

/** Minor units to a readable price. Currency is whatever the store said. */
function formatPrice(minor: number | null | undefined, currency?: string): string {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return "";
  const amount = (minor / 100).toFixed(2);
  return currency ? `${amount} ${currency}` : amount;
}

/** "until 14 Sep" — the date matters, the minute does not. */
function formatUntil(iso: string | null | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function openUrl(url: string): void {
  // Same call the game-info buttons use: a popup inside Steam's own browser,
  // which is the only thing that works in Gaming Mode.
  window.open(url, "_blank", "width=1024,height=768,popup=yes");
}

/**
 * Aprire un'offerta dove l'utente e' *gia' autenticato*.
 *
 * `window.open` da solo non basta e per un giveaway e' quasi inutile: apre il
 * browser interno di Steam, che non ha la sessione dello store, e chi ci
 * arriva vede la pagina giusta e un pulsante di login. Un gioco gratis che
 * non si riesce a riscattare tanto vale non annunciarlo.
 *
 * Due strade, una per fonte, e nessuna delle due tocca monte:
 *
 *   - Steam: `steam://store/<appid>` apre la pagina *dentro il client*, dove
 *     la sessione c'e' per definizione. E' la stessa cosa che fa
 *     `GameInfoNavButtons` per i giochi della libreria.
 *   - Epic e gli altri store a browser: `openStorefront` riusa il profilo
 *     Edge persistente in cui il plugin ha gia' fatto accedere l'utente —
 *     vedi `StorefrontLauncher`, "the shop opens in that same profile, so
 *     the live web session carries over". Arriva alla home dello store e non
 *     alla scheda del gioco, perche' l'URL lo sceglie il backend di monte e
 *     passargliene uno significherebbe patchare un suo file; Epic mette i
 *     giveaway in evidenza proprio li'.
 *
 * Se lo store non e' collegato il ripiego e' il link diretto: senza account
 * la scheda del gioco e' piu' utile della vetrina di un negozio in cui non
 * si entra.
 */
async function openOffer(store: string, url: string, steamAppId?: number | null): Promise<void> {
  if (store === "steam" && steamAppId) {
    openUrl(`steam://store/${steamAppId}`);
    return;
  }
  if (hasStorefront(store as never) && (await storeReportsConnected(store as never))) {
    const r = await openStorefront(store as never);
    if (r.success) return;
    console.warn("[Vetrina] storefront non aperto, ripiego sul link:", r.error);
  }
  openUrl(url);
}

/** One entry. Focusable rather than a button: pad focus is a class, not DOM. */
const Card: FC<{
  title: string;
  image: string;
  badge: string;
  badgeTone: string;
  note?: string;
  onOpen: () => void;
}> = ({ title, image, badge, badgeTone, note, onOpen }) => (
  <Focusable
    noFocusRing
    onActivate={onOpen}
    data-udk="card"
    style={{
      width: 176,
      borderRadius: 12,
      overflow: "hidden",
      border: `1px solid ${C.border}`,
      background: "rgba(255,255,255,0.02)",
      cursor: "pointer",
    }}
  >
    <div style={{ position: "relative", height: 96, background: C.bg }}>
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <span
        style={{
          position: "absolute",
          top: 6,
          insetInlineStart: 6,
          fontFamily: MONO,
          fontSize: 11,
          padding: "2px 7px",
          borderRadius: 999,
          color: C.bg,
          background: badgeTone,
          fontWeight: 700,
        }}
      >
        {badge}
      </span>
    </div>
    <div style={{ padding: "8px 10px 10px" }}>
      <div
        style={{
          fontSize: 13,
          color: C.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      {note ? (
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.textDim, marginTop: 2 }}>
          {note}
        </div>
      ) : null}
    </div>
  </Focusable>
);

const Section: FC<{ title: string; count: number; children: React.ReactNode }> = ({
  title,
  count,
  children,
}) =>
  count === 0 ? null : (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 12,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.textDim,
          margin: "0 0 8px 2px",
        }}
      >
        {title} <span style={{ color: C.textFaint }}>{count}</span>
      </div>
      <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {children}
      </Focusable>
    </div>
  );

const VetrinaInner: FC = () => {
  const { t, i18n } = useTranslation();
  const [feed, setFeed] = useState<Feed>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // `useRPC` e non `call` grezzo: il backend incarta le risposte in
  // `{success, error, data}` e questo hook e' cio' che le scarta. Chiamando
  // `call` direttamente si riceve la busta e si legge `free` da un oggetto
  // che non ce l'ha — la pagina dice "niente in offerta" mentre il log del
  // backend, un metro piu' in la', conta quattro giochi gratis.
  const rpc = useRPC<[boolean, string], Feed>(rpcRoutes.getStorefrontFeed);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setFailed(false);
    try {
      // La lingua della pagina decide paese e valuta: il config e' "auto"
      // su un'installazione normale, e "auto" non dice in che valuta
      // vive chi guarda.
      const data = await rpc(force, i18n.language || "");
      // The backend promises this shape, but a plugin mid-reload can answer
      // with anything; a page that throws here would be a white screen.
      setFeed({ ...EMPTY, ...(data ?? {}) });
    } catch (e) {
      console.error("[Vetrina] feed failed:", e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [rpc, i18n.language]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const locale = i18n.language || "en";
  const live = useMemo(() => feed.free.filter((g) => g.active), [feed.free]);
  const soon = useMemo(() => feed.free.filter((g) => !g.active), [feed.free]);

  const fetched = feed.fetched_at
    ? new Date(feed.fetched_at * 1000).toLocaleString(locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <>
      <style>{FOCUS_CSS}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          paddingTop: TOP_INSET,
          paddingBottom: BOTTOM_INSET,
          background: C.bg,
          color: C.text,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 18px 8px",
          }}
        >
          <div style={{ fontFamily: MONO, letterSpacing: "0.18em", color: C.amber }}>
            {t("vetrina.title")}
          </div>
          <div style={{ flex: 1 }} />
          {fetched ? (
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.textFaint }}>
              {feed.stale ? t("vetrina.stale", { when: fetched }) : fetched}
            </div>
          ) : null}
          <Focusable
            noFocusRing
            onActivate={() => void load(true)}
            data-udk="btn"
            style={{
              fontFamily: MONO,
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 10,
              cursor: "pointer",
              color: C.text,
              border: `1px solid ${C.borderStrong}`,
            }}
          >
            {loading ? t("vetrina.loading") : t("vetrina.refresh")}
          </Focusable>
        </div>

        {/* A source that failed is named. Silence here would read as "there is
            nothing free this week", which is a different and wrong statement. */}
        {feed.errors.length > 0 && (
          <div
            style={{
              margin: "0 18px 10px",
              padding: "8px 14px",
              borderRadius: 10,
              border: `1px solid ${C.amber}44`,
              fontFamily: MONO,
              fontSize: 12,
              color: C.amberSoft,
            }}
          >
            {t("vetrina.sourcesDown", {
              stores: feed.errors.map((e) => e.split(":")[0]).join(", "),
            })}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 18px" }}>
          {failed ? (
            <div style={{ color: C.textDim, fontFamily: MONO, fontSize: 13 }}>
              {t("vetrina.failed")}
            </div>
          ) : loading && feed.fetched_at === 0 ? (
            <div style={{ color: C.textFaint, fontFamily: MONO, fontSize: 13 }}>
              {t("vetrina.loading")}
            </div>
          ) : (
            <>
              <Section title={t("vetrina.freeNow")} count={live.length}>
                {live.map((g) => (
                  <Card
                    key={`${g.store}:${g.title}`}
                    title={g.title}
                    image={g.image}
                    badge={t("vetrina.badgeFree")}
                    badgeTone={C.teal}
                    note={
                      g.ends
                        ? t("vetrina.until", { date: formatUntil(g.ends, locale) })
                        : undefined
                    }
                    onOpen={() => void openOffer(g.store, g.url)}
                  />
                ))}
              </Section>

              <Section title={t("vetrina.freeSoon")} count={soon.length}>
                {soon.map((g) => (
                  <Card
                    key={`${g.store}:${g.title}`}
                    title={g.title}
                    image={g.image}
                    badge={t("vetrina.badgeSoon")}
                    badgeTone={C.amberSoft}
                    note={
                      g.starts
                        ? t("vetrina.from", { date: formatUntil(g.starts, locale) })
                        : undefined
                    }
                    onOpen={() => void openOffer(g.store, g.url)}
                  />
                ))}
              </Section>

              <Section title={t("vetrina.deals")} count={feed.deals.length}>
                {feed.deals.map((d) => (
                  <Card
                    key={`${d.store}:${d.title}`}
                    title={d.title}
                    image={d.image}
                    badge={`-${d.discount}%`}
                    badgeTone={C.amber}
                    note={formatPrice(d.price_final, d.currency)}
                    onOpen={() => void openOffer(d.store, d.url, d.steam_appid)}
                  />
                ))}
              </Section>

              {!loading &&
                live.length === 0 &&
                soon.length === 0 &&
                feed.deals.length === 0 && (
                  <div style={{ color: C.textDim, fontFamily: MONO, fontSize: 13 }}>
                    {t("vetrina.empty")}
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

/** Route component. Same contract as the catalogue: Decky remounts on every
 *  navigation, so the providers have to be re-established here. */
export const VetrinaPage: FC = () => (
  <RootProvider>
    <VetrinaInner />
  </RootProvider>
);
