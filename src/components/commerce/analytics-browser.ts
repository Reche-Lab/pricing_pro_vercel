import { analyticsPage, publicAnalyticsSettings, safeAnalyticsParameters, type AnalyticsEvent, type AnalyticsParameters, type AnalyticsSettings } from "@/domain/commerce/analytics";

type Tag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { gtag?: Tag; dataLayer?: unknown[]; navigator: Navigator & { globalPrivacyControl?: boolean } };
const denied = { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
export type AnalyticsConsent = "granted" | "denied" | null;

export function createStoreAnalytics(slug: string, raw: AnalyticsSettings, base: string, browser: AnalyticsWindow = window) {
  const settings = publicAnalyticsSettings(raw), prefix = `commerce_${slug.replace(/[^a-z0-9]/gi, "_")}`;
  const consentKey = `${prefix}:metrics-consent:v1`, onceKey = `${prefix}:${settings.measurementId}:metrics-once:v1`;
  let consent: AnalyticsConsent = null, disposed = false, blocked = false, started = false;
  let page = analyticsPage([]);
  const sent = new Set<string>();
  const privacySignal = browser.navigator.globalPrivacyControl === true || browser.navigator.doNotTrack === "1";
  try {
    const saved = JSON.parse(browser.localStorage.getItem(consentKey) || "null");
    if (saved && saved.expiresAt > Date.now() && ["granted", "denied"].includes(saved.choice)) consent = saved.choice;
    for (const key of JSON.parse(browser.sessionStorage.getItem(onceKey) || "[]").slice(-200)) if (typeof key === "string") sent.add(key);
  } catch { /* Metrics remain optional if browser storage is blocked. */ }
  if (privacySignal) consent = "denied";
  const flag = `ga-disable-${settings.measurementId}`;
  const cookiePath = base || "/";
  function enabled() { return settings.enabled && consent === "granted" && !privacySignal && !blocked && !disposed; }
  function tag() {
    browser.dataLayer ??= [];
    browser.gtag ??= function () {
      // Google expects the argument-list protocol, not arbitrary dataLayer objects.
      // eslint-disable-next-line prefer-rest-params
      browser.dataLayer!.push(arguments);
    };
    return browser.gtag;
  }
  function location() {
    const incoming = new URLSearchParams(browser.location.search), safe = new URLSearchParams();
    const sources = ["google", "bing", "facebook", "instagram", "whatsapp", "newsletter"], media = ["cpc", "ppc", "paid_social", "social", "email", "organic", "referral", "display", "affiliate"];
    if (sources.includes(incoming.get("utm_source") ?? "")) safe.set("utm_source", incoming.get("utm_source")!);
    if (media.includes(incoming.get("utm_medium") ?? "")) safe.set("utm_medium", incoming.get("utm_medium")!);
    return `${browser.location.origin}${base}${page.path === "/" ? "/" : page.path}${safe.size ? `?${safe}` : ""}`;
  }
  function referrer() {
    try { const url = new URL(browser.document.referrer); return ["http:", "https:"].includes(url.protocol) ? url.origin : ""; } catch { return ""; }
  }
  function initialize() {
    if (!enabled()) return;
    (browser as unknown as Record<string, unknown>)[flag] = false;
    if (started) return;
    const gtag = tag();
    gtag("consent", "default", denied);
    gtag("consent", "update", { ...denied, analytics_storage: "granted" });
    gtag("js", new Date());
    gtag("config", settings.measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_prefix: prefix, cookie_domain: "none", cookie_path: cookiePath,
      page_location: location(), page_title: page.title, page_referrer: referrer(), ...(settings.debug ? { debug_mode: true } : {}) });
    if (!browser.document.querySelector("script[data-commerce-ga4]")) {
      const script = browser.document.createElement("script");
      script.async = true; script.dataset.commerceGa4 = "true";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(settings.measurementId)}`;
      browser.document.head.appendChild(script);
    }
    started = true;
  }
  function removeCookies() {
    for (const name of browser.document.cookie.split(";").map(value => value.split("=")[0].trim()).filter(name => name.startsWith(`${prefix}_`))) {
      for (const path of new Set([cookiePath, "/"])) browser.document.cookie = `${name}=; Max-Age=0; Path=${path}; SameSite=Lax`;
    }
  }
  function stop() {
    (browser as unknown as Record<string, unknown>)[flag] = true;
    try { if (started) browser.gtag?.("consent", "update", denied); } catch { /* A third-party failure must not interrupt the store. */ }
  }
  function track(name: AnalyticsEvent, parameters: AnalyticsParameters = {}) {
    if (!enabled()) return false;
    try {
      initialize();
      browser.gtag!("event", name, { ...safeAnalyticsParameters(parameters), send_to: settings.measurementId,
        page_location: location(), page_title: page.title, page_referrer: referrer(), transport_type: "beacon", ...(settings.debug ? { debug_mode: true } : {}) });
      return true;
    } catch { return false; }
  }
  return {
    getConsent: () => consent,
    privacySignal,
    setPage(path: string[]) { page = analyticsPage(path); },
    start() { try { initialize(); } catch { /* Optional measurement cannot block rendering. */ } },
    choose(choice: Exclude<AnalyticsConsent, null>) {
      consent = privacySignal ? "denied" : choice;
      try { browser.localStorage.setItem(consentKey, JSON.stringify({ choice: consent, expiresAt: Date.now() + 180 * 86400000 })); } catch { /* The current choice still applies in memory. */ }
      try {
        if (consent === "granted") {
          if (started) browser.gtag?.("consent", "update", { ...denied, analytics_storage: "granted" });
          initialize();
        } else { stop(); removeCookies(); }
      } catch { /* Keep the privacy choice even when a tag/storage is unavailable. */ }
      return consent;
    },
    track,
    once(key: string, name: AnalyticsEvent, parameters: AnalyticsParameters = {}) {
      if (sent.has(key) || !track(name, parameters)) return false;
      sent.add(key);
      if (sent.size > 200) sent.delete(sent.values().next().value!);
      try { browser.sessionStorage.setItem(onceKey, JSON.stringify([...sent])); } catch { /* In-memory deduplication still applies. */ }
      return true;
    },
    setTestMode(value: boolean) {
      if (blocked === value) return;
      blocked = value;
      if (value) stop();
      else { try { if (started && enabled()) browser.gtag?.("consent", "update", { ...denied, analytics_storage: "granted" }); initialize(); } catch { /* No impact on shopping. */ } }
    },
    dispose() { disposed = true; stop(); },
  };
}
